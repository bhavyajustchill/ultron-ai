'use client';

import { useRef, useCallback, useEffect, useState } from 'react';
import { useJarvisStore } from '@/lib/store';
import { PCMStreamPlayer } from '@/lib/pcmPlayer';
import { useAudioStream } from '@/hooks/useAudioStream';
import { JARVIS_SYSTEM_INSTRUCTION, GEMINI_LIVE_CONFIG, GEMINI_LIVE_LABEL } from '@/lib/jarvisPersona';
import { modelFileUrl, openModelViewer, playYouTubeQuery } from '@/lib/mediaClient';
import { DEFAULT_WAKE_PHRASE } from '@/lib/wakePhrase';
import { runCommandWithApproval } from '@/lib/terminalClient';
import { TOOLS_BY_NAME } from '@/lib/tools';

// Auto-reconnect backoff for dropped live links: 0.5s, 1s, 2s, 4s, 8s
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_BASE_DELAY_MS = 500;
// Keys without Google Search grounding quota refuse setups that include it; remember for a while
const GROUNDING_REFUSED_KEY = 'jarvis_grounding_unavailable_until';
const GROUNDING_REFUSED_TTL_MS = 12 * 60 * 60 * 1000;

function isGroundingKnownUnavailable() {
  try {
    return Date.now() < Number(localStorage.getItem(GROUNDING_REFUSED_KEY) || 0);
  } catch {
    return false;
  }
}

function rememberGroundingUnavailable() {
  try {
    localStorage.setItem(GROUNDING_REFUSED_KEY, String(Date.now() + GROUNDING_REFUSED_TTL_MS));
  } catch {
    // Storage unavailable: the fallback still works, it just repeats next time
  }
}
// A link must stay up this long before the backoff counter resets (stops tight loops,
// e.g. when the server accepts setup and immediately closes on exhausted quota)
const STABLE_LINK_MS = 30000;

// Recent dialogue carried into a fresh session when settings change (voice / persona / profile)
const HANDOFF_TURNS = 20;

/**
 * Rebuilds the recent conversation from the Comms Log as alternating user / model turns. A resumed
 * session keeps its original system instruction, so settings changes open a fresh session seeded
 * with this history instead (verified against 3.8 Live: history kept, new instruction applied).
 */
