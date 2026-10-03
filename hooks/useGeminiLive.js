'use client';

import { useRef, useCallback, useEffect, useState } from 'react';
import { useAdaStore } from '@/lib/store';
import { PCMStreamPlayer } from '@/lib/pcmPlayer';
import { useAudioStream } from '@/hooks/useAudioStream';
import { JARVIS_SYSTEM_INSTRUCTION, GEMINI_LIVE_CONFIG, GEMINI_LIVE_LABEL } from '@/lib/jarvisPersona';

// Auto-reconnect backoff for dropped live links: 0.5s, 1s, 2s, 4s, 8s
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_BASE_DELAY_MS = 500;
// A link must stay up this long before the backoff counter resets (stops tight loops,
// e.g. when the server accepts setup and immediately closes on exhausted quota)
const STABLE_LINK_MS = 30000;

/**
 * Parses a protobuf Duration JSON string (e.g. "12s", "0.5s") into milliseconds.
 */
function parseDurationMs(duration, fallbackMs) {
  const seconds = parseFloat(duration);
  return Number.isFinite(seconds) ? seconds * 1000 : fallbackMs;
}

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
 * useGeminiLive — Core hook for bidirectional Gemini 3.8 Live WebSocket connection.
 * Manages WebSocket lifecycle, off-thread 16kHz audio streaming, 24kHz gapless playback,
 * instant barge-in interruption, session resumption / auto-reconnect, and comms transcript feeds.
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

  // Session resumption & auto-reconnect state
  const sessionDataRef = useRef(null);
  const apiKeyRef = useRef('');
  const voiceRef = useRef(null);
  const resumeHandleRef = useRef(null);
  const isEstablishedRef = useRef(false);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef(null);
  const linkUpSinceRef = useRef(0);
  const goAwayPendingRef = useRef(false);
  const goAwayTimerRef = useRef(null);
  const isTurnActiveRef = useRef(false);
  const cancelledToolIdsRef = useRef(new Set());
  const connectSessionRef = useRef(null);

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

  // Clear all resumption / reconnect bookkeeping (manual connect or disconnect)
  const resetLinkState = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (goAwayTimerRef.current) {
      clearTimeout(goAwayTimerRef.current);
      goAwayTimerRef.current = null;
    }
    resumeHandleRef.current = null;
    isEstablishedRef.current = false;
    reconnectAttemptRef.current = 0;
    goAwayPendingRef.current = false;
    isTurnActiveRef.current = false;
    cancelledToolIdsRef.current.clear();
  }, []);

  // Disconnect active session
  const disconnectSession = useCallback(() => {
    resetLinkState();
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
  }, [resetLinkState, stopMic, setStatus, addCommsMessage]);

  // Re-establish a dropped link with exponential backoff, resuming the session when possible
  const scheduleReconnect = useCallback((reason) => {
    if (reconnectTimerRef.current) return;

    const attempt = reconnectAttemptRef.current;
    if (attempt >= MAX_RECONNECT_ATTEMPTS) {
      resetLinkState();
      stopMic();
      setStatus('DISCONNECTED');
      addCommsMessage(
        'system',
        `[VOICE LINK] Re-sync failed after repeated attempts${reason ? ` (${reason})` : ''}. Reconnect manually to resume.`
      );
      return;
    }

    reconnectAttemptRef.current = attempt + 1;
    const delayMs = RECONNECT_BASE_DELAY_MS * 2 ** attempt;
    setStatus('RECONNECTING');
    addCommsMessage(
      'system',
      `[VOICE LINK] Link dropped${reason ? ` (${reason})` : ''}. Re-syncing in ${delayMs / 1000}s (attempt ${attempt + 1}/${MAX_RECONNECT_ATTEMPTS})...`
    );

    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null;
      connectSessionRef.current?.(apiKeyRef.current, voiceRef.current, { resume: true });
    }, delayMs);
  }, [resetLinkState, stopMic, setStatus, addCommsMessage]);

  // Swap to a new socket with the latest resumption handle before the server closes the old one
  const resumeAfterGoAway = useCallback(() => {
    if (goAwayTimerRef.current) {
      clearTimeout(goAwayTimerRef.current);
      goAwayTimerRef.current = null;
    }
    if (!goAwayPendingRef.current) return;
    goAwayPendingRef.current = false;
    connectSessionRef.current?.(apiKeyRef.current, voiceRef.current, { resume: true });
  }, []);

  // Connect to Gemini Live WebSocket. `options.resume` re-links the cached session config
  // using the latest resumption handle (falls back to a fresh session without greeting).
  const connectSession = useCallback(
    async (customApiKey, overrideVoice, options = {}) => {
      const isResume = Boolean(options.resume && sessionDataRef.current);
      const resumeHandle = isResume ? resumeHandleRef.current : null;

      if (isResume) {
        // Silently retire the previous socket without tearing down mic or playback
        if (wsRef.current) {
          const staleWs = wsRef.current;
          staleWs.onopen = null;
          staleWs.onmessage = null;
          staleWs.onclose = null;
          staleWs.onerror = null;
          staleWs.close();
          wsRef.current = null;
        }
        isSetupCompleteRef.current = false;
        isTurnActiveRef.current = false;
        cancelledToolIdsRef.current.clear();
      } else {
        if (wsRef.current) {
          disconnectSession();
        }
        resetLinkState();
      }

      // Unlock browser AudioContext synchronously during user click gesture
      if (pcmPlayerRef.current) {
        pcmPlayerRef.current.initContext();
      }

      // Resolve vocal core: overrideVoice || store || localStorage || 'Aoede'
      const activeVoice = isResume
        ? voiceRef.current
        : overrideVoice ||
          useAdaStore.getState().operatorProfile?.voiceName ||
          (typeof window !== 'undefined' ? localStorage.getItem('ada_voice_name') : null) ||
          'Aoede';

      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

      if (isResume) {
        setStatus('RECONNECTING');
      } else {
        setStatus('CONNECTING');
        addCommsMessage('system', `Initiating handshake with ${GEMINI_LIVE_LABEL} Gateway [Vocal Core: ${activeVoice}]...`);
      }

      try {
        let sessionData = sessionDataRef.current;

        if (!isResume) {
          // Step 1: Call Next.js route to obtain session configuration with client temporal anchor
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

          sessionData = await sessionRes.json();

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

          // Cache config so a dropped link can be resumed without re-negotiating
          sessionDataRef.current = sessionData;
          apiKeyRef.current = customApiKey;
          voiceRef.current = activeVoice;
        }

        const wsUrl = sessionData.wsUrl;
        startTimeRef.current = performance.now();

        // Step 2: Establish direct WebSocket connection
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;
        let didOpen = false;

        ws.onopen = () => {
          didOpen = true;
          const latency = Math.round(performance.now() - startTimeRef.current);
          setLatencyMs(latency);

          const setupVoice =
            sessionData.generationConfig?.speechConfig?.voiceConfig?.prebuiltVoiceConfig?.voiceName ||
            activeVoice;

          if (isResume) {
            addCommsMessage(
              'system',
              `WebSocket re-linked (Latency: ${latency}ms). ${resumeHandle ? 'Restoring session context...' : 'Resume token unavailable, starting a fresh session...'}`
            );
          } else {
            addCommsMessage(
              'system',
              `WebSocket linked (Latency: ${latency}ms). Configuring J.A.R.V.I.S persona [Vocal Core: ${setupVoice}]...`
            );
          }
          console.log(`[useGeminiLive] Configuring J.A.R.V.I.S persona with vocal core: ${setupVoice}`);

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
                parts: [{ text: sessionData.systemInstruction || JARVIS_SYSTEM_INSTRUCTION }],
              },
              inputAudioTranscription: sessionData.inputAudioTranscription || {},
              outputAudioTranscription: sessionData.outputAudioTranscription || {},
              contextWindowCompression:
                sessionData.contextWindowCompression || GEMINI_LIVE_CONFIG.contextWindowCompression,
              sessionResumption: resumeHandle ? { handle: resumeHandle } : {},
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
              isEstablishedRef.current = true;
              linkUpSinceRef.current = Date.now();
              const isMutedNow = useAdaStore.getState().isMuted;
              const isPlayingNow = pcmPlayerRef.current?.activeSources?.size > 0;
              setStatus(isPlayingNow ? 'SPEAKING' : isMutedNow ? 'CONNECTED' : 'LISTENING');
              if (isResume) {
                addCommsMessage(
                  'system',
                  resumeHandle
                    ? '[VOICE LINK] Session re-synced. Conversation context restored.'
                    : '[VOICE LINK] Link restored on a fresh session.'
                );
              } else if (isMutedNow) {
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
              } else if (!isResume) {
                // Phase 1: Dispatch startup spoken greeting after 300ms stabilization pause (Mark-LIII parity)
                briefingStateRef.current = 'PHASE1';
                setTimeout(() => {
                  if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
                  const { operatorProfile } = useAdaStore.getState();
                  const callsign = operatorProfile?.callsign?.trim() || 'Bhavya Sir';
                  const enableHumor = operatorProfile?.enableHumor !== false;
                  const now = new Date();
                  const localTime = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
                  const greetingPrompt = `Greet ${callsign} warmly and concisely in-character as Jarvis (pronounced as a single word "JAR-vis", never spell it out as letters). It is currently ${localTime} in system timezone ${timezone}. Confirm your systems are online and you are standing by${enableHumor
                      ? ', adding a subtle touch of signature Jarvis dry British wit or playful irony appropriate for the time of day'
                      : ' with refined, composed British professionalism'
                    }. Keep it under 2 short sentences. Speak aloud directly to ${callsign}. Do not call any tools.`;
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

            // Track the latest resumption handle so a dropped link can restore context
            if (msg.sessionResumptionUpdate) {
              const { newHandle, resumable } = msg.sessionResumptionUpdate;
              if (resumable && newHandle) {
                resumeHandleRef.current = newHandle;
              }
              return;
            }

            // Server will close this connection soon: re-link at the next idle moment,
            // or just before the deadline if Jarvis is still mid-turn
            if (msg.goAway) {
              const timeLeftMs = parseDurationMs(msg.goAway.timeLeft, 5000);
              console.log(`[useGeminiLive] GoAway received, ${timeLeftMs}ms left on this connection.`);
              goAwayPendingRef.current = true;
              if (!isTurnActiveRef.current) {
                resumeAfterGoAway();
              } else if (!goAwayTimerRef.current) {
                goAwayTimerRef.current = setTimeout(resumeAfterGoAway, Math.max(0, timeLeftMs - 1000));
              }
              return;
            }

            // Server retracted pending tool calls (e.g. operator barged in)
            if (msg.toolCallCancellation) {
              for (const id of msg.toolCallCancellation.ids || []) {
                cancelledToolIdsRef.current.add(id);
              }
              return;
            }

            // Handle Gemini Live Tool Calling (e.g. get_system_telemetry)
            if (msg.toolCall) {
              isTurnActiveRef.current = true;
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
                      `[SYS TELEMETRY] Live host metrics relayed to J.A.R.V.I.S: CPU ${currentStats.cpu}%, MEM ${currentStats.mem}%, GPU ${currentStats.gpu}%, UPTIME ${currentStats.uptime}.`
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
                      `[DEEP MEMORY] Vault interrogation complete. ${recalledMemories.length} relevant facts relayed to J.A.R.V.I.S`
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
                  // Echo function names (3.8 Live response shape) and drop calls the server cancelled
                  const callNames = new Map(functionCalls.map((c) => [c.id, c.name]));
                  const cancelledIds = cancelledToolIdsRef.current;
                  const liveResponses = functionResponses
                    .filter((r) => !cancelledIds.has(r.id))
                    .map((r) => ({ ...r, name: callNames.get(r.id) }));
                  functionResponses.forEach((r) => cancelledIds.delete(r.id));

                  if (liveResponses.length > 0) {
                    const toolResponseMessage = {
                      toolResponse: {
                        functionResponses: liveResponses,
                      },
                    };
                    ws.send(JSON.stringify(toolResponseMessage));
                  }
                }
              }
              return;
            }

            // Handle incoming server audio & text content
            if (msg.serverContent) {
              const { modelTurn, interrupted, turnComplete } = msg.serverContent;

              // 1. Capture model output audio transcription chunks (Jarvis spoken speech)
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

              if (modelTurn) {
                isTurnActiveRef.current = true;
              }

              if (interrupted) {
                isTurnActiveRef.current = false;
                const partialText = currentTurnTextRef.current.trim();
                if (partialText) {
                  addCommsMessage('jarvis', `${partialText} [Interrupted]`);
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
                isTurnActiveRef.current = false;

                // Flush complete text turn to comms log once turn concludes
                if (currentTurnTextRef.current.trim()) {
                  addCommsMessage('jarvis', currentTurnTextRef.current.trim());
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

                      if (
                        !wsRef.current ||
                        wsRef.current.readyState !== WebSocket.OPEN ||
                        !isSetupCompleteRef.current
                      ) {
                        return;
                      }

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
                      const { operatorProfile } = useAdaStore.getState();
                      const enableHumor = operatorProfile?.enableHumor !== false;
                      const briefingPrompt = newsSummary
                        ? `Deliver a concise tactical news summary to ${callsign}${enableHumor ? ' in your signature dry British wit' : ' with composed, refined professionalism'
                        }. It is currently ${localTime} (${timezone}). Keep it under 3 sentences${enableHumor ? ' with a clever, subtle sign-off' : ' with a professional sign-off'
                        }. Here are today's top headlines: ${newsSummary}`
                        : `Deliver a concise status briefing to ${callsign}${enableHumor ? ' in your signature dry British wit' : ' with composed, refined professionalism'
                        }. It is currently ${localTime} (${timezone}). No live news feed available — deliver situational awareness${enableHumor ? ' with a witty observation' : ''
                        }. Keep it under 2 sentences.`;

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

                // Turn finished: complete any pending GoAway connection swap
                if (goAwayPendingRef.current) {
                  resumeAfterGoAway();
                }
              }
            }
          } catch (err) {
            console.error('[useGeminiLive] Error parsing incoming WebSocket frame:', err);
          }
        };

        // onclose always follows onerror and decides between re-sync and going offline
        ws.onerror = (err) => {
          console.error('[useGeminiLive] WebSocket encountered an error:', err);
          addCommsMessage('system', 'WebSocket connection error detected.');
        };

        ws.onclose = (event) => {
          console.log('[useGeminiLive] WebSocket closed:', event.code, event.reason);
          const failedBeforeSetup = !isSetupCompleteRef.current;
          isSetupCompleteRef.current = false;
          isTurnActiveRef.current = false;
          goAwayPendingRef.current = false;
          if (goAwayTimerRef.current) {
            clearTimeout(goAwayTimerRef.current);
            goAwayTimerRef.current = null;
          }

          // An established link dropped unexpectedly: auto re-sync instead of going offline
          if (isEstablishedRef.current) {
            // Socket opened but setup was refused: the resume handle is stale, start fresh next time
            if (resumeHandle && didOpen && failedBeforeSetup) {
              resumeHandleRef.current = null;
            }
            if (!failedBeforeSetup && Date.now() - linkUpSinceRef.current > STABLE_LINK_MS) {
              reconnectAttemptRef.current = 0;
            }
            scheduleReconnect(event.reason || (event.code ? `code ${event.code}` : ''));
            return;
          }

          stopMic();
          setStatus('DISCONNECTED');
          addCommsMessage(
            'system',
            `Session closed (${event.code || 'Normal Closure'}${event.reason ? `: ${event.reason}` : ''}).`
          );
        };
      } catch (error) {
        console.error('[useGeminiLive] Session link failed:', error);
        if (isResume && isEstablishedRef.current) {
          scheduleReconnect();
          return;
        }
        setStatus('DISCONNECTED');
        addCommsMessage('system', `Connection failure: ${error.message}`);
        stopMic();
      }
    },
    [
      disconnectSession,
      resetLinkState,
      scheduleReconnect,
      resumeAfterGoAway,
      setStatus,
      addCommsMessage,
      setLatencyMs,
      startMic,
      stopMic,
      handleBargeIn,
    ]
  );

  // Send text directive over live WebSocket (Gemini Live clientContent turn)
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

      // Auto re-sync in progress: let the resumed session deliver the queued text
      if (isEstablishedRef.current) {
        addCommsMessage('system', 'Link re-syncing. Transmitting upon sync...');
        return true;
      }

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

  // Transmit real-time visual frame (JPEG/PNG) to Gemini Live session
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
      const enableHumor = operatorProfile?.enableHumor !== false;
      const now = new Date();
      const localTime = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'System Time';
      const greetingPrompt = `${callsign} has requested a full tactical briefing. It is currently ${localTime} (${timezone}). Acknowledge directly to ${callsign} in your ${enableHumor ? 'signature witty Jarvis persona' : 'composed, professional Jarvis persona'
        } and confirm you are assembling the intelligence report now. Keep it to 2 short sentences max. Do not call any tools.`;
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

  // Cancel pending re-sync / GoAway timers on unmount
  useEffect(() => resetLinkState, [resetLinkState]);

  // Register active connectSession callback into global store for HUD modals
  useEffect(() => {
    connectSessionRef.current = connectSession;
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

