'use client';

import { useEffect, useRef, useState } from 'react';
import { matchesWakePhrase, normalizeWords, OFFLINE_WAKE_PHRASE } from '@/lib/wakePhrase';
import { startOfflineWakeListener } from '@/lib/wakeWord/listener';
import { listAudioDevices, resolveDevice } from '@/lib/audioDevices';
import { useJarvisStore } from '@/lib/store';

const MAX_RESTART_DELAY_MS = 15000;

const isOfflinePhrase = (phrase) => normalizeWords(phrase).join(' ') === normalizeWords(OFFLINE_WAKE_PHRASE).join(' ');

/**
 * Standby wake-phrase listener. The offline model ("Hey Jarvis") runs fully offline on the openWakeWord
 * models when they are installed (Phase 8.12); any custom phrase — or a failure to start the
 * offline engine — uses the browser's Web Speech API (Chrome / Edge, Phase 7.6). Listens only while
 * `active` (Jarvis is offline) and calls `onWake` once per detection.
 * Returns: 'off' | 'listening' | 'listening-offline' | 'unsupported' | 'blocked' | 'error'.
 */
export function useWakePhrase({ enabled, active, phrase, onWake }) {
  const [state, setState] = useState('off');
  const [offlineFailed, setOfflineFailed] = useState(false);
  const offlineReady = useJarvisStore((s) => s.offlineWakeReady);
  const onWakeRef = useRef(onWake);

  useEffect(() => {
    onWakeRef.current = onWake;
  }, [onWake]);

  useEffect(() => {
    if (!enabled || !active) {
      setState('off');
      return undefined;
    }

    if (offlineReady && !offlineFailed && isOfflinePhrase(phrase)) {
      let stop = null;
      let cancelled = false;
      (async () => {
        const choice = useJarvisStore.getState().audioInput;
        const device = choice?.id ? resolveDevice((await listAudioDevices()).inputs, choice) : null;
        const stopListener = await startOfflineWakeListener({
          deviceId: device?.id,
          onWake: () => {
            setState('off');
            onWakeRef.current?.();
          },
        });
        if (cancelled) stopListener();
        else {
          stop = stopListener;
          setState('listening-offline');
        }
      })().catch((err) => {
        if (cancelled) return;
        console.warn('[useWakePhrase] Offline wake word unavailable, using Web Speech:', err);
        if (/NotAllowed|Permission/i.test(err?.name || err?.message || '')) setState('blocked');
        else setOfflineFailed(true); // falls through to Web Speech on the next run of this effect
      });
      return () => {
        cancelled = true;
        stop?.();
      };
    }
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      setState('unsupported');
      return undefined;
    }

    let stopped = false;
    let restartTimer = null;
    let restartDelay = 400;
    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 3;
    recognition.lang = navigator.language || 'en-US';

    recognition.onstart = () => setState('listening');
    recognition.onresult = (event) => {
      restartDelay = 400; // healthy session: reset back-off
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcripts = Array.from(event.results[i], (alternative) => alternative.transcript);
        if (transcripts.some((text) => matchesWakePhrase(text, phrase))) {
          stopped = true;
          recognition.abort();
          setState('off');
          onWakeRef.current?.();
          return;
        }
      }
    };
    recognition.onerror = (event) => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        stopped = true;
        setState('blocked');
      } else if (event.error === 'network' || event.error === 'audio-capture') {
        setState('error');
        restartDelay = Math.min(restartDelay * 2, MAX_RESTART_DELAY_MS);
      }
      // 'no-speech' and 'aborted' are routine; onend restarts the session
    };
    recognition.onend = () => {
      if (stopped) return;
      restartTimer = setTimeout(() => {
        try {
          recognition.start();
        } catch {
          // Already started
        }
      }, restartDelay);
    };

    try {
      recognition.start();
    } catch {
      setState('error');
    }

    return () => {
      stopped = true;
      clearTimeout(restartTimer);
      try {
        recognition.abort();
      } catch {
        // Not running
      }
    };
  }, [enabled, active, phrase, offlineReady, offlineFailed]);

  return state;
}
