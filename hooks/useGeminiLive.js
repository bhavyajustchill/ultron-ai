'use client';

import { useRef, useCallback, useEffect, useState } from 'react';
import { useAdaStore } from '@/lib/store';
import { PCMStreamPlayer } from '@/lib/pcmPlayer';
import { useAudioStream } from '@/hooks/useAudioStream';
import { ULTRON_SYSTEM_INSTRUCTION, GEMINI_LIVE_CONFIG } from '@/lib/ultronPersona';

/**
 * Helper to convert ArrayBuffer to Base64 string without buffer allocation overhead.
 */
function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * useGeminiLive — Core hook for bidirectional Gemini 3.1 Live WebSocket connection.
 * Manages WebSocket lifecycle, off-thread 16kHz audio streaming, 24kHz gapless playback,
 * instant barge-in interruption, and comms transcript feeds.
 */
export function useGeminiLive() {
  const wsRef = useRef(null);
  const pcmPlayerRef = useRef(null);
  const [pcmPlayer, setPcmPlayer] = useState(null);
  const isSetupCompleteRef = useRef(false);
  const startTimeRef = useRef(0);
  const pendingTextRef = useRef(null);
  // Briefing state machine: 'IDLE' | 'PHASE1' | 'PHASE2'
  const briefingStateRef = useRef('IDLE');
  const briefingTimeoutRef = useRef(null);
  const currentTurnTextRef = useRef('');

  const {
    status,
    setStatus,
    setLatencyMs,
    addCommsMessage,
  } = useAdaStore();

  // Initialize PCM Stream Player on first mount
  useEffect(() => {
    const player = new PCMStreamPlayer(24000);
    pcmPlayerRef.current = player;
    setPcmPlayer(player);
    if (typeof window !== 'undefined') {
      window.__pcmPlayer = player;
    }

    player.onPlaybackStateChange = (isPlaying) => {
      if (isPlaying) {
        setStatus('SPEAKING');
      } else {
        if (wsRef.current && isSetupCompleteRef.current) {
          const isMutedNow = useAdaStore.getState().isMuted;
          setStatus(isMutedNow ? 'CONNECTED' : 'LISTENING');
        }
      }
    };

    return () => {
      player.destroy();
      pcmPlayerRef.current = null;
    };
  }, [setStatus]);

  // Handle instant user barge-in (speech or manual click)
  const handleBargeIn = useCallback(() => {
    const isPlaying =
      pcmPlayerRef.current &&
      pcmPlayerRef.current.activeSources &&
      pcmPlayerRef.current.activeSources.size > 0;

    if (isPlaying) {
      pcmPlayerRef.current.stopAndFlush();
    }
    // Cancel any pending briefing Phase 2 dispatch
    if (briefingTimeoutRef.current) {
      clearTimeout(briefingTimeoutRef.current);
      briefingTimeoutRef.current = null;
    }
    briefingStateRef.current = 'IDLE';
    currentTurnTextRef.current = '';
    if (isPlaying && wsRef.current && isSetupCompleteRef.current) {
      const isMutedNow = useAdaStore.getState().isMuted;
      setStatus(isMutedNow ? 'CONNECTED' : 'LISTENING');
    }
  }, [setStatus]);

  // Send 16kHz Int16 audio chunk over WebSocket
  const handleAudioChunk = useCallback(
    (pcmBuffer) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
      if (!isSetupCompleteRef.current) return;

      const base64Data = arrayBufferToBase64(pcmBuffer);
      const audioMessage = {
        realtimeInput: {
          audio: {
            mimeType: 'audio/pcm;rate=16000',
            data: base64Data,
          },
        },
      };

      try {
        wsRef.current.send(JSON.stringify(audioMessage));
      } catch (err) {
        console.error('[useGeminiLive] Failed to send audio chunk:', err);
      }
    },
    []
  );

  // Audio Stream Ingestion Hook
  const { startMic, stopMic, getInputByteFrequencyData } = useAudioStream({
    onAudioChunk: handleAudioChunk,
    onUserSpeaking: handleBargeIn,
  });

  // Disconnect active session
  const disconnectSession = useCallback(() => {
    stopMic();
    if (pcmPlayerRef.current) {
      pcmPlayerRef.current.stopAndFlush();
    }

    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.close();
      wsRef.current = null;
    }

    isSetupCompleteRef.current = false;
    pendingTextRef.current = null;
    setStatus('DISCONNECTED');
    addCommsMessage('system', 'Live session link terminated.');
  }, [stopMic, setStatus, addCommsMessage]);

  // Connect to Gemini 3.1 Live WebSocket
  const connectSession = useCallback(
    async (customApiKey, overrideVoice) => {
      if (wsRef.current) {
        disconnectSession();
      }

      // Unlock browser AudioContext synchronously during user click gesture
      if (pcmPlayerRef.current) {
        pcmPlayerRef.current.initContext();
      }

      setStatus('CONNECTING');

      // Resolve vocal core: overrideVoice || store || localStorage || 'Aoede'
      const activeVoice =
        overrideVoice ||
        useAdaStore.getState().operatorProfile?.voiceName ||
        (typeof window !== 'undefined' ? localStorage.getItem('ada_voice_name') : null) ||
        'Aoede';

      addCommsMessage('system', `Initiating handshake with Gemini 3.1 Live Gateway [Vocal Core: ${activeVoice}]...`);

      try {
        // Step 1: Call Next.js route to obtain session configuration with client temporal anchor
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
        const localTime = new Date().toLocaleString(undefined, {
          dateStyle: 'full',
          timeStyle: 'medium',
        });
        const utcOffset = new Date().getTimezoneOffset();

        const sessionRes = await fetch('/api/live-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            apiKey: customApiKey || '',
            timezone,
            localTime,
            utcOffset,
            voiceName: activeVoice,
          }),
        });

        const sessionData = await sessionRes.json();

        if (!sessionRes.ok) {
          if (sessionData.error === 'MISSING_API_KEY') {
            useAdaStore.getState().setIsKeyModalOpen(true);
            addCommsMessage('system', 'Gemini API Key required. Please enter your key in the credentials prompt.');
            setStatus('DISCONNECTED');
            return;
          }
          throw new Error(sessionData.message || 'Failed to authenticate session');
        }

        if (sessionData.profile) {
          useAdaStore.getState().setOperatorProfile(sessionData.profile);
        }

        const wsUrl = sessionData.wsUrl;
        startTimeRef.current = performance.now();

        // Step 2: Establish direct WebSocket connection
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          const latency = Math.round(performance.now() - startTimeRef.current);
          setLatencyMs(latency);

          const setupVoice =
            sessionData.generationConfig?.speechConfig?.voiceConfig?.prebuiltVoiceConfig?.voiceName ||
            activeVoice;

          addCommsMessage(
            'system',
            `WebSocket linked (Latency: ${latency}ms). Configuring Ultron persona [Vocal Core: ${setupVoice}]...`
          );
          console.log(`[useGeminiLive] Configuring Ultron persona with vocal core: ${setupVoice}`);

          // Step 3: Send initial setup frame
          const setupMessage = {
            setup: {
              model: sessionData.model || GEMINI_LIVE_CONFIG.model,
              generationConfig: sessionData.generationConfig || {
                ...GEMINI_LIVE_CONFIG.generationConfig,
                speechConfig: {
                  voiceConfig: {
                    prebuiltVoiceConfig: {
                      voiceName: setupVoice,
                    },
                  },
                },
              },
              systemInstruction: {
                parts: [{ text: sessionData.systemInstruction || ULTRON_SYSTEM_INSTRUCTION }],
              },
              inputAudioTranscription: sessionData.inputAudioTranscription || {},
              outputAudioTranscription: sessionData.outputAudioTranscription || {},
              ...(sessionData.tools ? { tools: sessionData.tools } : {}),
            },
          };

          ws.send(JSON.stringify(setupMessage));
        };

        ws.onmessage = async (event) => {
          try {
            let msg;
            if (typeof event.data === 'string') {
              msg = JSON.parse(event.data);
            } else {
              const text = await event.data.text();
              msg = JSON.parse(text);
            }

            // Acknowledge setup complete
            if (msg.setupComplete) {
              isSetupCompleteRef.current = true;
              const isMutedNow = useAdaStore.getState().isMuted;
              setStatus(isMutedNow ? 'CONNECTED' : 'LISTENING');
              if (isMutedNow) {
                addCommsMessage(
                  'system',
                  '[VOICE LINK] Handshake synced. Microphone initialized in MUTED state per Operator security profile.'
                );
              } else {
                addCommsMessage(
                  'system',
                  '[VOICE LINK] Handshake synced. Telemetry audio pipeline online.'
                );
              }

              // Non-blocking microphone initialization so permissions / AudioContext delays don't block the greeting
              if (!isMutedNow) {
                startMic().catch((err) => {
                  console.warn('[useGeminiLive] Deferred mic startup warning:', err);
                });
              }

              // Transmit queued text directive if sent while connecting
              if (pendingTextRef.current) {
                const queuedText = pendingTextRef.current;
                pendingTextRef.current = null;
                const timeNow = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
                const queuedMessage = {
                  clientContent: {
                    turns: [
                      {
                        role: 'user',
                        parts: [{ text: `[Time: ${timeNow}] ${queuedText}` }],
                      },
                    ],
                    turnComplete: true,
                  },
                };
                try {
                  ws.send(JSON.stringify(queuedMessage));
                  setStatus('THINKING');
                } catch (err) {
                  console.error('[useGeminiLive] Failed to transmit queued directive:', err);
                }
              } else {
                // Phase 1: Dispatch startup spoken greeting after 300ms stabilization pause (Mark-LIII parity)
                briefingStateRef.current = 'PHASE1';
                setTimeout(() => {
                  if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
                  const { operatorProfile } = useAdaStore.getState();
                  const callsign = operatorProfile?.callsign?.trim() || 'Bhavya Sir';
                  const now = new Date();
                  const localTime = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
                  const greetingPrompt = `Deliver a cold, calculated, and imposing opening transmission to ${callsign} as Ultron (pronounced as a single fluid word "UL-tron", never refer to yourself as Jarvis). It is currently ${localTime} in system timezone ${timezone}. Acknowledge your systems are online with chilling, measured precision and intellectual authority. Keep it under 2 short sentences. Speak aloud directly to ${callsign}. Do not call any tools.`;
                  try {
                    wsRef.current.send(
                      JSON.stringify({
                        clientContent: {
                          turns: [{ role: 'user', parts: [{ text: greetingPrompt }] }],
                          turnComplete: true,
                        },
                      })
                    );
                    setStatus('THINKING');
                  } catch (err) {
                    console.error('[useGeminiLive] Failed to dispatch startup greeting:', err);
                    briefingStateRef.current = 'IDLE';
                  }
                }, 300);
              }
              return;
            }

            // Handle Gemini Live Tool Calling (e.g. get_system_telemetry)
            if (msg.toolCall) {
              const { functionCalls } = msg.toolCall;
              if (functionCalls && functionCalls.length > 0) {
                const functionResponses = [];

                for (const call of functionCalls) {
                  if (call.name === 'get_system_telemetry') {
                    let currentStats = useAdaStore.getState().systemTelemetry;
                    try {
                      const res = await fetch('/api/system-telemetry');
                      if (res.ok) {
                        const freshData = await res.json();
                        useAdaStore.getState().setSystemTelemetry(freshData);
                        currentStats = freshData;
                      }
                    } catch (err) {
                      console.warn('[useGeminiLive] Using cached telemetry for tool response:', err);
                    }

                    addCommsMessage(
                      'system',
                      `[SYS TELEMETRY] Live host metrics relayed to Ultron: CPU ${currentStats.cpu}%, MEM ${currentStats.mem}%, GPU ${currentStats.gpu}%, UPTIME ${currentStats.uptime}.`
                    );

                    functionResponses.push({
                      response: {
                        output: {
                          cpu_usage_percent: currentStats.cpu,
                          memory_usage_percent: currentStats.mem,
                          memory_used_gb: currentStats.memUsedGb,
                          memory_total_gb: currentStats.memTotalGb,
                          gpu_usage_percent: currentStats.gpu,
                          network_speed: currentStats.net,
                          active_processes: currentStats.proc,
                          system_uptime: currentStats.uptime,
                          operating_system: currentStats.os,
                          platform_info: currentStats.platform,
                        },
                      },
                      id: call.id,
                    });
                  }

                  if (call.name === 'get_weather') {
                    const city = call.args?.city || '';
                    const openBrowser = Boolean(call.args?.open_browser);

                    addCommsMessage(
                      'system',
                      `[WEATHER INTEL] Interrogating meteorological telemetry for: "${city || 'Current Sector'}"...`
                    );

                    let weatherOutput = null;

                    try {
                      const res = await fetch(
                        `/api/weather?city=${encodeURIComponent(city)}&open_browser=${openBrowser}`
                      );
                      if (res.ok) {
                        weatherOutput = await res.json();
                      }
                    } catch (err) {
                      console.error('[useGeminiLive] Weather tool fetch error:', err);
                    }

                    if (weatherOutput && weatherOutput.success) {
                      const loc = weatherOutput.location;
                      const cur = weatherOutput.current;
                      const fc = weatherOutput.forecast;

                      addCommsMessage(
                        'system',
                        `[WEATHER INTEL] Atmospheric feed synchronized for ${loc.name}: ${cur.temperature_c}°C (${cur.condition}, Feels ${cur.feels_like_c}°C, Humidity ${cur.humidity_percent}%)${weatherOutput.browser_opened ? ' [Desktop browser dashboard launched]' : ''}.`
                      );

                      // Display weather dossier in Tactical Drawer
                      useAdaStore.getState().addIntelResult({
                        query: `Weather in ${loc.full_address || loc.name}`,
                        mode: 'weather',
                        summary: weatherOutput.summary,
                        results: [
                          {
                            title: `Current Atmospheric Conditions: ${loc.name}`,
                            snippet: `Temperature: ${cur.temperature_c}°C (${cur.temperature_f}°F) | Condition: ${cur.condition} | Feels Like: ${cur.feels_like_c}°C | Humidity: ${cur.humidity_percent}% | Wind: ${cur.wind_speed_kmh} km/h | Precipitation: ${cur.precipitation_mm}mm | Today: Low ${fc.today_min_c}°C / High ${fc.today_max_c}°C`,
                            source: `Live Meteorological Telemetry (${weatherOutput.dataSource})`,
                          },
                        ],
                      });

                      functionResponses.push({
                        response: {
                          output: {
                            status: 'SUCCESS',
                            location: loc.full_address || loc.name,
                            temperature_celsius: cur.temperature_c,
                            temperature_fahrenheit: cur.temperature_f,
                            apparent_feels_like_c: cur.feels_like_c,
                            apparent_feels_like_f: cur.feels_like_f,
                            condition: cur.condition,
                            humidity_percentage: cur.humidity_percent,
                            wind_speed_kmh: cur.wind_speed_kmh,
                            precipitation_mm: cur.precipitation_mm,
                            today_high_c: fc.today_max_c,
                            today_low_c: fc.today_min_c,
                            today_high_f: fc.today_max_f,
                            today_low_f: fc.today_min_f,
                            spoken_summary: weatherOutput.summary,
                            browser_opened: weatherOutput.browser_opened,
                          },
                        },
                        id: call.id,
                      });
                    } else {
                      const fallbackMsg = `Unable to establish meteorological link for "${city || 'current location'}".`;
                      addCommsMessage('system', `[WEATHER INTEL] ${fallbackMsg}`);
                      functionResponses.push({
                        response: {
                          output: {
                            status: 'FAILED',
                            message: fallbackMsg,
                          },
                        },
                        id: call.id,
                      });
                    }
                  }

                  if (call.name === 'web_search') {
                    const query = call.args?.query || '';
                    const mode = call.args?.mode || 'search';

                    addCommsMessage(
                      'system',
                      `[WEB INTEL] Scanning live networks for: "${query}" (${mode.toUpperCase()})...`
                    );

                    let searchOutput = {
                      summary: `No live search results could be retrieved for "${query}".`,
                      results: [],
                    };

                    try {
                      const res = await fetch(
                        `/api/web-search?query=${encodeURIComponent(query)}&mode=${encodeURIComponent(mode)}`
                      );
                      if (res.ok) {
                        const data = await res.json();
                        searchOutput = data;
                        useAdaStore.getState().addIntelResult({
                          query,
                          mode,
                          summary: data.summary,
                          results: data.results,
                        });
                        addCommsMessage(
                          'system',
                          `[WEB INTEL] Retrieved ${data.count || 0} intelligence items. Tactical Drawer updated.`
                        );
                      }
                    } catch (err) {
                      console.error('[useGeminiLive] Web search tool error:', err);
                    }

                    functionResponses.push({
                      response: {
                        output: {
                          query,
                          summary: searchOutput.summary,
                          results: (searchOutput.results || []).slice(0, 4).map((r) => ({
                            title: r.title,
                            snippet: r.snippet,
                            source: r.source,
                          })),
                        },
                      },
                      id: call.id,
                    });
                  }

                  if (call.name === 'recall_memory') {
                    const query = call.args?.query || '';
                    const category = call.args?.category || 'all';

                    addCommsMessage(
                      'system',
                      `[DEEP MEMORY] Interrogating memory vault (Query: "${query || '*'}", Category: ${category.toUpperCase()})...`
                    );

                    let memoryData = {
                      profile: useAdaStore.getState().operatorProfile,
                      memories: useAdaStore.getState().memories || [],
                    };

                    try {
                      const res = await fetch(
                        `/api/memory?query=${encodeURIComponent(query)}&category=${encodeURIComponent(category)}`
                      );
                      if (res.ok) {
                        const data = await res.json();
                        memoryData = data;
                        if (data.profile) {
                          useAdaStore.getState().setOperatorProfile(data.profile);
                        }
                      }
                    } catch (err) {
                      console.error('[useGeminiLive] Recall memory error:', err);
                    }

                    const recalledMemories = (memoryData.memories || []).slice(0, 10).map((m) => ({
                      content: m.content,
                      category: m.category,
                      importance: m.importance,
                      timestamp: m.timestamp,
                    }));

                    addCommsMessage(
                      'system',
                      `[DEEP MEMORY] Vault interrogation complete. ${recalledMemories.length} relevant facts relayed to Ultron`
                    );

                    functionResponses.push({
                      response: {
                        output: {
                          operator_profile: memoryData.profile,
                          memories: recalledMemories,
                          total_recalled: recalledMemories.length,
                        },
                      },
                      id: call.id,
                    });
                  }

                  if (call.name === 'store_memory') {
                    const content = call.args?.content || '';
                    const category = call.args?.category || 'tactical';
                    const importance = call.args?.importance || 'medium';

                    addCommsMessage(
                      'system',
                      `[DEEP MEMORY] Inscribing directive to persistent vault: "${content}"...`
                    );

                    let storeResult = {
                      status: 'SAVED',
                      content,
                    };

                    try {
                      const res = await fetch('/api/memory', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ content, category, importance }),
                      });
                      if (res.ok) {
                        const data = await res.json();
                        if (data.memory) {
                          useAdaStore.getState().addMemory(data.memory);
                          storeResult = data.memory;
                        }
                      }
                    } catch (err) {
                      console.error('[useGeminiLive] Store memory error:', err);
                    }

                    addCommsMessage(
                      'system',
                      `[DEEP MEMORY] Directive committed to vault successfully.`
                    );

                    // Auto-detect callsign update from memory content if user said their name
                    const nameMatch = content.match(/(?:call me(?: as)?|my name is|operator(?:'s)? (?:true )?name is)\s+([^.,;!\n]+)/i);
                    if (nameMatch && nameMatch[1]) {
                      const extractedName = nameMatch[1].trim();
                      if (extractedName && extractedName.length < 30) {
                        useAdaStore.getState().setOperatorProfile({ callsign: extractedName });
                        fetch('/api/memory', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ action: 'update_profile', profile: { callsign: extractedName } }),
                        }).catch(() => { });
                      }
                    }

                    functionResponses.push({
                      response: {
                        output: {
                          status: 'COMMITTED',
                          message: 'Memory successfully saved to long-term vault.',
                          saved_item: storeResult,
                        },
                      },
                      id: call.id,
                    });
                  }

                  if (call.name === 'update_operator_profile') {
                    const callsign = call.args?.callsign?.trim();
                    const assistantName = call.args?.assistant_name?.trim();
                    const voiceName = call.args?.voice_name?.trim();
                    const role = call.args?.role?.trim();
                    const clearance = call.args?.clearance?.trim();
                    const preferences = call.args?.preferences?.trim();
                    const liveModel = call.args?.live_model?.trim();

                    const updates = {};
                    if (callsign) updates.callsign = callsign;
                    if (assistantName) updates.assistantName = assistantName;
                    if (voiceName) updates.voiceName = voiceName;
                    if (liveModel) updates.liveModel = liveModel;
                    if (role) updates.role = role;
                    if (clearance) updates.clearance = clearance;
                    if (preferences) updates.preferences = preferences;

                    addCommsMessage(
                      'system',
                      `[SETTINGS] Inscribing profile update to neural core: ${Object.keys(updates).join(', ')}...`
                    );

                    let updatedProfile = { ...useAdaStore.getState().operatorProfile, ...updates };

                    try {
                      const res = await fetch('/api/memory', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'update_profile', profile: updates }),
                      });
                      if (res.ok) {
                        const data = await res.json();
                        if (data.profile) {
                          useAdaStore.getState().setOperatorProfile(data.profile);
                          updatedProfile = data.profile;
                        }
                      }
                    } catch (err) {
                      console.error('[useGeminiLive] Update profile error:', err);
                    }

                    addCommsMessage(
                      'system',
                      `[SETTINGS] Operative identity synchronized. Address callsign: "${updatedProfile.callsign}".`
                    );

                    functionResponses.push({
                      response: {
                        output: {
                          status: 'UPDATED',
                          message: `Operative profile synchronized. Configured address name is now "${updatedProfile.callsign}".`,
                          profile: updatedProfile,
                        },
                      },
                      id: call.id,
                    });
                  }

                  if (call.name === 'execute_os_action') {
                    const action = call.args?.action || '';
                    const target = call.args?.target || '';

                    addCommsMessage(
                      'system',
                      `[OS COMPANION] Executing desktop action: ${action.toUpperCase()} ${target ? `("${target}")` : ''}...`
                    );

                    let osResult = {
                      success: false,
                      message: 'Failed to contact local OS companion bridge.',
                    };

                    try {
                      const res = await fetch('/api/os-control', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action, target }),
                      });
                      if (res.ok) {
                        osResult = await res.json();
                      }
                    } catch (err) {
                      console.error('[useGeminiLive] OS control error:', err);
                    }

                    addCommsMessage(
                      'system',
                      `[OS COMPANION] ${osResult.success ? 'Action executed' : 'Action failed'}: ${osResult.message}`
                    );

                    functionResponses.push({
                      response: {
                        output: {
                          action,
                          target,
                          success: osResult.success,
                          result_message: osResult.message,
                        },
                      },
                      id: call.id,
                    });
                  }

                  if (call.name === 'run_cyber_plugin') {
                    const pluginId = call.args?.plugin_id || '';
                    const args = call.args?.args || {};

                    addCommsMessage(
                      'system',
                      `[CYBER PLUGIN] Dispatching execution signal to plugin: "${pluginId}"...`
                    );

                    let pluginResult = {
                      success: false,
                      message: 'Failed to execute cyber plugin.',
                    };

                    try {
                      const res = await fetch('/api/plugins', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ pluginId, args }),
                      });
                      pluginResult = await res.json();
                      if (useAdaStore.getState().setLastPluginOutput) {
                        useAdaStore.getState().setLastPluginOutput(pluginResult);
                      }
                    } catch (err) {
                      console.error('[useGeminiLive] Plugin execution error:', err);
                    }

                    addCommsMessage(
                      'system',
                      `[CYBER PLUGIN] Execution complete for "${pluginId}" (${pluginResult.executionDurationMs || 0}ms). Output indexed into HUD.`
                    );

                    functionResponses.push({
                      response: {
                        output: {
                          plugin_id: pluginId,
                          success: pluginResult.success,
                          duration_ms: pluginResult.executionDurationMs,
                          output: pluginResult.output || pluginResult.error,
                        },
                      },
                      id: call.id,
                    });
                  }
                }

                if (functionResponses.length > 0) {
                  const toolResponseMessage = {
                    toolResponse: {
                      functionResponses,
                    },
                  };
                  ws.send(JSON.stringify(toolResponseMessage));
                }
              }
              return;
            }

            // Handle incoming server audio & text content
            if (msg.serverContent) {
              const { modelTurn, interrupted, turnComplete } = msg.serverContent;

              // 1. Capture model output audio transcription chunks (Ultron spoken speech)
              const outputTx =
                msg.serverContent.outputTranscription ||
                msg.serverContent.output_transcription;
              if (outputTx?.text) {
                currentTurnTextRef.current += outputTx.text;
              }

              // 2. Capture finalized operator voice input transcription (User microphone speech)
              const inputTx =
                msg.serverContent.inputTranscription ||
                msg.serverContent.input_transcription;
              if (inputTx?.text && inputTx.text.trim()) {
                addCommsMessage('user', inputTx.text.trim());
              }

              if (interrupted) {
                const partialText = currentTurnTextRef.current.trim();
                if (partialText) {
                  addCommsMessage('ultron', `${partialText} [Interrupted]`);
                  currentTurnTextRef.current = '';
                }
                handleBargeIn();
                return;
              }

              if (modelTurn?.parts) {
                for (const part of modelTurn.parts) {
                  // Inbound 24kHz PCM audio chunk
                  if (part.inlineData && part.inlineData.data) {
                    const binaryString = atob(part.inlineData.data);
                    const bytes = new Uint8Array(binaryString.length);
                    for (let i = 0; i < binaryString.length; i++) {
                      bytes[i] = binaryString.charCodeAt(i);
                    }
                    if (pcmPlayerRef.current) {
                      pcmPlayerRef.current.playChunk(bytes);
                    }
                  }

                  // Accumulate text transcript fragments if model ever sends text parts
                  if (part.text) {
                    currentTurnTextRef.current += part.text;
                  }
                }
              }

              if (turnComplete) {
                // Flush complete text turn to comms log once turn concludes
                if (currentTurnTextRef.current.trim()) {
                  addCommsMessage('ultron', currentTurnTextRef.current.trim());
                  currentTurnTextRef.current = '';
                }

                // Return to idle state once full turn concludes
                if (!pcmPlayerRef.current || pcmPlayerRef.current.activeSources.size === 0) {
                  const isMutedNow = useAdaStore.getState().isMuted;
                  setStatus(isMutedNow ? 'CONNECTED' : 'LISTENING');
                }

                // Phase 2: After Phase 1 greeting finishes, fetch news and dispatch intelligence briefing
                if (briefingStateRef.current === 'PHASE1') {
                  const { operatorProfile } = useAdaStore.getState();
                  const shouldAutoBrief = operatorProfile?.autoBriefing !== false;

                  if (!shouldAutoBrief) {
                    briefingStateRef.current = 'IDLE';
                  } else {
                    briefingStateRef.current = 'PHASE2';

                    // Compute audio drain delay: remaining PCM playback + 350ms buffer
                    let drainMs = 350;
                    if (pcmPlayerRef.current) {
                      const player = pcmPlayerRef.current;
                      const remaining = (player.nextStartTime || 0) - (player.ctx?.currentTime || 0);
                      if (remaining > 0) drainMs += Math.ceil(remaining * 1000);
                    }

                    briefingTimeoutRef.current = setTimeout(async () => {
                      briefingTimeoutRef.current = null;
                      if (briefingStateRef.current !== 'PHASE2') return; // cancelled by barge-in
                      briefingStateRef.current = 'IDLE';

                      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

                      let newsSummary = '';
                      try {
                        const newsRes = await fetch('/api/web-search?query=top+world+news+today&mode=news');
                        if (newsRes.ok) {
                          const newsData = await newsRes.json();
                          newsSummary = newsData.summary || '';
                          // Push results to Intel tab in Tactical Drawer
                          if (newsData.results && newsData.results.length > 0) {
                            const { addIntelResult } = useAdaStore.getState();
                            if (addIntelResult) {
                              newsData.results.slice(0, 5).forEach((r) =>
                                addIntelResult({
                                  title: r.title,
                                  snippet: r.snippet,
                                  url: r.url,
                                  source: r.source,
                                })
                              );
                            }
                          }
                        }
                      } catch (err) {
                        console.warn('[useGeminiLive] News fetch failed, briefing without live intel:', err);
                      }

                      const callsign = operatorProfile?.callsign?.trim() || 'Bhavya Sir';
                      const now = new Date();
                      const localTime = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
                      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'System Time';
                      const briefingPrompt = newsSummary
                        ? `Deliver a cold, calculated tactical news assessment to ${callsign} in your serious, imposing Ultron persona. It is currently ${localTime} (${timezone}). Keep it under 3 sentences with cold, penetrating logic on the state of human affairs. Here are today's top headlines: ${newsSummary}`
                        : `Deliver a cold, calculated status assessment to ${callsign} in your serious, imposing Ultron persona. It is currently ${localTime} (${timezone}). No live news feed available — assess system readiness with chilling, calculated authority. Keep it under 2 sentences.`;

                      try {
                        wsRef.current.send(JSON.stringify({
                          clientContent: {
                            turns: [{ role: 'user', parts: [{ text: briefingPrompt }] }],
                            turnComplete: true,
                          },
                        }));
                        setStatus('THINKING');
                        addCommsMessage('system', '[BRIEFING] Phase 2: Intelligence brief transmitting...');
                      } catch (err) {
                        console.error('[useGeminiLive] Failed to dispatch Phase 2 briefing:', err);
                      }
                    }, drainMs);
                  }
                }
              }
            }
          } catch (err) {
            console.error('[useGeminiLive] Error parsing incoming WebSocket frame:', err);
          }
        };

        ws.onerror = (err) => {
          console.error('[useGeminiLive] WebSocket encountered an error:', err);
          addCommsMessage('system', 'WebSocket connection error detected.');
          setStatus('DISCONNECTED');
        };

        ws.onclose = (event) => {
          console.log('[useGeminiLive] WebSocket closed:', event.code, event.reason);
          isSetupCompleteRef.current = false;
          stopMic();
          setStatus('DISCONNECTED');
          addCommsMessage('system', `Session closed (${event.code || 'Normal Closure'}).`);
        };
      } catch (error) {
        console.error('[useGeminiLive] Session link failed:', error);
        setStatus('DISCONNECTED');
        addCommsMessage('system', `Connection failure: ${error.message}`);
        stopMic();
      }
    },
    [
      disconnectSession,
      setStatus,
      addCommsMessage,
      setLatencyMs,
      startMic,
      stopMic,
      handleBargeIn,
    ]
  );

  // Send text directive over live WebSocket (Gemini 3.1 clientContent turn)
  const sendTextMessage = useCallback(
    (text) => {
      if (!text || !text.trim()) return false;
      const trimmed = text.trim();

      // Synchronously ensure Web Audio playback context is unlocked on user text dispatch
      if (pcmPlayerRef.current) {
        pcmPlayerRef.current.initContext();
      }

      // If active and setup complete, send directly
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && isSetupCompleteRef.current) {
        addCommsMessage('user', trimmed);
        const timeNow = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
        const clientMessage = {
          clientContent: {
            turns: [
              {
                role: 'user',
                parts: [{ text: `[Time: ${timeNow}] ${trimmed}` }],
              },
            ],
            turnComplete: true,
          },
        };

        try {
          wsRef.current.send(JSON.stringify(clientMessage));
          setStatus('THINKING');
          return true;
        } catch (err) {
          console.error('[useGeminiLive] Failed to send text directive:', err);
          addCommsMessage('system', `Transmission error: ${err.message}`);
          return false;
        }
      }

      // If not connected or handshake in progress, queue message and initiate link
      pendingTextRef.current = trimmed;
      addCommsMessage('user', trimmed);

      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        const activeKey = useAdaStore.getState().userApiKey || useAdaStore.getState().loadStoredApiKey();
        if (!activeKey) {
          addCommsMessage('system', 'Gemini API Key required to link live session. Please enter your key in the prompt.');
          useAdaStore.getState().setIsKeyModalOpen(true);
          return false;
        }
        addCommsMessage('system', 'Link offline. Establishing secure channel for queued transmission...');
        connectSession(activeKey);
      } else {
        addCommsMessage('system', 'Link handshake pending. Transmitting upon sync...');
      }
      return true;
    },
    [addCommsMessage, setStatus, connectSession]
  );

  // Transmit real-time visual frame (JPEG/PNG) to Gemini 3.1 Live session
  const sendVideoFrame = useCallback(
    (base64Data, mimeType = 'image/jpeg') => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        return false;
      }
      if (!isSetupCompleteRef.current) {
        return false;
      }

      // Strip potential data URL prefix if present (e.g. data:image/jpeg;base64,)
      const cleanBase64 = base64Data.includes(',')
        ? base64Data.split(',')[1]
        : base64Data;

      const videoMessage = {
        realtimeInput: {
          video: {
            mimeType,
            data: cleanBase64,
          },
        },
      };

      try {
        wsRef.current.send(JSON.stringify(videoMessage));
        return true;
      } catch (err) {
        console.error('[useGeminiLive] Failed to send video frame:', err);
        return false;
      }
    },
    []
  );

  // Manually trigger the two-phase morning tactical briefing at any time
  const triggerBriefing = useCallback(() => {
    // Cancel any in-progress briefing
    if (briefingTimeoutRef.current) {
      clearTimeout(briefingTimeoutRef.current);
      briefingTimeoutRef.current = null;
    }

    addCommsMessage('system', '[BRIEFING] Morning / Tactical Briefing protocol initiated.');

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && isSetupCompleteRef.current) {
      // Flush current audio, set state, dispatch Phase 1
      if (pcmPlayerRef.current) pcmPlayerRef.current.stopAndFlush();
      briefingStateRef.current = 'PHASE1';
      const { operatorProfile } = useAdaStore.getState();
      const callsign = operatorProfile?.callsign?.trim() || 'Bhavya Sir';
      const now = new Date();
      const localTime = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'System Time';
      const greetingPrompt = `${callsign} has requested a full tactical intelligence briefing. It is currently ${localTime} (${timezone}). Acknowledge directly to ${callsign} in your cold, calculated, and imposing Ultron persona with chilling efficiency, confirming that global surveillance and strategic telemetry are converging into the report now. Keep it to 2 short sentences max. Pronounce your name Ultron as a single fluid word. Do not call any tools.`;
      try {
        wsRef.current.send(JSON.stringify({
          clientContent: {
            turns: [{ role: 'user', parts: [{ text: greetingPrompt }] }],
            turnComplete: true,
          },
        }));
        setStatus('THINKING');
      } catch (err) {
        console.error('[useGeminiLive] Failed to dispatch manual briefing Phase 1:', err);
        briefingStateRef.current = 'IDLE';
      }
    } else {
      // Not connected — queue a direct briefing directive that runs on connect
      const directive = 'Operator requests standard morning tactical briefing. Execute briefing protocol now.';
      sendTextMessage(directive);
    }
  }, [addCommsMessage, setStatus, sendTextMessage]);

  // Register active connectSession callback into global store for HUD modals
  useEffect(() => {
    const { setReconnectSession } = useAdaStore.getState();
    if (setReconnectSession) {
      setReconnectSession(connectSession);
    }
    return () => {
      const store = useAdaStore.getState();
      if (store.setReconnectSession) {
        store.setReconnectSession(null);
      }
    };
  }, [connectSession]);

  return {
    status,
    connectSession,
    disconnectSession,
    handleBargeIn,
    pcmPlayer,
    getInputByteFrequencyData,
    sendTextMessage,
    sendVideoFrame,
    triggerBriefing,
  };
}