function buildHandoffTurns(commsLog) {
  const turns = [];
  for (const { sender, text } of commsLog.slice(-80)) {
    const role = sender === 'user' ? 'user' : sender === 'jarvis' ? 'model' : null;
    if (!role || !text) continue;
    const clean = text.replace(/\s*\[Interrupted\]$/, '').slice(0, 600);
    const last = turns[turns.length - 1];
    if (last?.role === role) last.parts[0].text += `\n${clean}`;
    else turns.push({ role, parts: [{ text: clean }] });
  }
  const recent = turns.slice(-HANDOFF_TURNS);
  // Seeded history starts with the operator (the shape verified against Live)
  while (recent[0]?.role === 'model') recent.shift();
  return recent;
}

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
  const pendingPartsRef = useRef(null);
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
  // A connect attempt (including its setup retries) is in flight: sends queue instead of re-linking
  const linkPendingRef = useRef(false);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef(null);
  const linkUpSinceRef = useRef(0);
  const goAwayPendingRef = useRef(false);
  const goAwayTimerRef = useRef(null);
  const isTurnActiveRef = useRef(false);
  const cancelledToolIdsRef = useRef(new Set());
  const groundingRef = useRef({ queries: new Set(), sources: new Map() });
  const connectSessionRef = useRef(null);
  const projectPollersRef = useRef(new Map());
  const standbyRequestedRef = useRef(false);
  const relinkRequestedRef = useRef(false);

  const {
    status,
    setStatus,
    setLatencyMs,
    addCommsMessage,
  } = useJarvisStore();

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
          const isMutedNow = useJarvisStore.getState().isMuted;
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
      const isMutedNow = useJarvisStore.getState().isMuted;
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
    linkPendingRef.current = false;
    pendingTextRef.current = null;
    pendingPartsRef.current = null;
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

  // Run `fn` once Jarvis has finished speaking (800 ms grace for a reply that starts as a fresh turn, 20 s cap)
  const runWhenQuiet = useCallback((fn) => {
    const startedAt = Date.now();
    const poll = () => {
      const isSpeaking = isTurnActiveRef.current || pcmPlayerRef.current?.activeSources?.size > 0;
      if (isSpeaking && Date.now() - startedAt < 20000) {
        setTimeout(poll, 300);
        return;
      }
      fn();
    };
    setTimeout(poll, 800);
  }, []);

  // Close the link once Jarvis has finished his farewell (enter_standby tool)
  const enterStandbyWhenQuiet = useCallback(() => {
    runWhenQuiet(() => {
      disconnectSession();
      addCommsMessage('system', '[WAKE] Standing by. Say the wake phrase to bring Jarvis back online.');
    });
  }, [runWhenQuiet, disconnectSession, addCommsMessage]);

  // Re-link with fresh settings (voice / persona / profile) while carrying the conversation over
  const relinkWithHandoff = useCallback((voiceOverride) => {
    const store = useJarvisStore.getState();
    const handoff = buildHandoffTurns(store.commsLog);
    const key = apiKeyRef.current || store.userApiKey || store.loadStoredApiKey();
    addCommsMessage('system', '[VOICE LINK] Applying updated settings. Re-linking with the recent conversation...');
    connectSessionRef.current?.(key, voiceOverride, { handoff });
  }, [addCommsMessage]);

  // Deliver a system notice to Jarvis as a user turn once he is idle (queued while offline)
  const notifyJarvis = useCallback(
    (text, attempt = 0) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN || !isSetupCompleteRef.current) {
        pendingPartsRef.current = [...(pendingPartsRef.current || []), { text }];
        return;
      }
      const isBusy = isTurnActiveRef.current || pcmPlayerRef.current?.activeSources?.size > 0;
      if (isBusy && attempt < 40) {
        setTimeout(() => notifyJarvis(text, attempt + 1), 750);
        return;
      }
      ws.send(
        JSON.stringify({
          clientContent: { turns: [{ role: 'user', parts: [{ text }] }], turnComplete: true },
        })
      );
      setStatus('THINKING');
    },
    [setStatus]
  );

  // Follow a background project scaffolding job and brief Jarvis when it completes
  const watchProjectJob = useCallback(
    (jobId) => {
      if (projectPollersRef.current.has(jobId)) return;
      let lastStep = null;
      const timer = setInterval(async () => {
        let job;
        try {
          const res = await fetch(`/api/projects?id=${encodeURIComponent(jobId)}`);
          job = (await res.json()).job;
        } catch (err) {
          console.warn('[useGeminiLive] Project status poll failed:', err);
          return;
        }
        if (!job) {
          clearInterval(timer);
          projectPollersRef.current.delete(jobId);
          return;
        }
        if (job.currentStep && job.currentStep !== lastStep) {
          lastStep = job.currentStep;
          addCommsMessage('system', `[PROJECT] ${job.name}: ${job.currentStep}...`);
        }
        if (job.status === 'running') return;

        clearInterval(timer);
        projectPollersRef.current.delete(jobId);
        if (job.status === 'succeeded') {
          addCommsMessage('system', `[PROJECT] ${job.templateLabel} "${job.name}" ready at ${job.path} (${job.elapsedSeconds}s).`);
          notifyJarvis(
            `[PROJECT UPDATE] The ${job.templateLabel} "${job.name}" finished scaffolding at ${job.path} in ${job.elapsedSeconds} seconds. Tell the operator it is ready, then ask whether they would like it opened in VS Code (file_operations action "open_path", app "code", path "${job.path}").`
          );
        } else {
          addCommsMessage('system', `[PROJECT] ${job.name} failed: ${job.error}`);
          notifyJarvis(
            `[PROJECT UPDATE] Scaffolding the ${job.templateLabel} "${job.name}" failed: ${job.error}. Last output: ${job.logTail.slice(-4).join(' | ')}. Tell the operator briefly and offer to retry.`
          );
        }
      }, 3000);
      projectPollersRef.current.set(jobId, timer);
    },
    [addCommsMessage, notifyJarvis]
  );

  // Connect to Gemini Live WebSocket. `options.resume` re-links the cached session config
  // using the latest resumption handle (falls back to a fresh session without greeting).
  const connectSession = useCallback(
    async (customApiKey, overrideVoice, options = {}) => {
      const isResume = Boolean(options.resume && sessionDataRef.current);
      const resumeHandle = isResume ? resumeHandleRef.current : null;
      const withoutSearch = Boolean(options.withoutSearch);

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
        // Tearing down a stale socket must not drop directives queued for this connection
        const queuedText = pendingTextRef.current;
        const queuedParts = pendingPartsRef.current;
        if (wsRef.current) {
          disconnectSession();
        }
        pendingTextRef.current = queuedText;
        pendingPartsRef.current = queuedParts;
        resetLinkState();
      }
      linkPendingRef.current = true;

      // Unlock browser AudioContext synchronously during user click gesture
      if (pcmPlayerRef.current) {
        pcmPlayerRef.current.initContext();
      }

      // Resolve vocal core: overrideVoice || store || localStorage || 'Aoede'
      const activeVoice = isResume
        ? voiceRef.current
        : overrideVoice ||
          useJarvisStore.getState().operatorProfile?.voiceName ||
          (typeof window !== 'undefined' ? localStorage.getItem('jarvis_voice_name') : null) ||
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
              useJarvisStore.getState().setIsKeyModalOpen(true);
              addCommsMessage('system', 'Gemini API Key required. Please enter your key in the credentials prompt.');
              linkPendingRef.current = false;
              setStatus('DISCONNECTED');
              return;
            }
            throw new Error(sessionData.message || 'Failed to authenticate session');
          }

          if (sessionData.profile) {
            useJarvisStore.getState().setOperatorProfile(sessionData.profile);
          }

          if ((withoutSearch || isGroundingKnownUnavailable()) && sessionData.tools) {
            sessionData = { ...sessionData, tools: sessionData.tools.filter((tool) => !tool.googleSearch) };
          }

          // Cache config so a dropped link can be resumed without re-negotiating
          sessionDataRef.current = sessionData;
          apiKeyRef.current = customApiKey;
          voiceRef.current = activeVoice;
        }

        const wsUrl = sessionData.wsUrl;
        startTimeRef.current = performance.now();

        // Services handed to live tool handlers (lib/tools)
        const toolContext = {
          log: (line) => addCommsMessage('system', line),
          store: useJarvisStore,
          apiKey: () => apiKeyRef.current || useJarvisStore.getState().userApiKey || '',
          notifyJarvis,
          watchProjectJob,
          requestStandby: () => {
            standbyRequestedRef.current = true;
          },
          requestRelink: () => {
            relinkRequestedRef.current = true;
          },
          media: { playYouTubeQuery, openModelViewer, modelFileUrl },
          runCommandWithApproval,
          defaultWakePhrase: DEFAULT_WAKE_PHRASE,
        };

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
              linkPendingRef.current = false;
              linkUpSinceRef.current = Date.now();
              const isMutedNow = useJarvisStore.getState().isMuted;
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

              // Settings re-link: seed the fresh session with the recent conversation as history
              if (options.handoff?.length) {
                ws.send(JSON.stringify({ clientContent: { turns: options.handoff, turnComplete: false } }));
                addCommsMessage('system', `[VOICE LINK] Conversation carried over (${options.handoff.length} turns).`);
              }

              // Transmit queued text directive / upload parts if sent while connecting
              if (pendingTextRef.current || pendingPartsRef.current) {
                const queuedParts = [];
                if (pendingTextRef.current) {
                  const timeNow = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
                  queuedParts.push({ text: `[Time: ${timeNow}] ${pendingTextRef.current}` });
                }
                if (pendingPartsRef.current) {
                  queuedParts.push(...pendingPartsRef.current);
                }
                pendingTextRef.current = null;
                pendingPartsRef.current = null;
                const queuedMessage = {
                  clientContent: {
                    turns: [
                      {
                        role: 'user',
                        parts: queuedParts,
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
              } else if (!isResume && !options.handoff) {
                // Phase 1: Dispatch startup spoken greeting after 300ms stabilization pause (Mark-LIII parity)
                briefingStateRef.current = 'PHASE1';
                setTimeout(() => {
                  if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
                  const { operatorProfile } = useJarvisStore.getState();
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
                  const tool = TOOLS_BY_NAME.get(call.name);
                  let output;
                  if (!tool) {
                    output = { status: 'UNKNOWN_TOOL', message: `No handler is registered for "${call.name}".` };
                  } else {
                    try {
                      output = await tool.run(call.args || {}, toolContext);
                    } catch (err) {
                      console.error(`[useGeminiLive] Tool ${call.name} failed:`, err);
                      output = { status: 'FAILED', message: err.message };
                    }
                  }
                  functionResponses.push({ response: { output }, id: call.id });
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

              // Built-in Google Search grounding: remember the queries and cited sources
              const grounding = msg.serverContent.groundingMetadata;
              if (grounding) {
                for (const q of grounding.webSearchQueries || []) groundingRef.current.queries.add(q);
                for (const chunk of grounding.groundingChunks || []) {
                  if (chunk.web?.uri) groundingRef.current.sources.set(chunk.web.uri, chunk.web.title || chunk.web.uri);
                }
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

                const { queries, sources } = groundingRef.current;
                if (sources.size > 0) {
                  const searchedFor = [...queries].join(' / ') || 'Google Search grounding';
                  useJarvisStore.getState().addIntelResult(
                    {
                      query: searchedFor,
                      mode: 'grounded',
                      summary: `Jarvis consulted Google Search (${sources.size} source${sources.size === 1 ? '' : 's'}).`,
                      results: [...sources].map(([url, title]) => ({ title, snippet: url, source: title, url })),
                    },
                    { reveal: false }
                  );
                  addCommsMessage('system', `[WEB INTEL] Grounded via Google Search: ${searchedFor} (${sources.size} sources logged to Intel).`);
                }
                groundingRef.current = { queries: new Set(), sources: new Map() };

                // Flush complete text turn to comms log once turn concludes
                if (currentTurnTextRef.current.trim()) {
                  addCommsMessage('jarvis', currentTurnTextRef.current.trim());
                  currentTurnTextRef.current = '';
                }

                // Return to idle state once full turn concludes
                if (!pcmPlayerRef.current || pcmPlayerRef.current.activeSources.size === 0) {
                  const isMutedNow = useJarvisStore.getState().isMuted;
                  setStatus(isMutedNow ? 'CONNECTED' : 'LISTENING');
                }

                // Phase 2: After Phase 1 greeting finishes, fetch news and dispatch intelligence briefing
                if (briefingStateRef.current === 'PHASE1') {
                  const { operatorProfile } = useJarvisStore.getState();
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
                        const newsKey = apiKeyRef.current || useJarvisStore.getState().userApiKey || '';
                        const newsRes = await fetch('/api/web-search?query=top+world+news+today&mode=news', {
                          headers: newsKey ? { 'x-gemini-api-key': newsKey } : {},
                        });
                        if (newsRes.ok) {
                          const newsData = await newsRes.json();
                          newsSummary = newsData.summary || '';
                          // Push results to Intel tab in Tactical Drawer
                          if (newsData.results && newsData.results.length > 0) {
                            const { addIntelResult } = useJarvisStore.getState();
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

                      const { operatorProfile } = useJarvisStore.getState();
                      const callsign = operatorProfile?.callsign?.trim() || 'Bhavya Sir';
                      const now = new Date();
                      const localTime = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
                      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'System Time';
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

                // Farewell delivered after enter_standby: drop the link once playback drains
                if (standbyRequestedRef.current) {
                  standbyRequestedRef.current = false;
                  enterStandbyWhenQuiet();
                } else if (relinkRequestedRef.current) {
                  // Voice / persona changed by tool: apply it once the confirmation has been spoken
                  relinkRequestedRef.current = false;
                  runWhenQuiet(() => relinkWithHandoff());
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

          // A rejected key is not a grounding problem: say so and ask for a working key
          if (!isResume && didOpen && failedBeforeSetup && /api key|api_key|credential|authenticat|permission denied/i.test(event.reason || '')) {
            stopMic();
            setStatus('DISCONNECTED');
            linkPendingRef.current = false;
            addCommsMessage('system', `[VOICE LINK] Gemini rejected the API key (${event.reason}). Please enter a valid key.`);
            useJarvisStore.getState().setIsKeyModalOpen(true);
            return;
          }

          // Quota refusal on a fresh link that requested Google Search grounding (keys without grounding
          // quota are refused at setup): retry once without it
          const requestedSearch = (sessionData.tools || []).some((tool) => tool.googleSearch);
          const refusedForQuota = event.code === 1011 || /quota|billing|exceeded|exhausted/i.test(event.reason || '');
          if (!isResume && !withoutSearch && didOpen && failedBeforeSetup && requestedSearch && refusedForQuota) {
            rememberGroundingUnavailable();
            addCommsMessage(
              'system',
              `[VOICE LINK] Setup refused (${event.reason || `code ${event.code}`}). Retrying without Google Search grounding (skipped for 12 hours)...`
            );
            connectSessionRef.current?.(customApiKey, overrideVoice, { ...options, withoutSearch: true });
            return;
          }

          // Free-tier keys briefly refuse a new session right after another one closes (e.g. a settings
          // re-link): retry a few times with backoff, keeping any handoff
          const setupRetry = options.setupRetry || 0;
          if (!isResume && didOpen && failedBeforeSetup && refusedForQuota && setupRetry < 3) {
            const delayMs = 2000 * 2 ** setupRetry;
            setStatus('RECONNECTING');
            addCommsMessage('system', `[VOICE LINK] Gemini is busy. Retrying the link in ${delayMs / 1000}s...`);
            setTimeout(
              () => connectSessionRef.current?.(customApiKey, overrideVoice, { ...options, setupRetry: setupRetry + 1 }),
              delayMs
            );
            return;
          }

          linkPendingRef.current = false;
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
        linkPendingRef.current = false;
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
      watchProjectJob,
      notifyJarvis,
      enterStandbyWhenQuiet,
      runWhenQuiet,
      relinkWithHandoff,
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

      if (linkPendingRef.current) {
        addCommsMessage('system', 'Link handshake pending. Transmitting upon sync...');
      } else if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        const activeKey = useJarvisStore.getState().userApiKey || useJarvisStore.getState().loadStoredApiKey();
        if (!activeKey) {
          addCommsMessage('system', 'Gemini API Key required to link live session. Please enter your key in the prompt.');
          useJarvisStore.getState().setIsKeyModalOpen(true);
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

  // Send a multi-part user turn (e.g. uploaded images or document text) over the live link,
  // queueing it and establishing the link first when offline
  const sendContentParts = useCallback(
    (parts) => {
      if (!parts || parts.length === 0) return false;

      if (pcmPlayerRef.current) {
        pcmPlayerRef.current.initContext();
      }

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && isSetupCompleteRef.current) {
        try {
          wsRef.current.send(
            JSON.stringify({
              clientContent: {
                turns: [{ role: 'user', parts }],
                turnComplete: true,
              },
            })
          );
          setStatus('THINKING');
          return true;
        } catch (err) {
          console.error('[useGeminiLive] Failed to send content parts:', err);
          addCommsMessage('system', `Transmission error: ${err.message}`);
          return false;
        }
      }

      pendingPartsRef.current = [...(pendingPartsRef.current || []), ...parts];

      // Auto re-sync in progress: the resumed session delivers the queued parts
      if (isEstablishedRef.current) {
        addCommsMessage('system', 'Link re-syncing. Transmitting upload upon sync...');
        return true;
      }

      if (linkPendingRef.current) {
        addCommsMessage('system', 'Link handshake pending. Transmitting upload upon sync...');
      } else if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        const activeKey = useJarvisStore.getState().userApiKey || useJarvisStore.getState().loadStoredApiKey();
        if (!activeKey) {
          pendingPartsRef.current = null;
          addCommsMessage('system', 'Gemini API Key required to link live session. Please enter your key in the prompt.');
          useJarvisStore.getState().setIsKeyModalOpen(true);
          return false;
        }
        addCommsMessage('system', 'Link offline. Establishing secure channel for queued upload...');
        connectSession(activeKey);
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
      const { operatorProfile } = useJarvisStore.getState();
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

  // Stop polling background project jobs on unmount
  useEffect(() => {
    const pollers = projectPollersRef.current;
    return () => {
      for (const timer of pollers.values()) clearInterval(timer);
      pollers.clear();
    };
  }, []);

  // Register active connectSession callback into global store for HUD modals
  useEffect(() => {
    connectSessionRef.current = connectSession;
    const { setReconnectSession, setRelinkSession } = useJarvisStore.getState();
    if (setReconnectSession) {
      setReconnectSession(connectSession);
    }
    setRelinkSession?.(relinkWithHandoff);
    return () => {
      const store = useJarvisStore.getState();
      if (store.setReconnectSession) {
        store.setReconnectSession(null);
      }
      store.setRelinkSession?.(null);
    };
  }, [connectSession, relinkWithHandoff]);

  return {
    status,
    connectSession,
    disconnectSession,
    handleBargeIn,
    pcmPlayer,
    getInputByteFrequencyData,
    sendTextMessage,
    sendVideoFrame,
    sendContentParts,
    triggerBriefing,
  };
}

