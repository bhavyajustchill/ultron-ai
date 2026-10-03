'use client';

import { useEffect, useRef, useState } from 'react';
import { matchesWakePhrase } from '@/lib/wakePhrase';

const MAX_RESTART_DELAY_MS = 15000;

/**
 * Standby wake-phrase listener (Phase 7.6) on the browser's Web Speech API (Chrome / Edge).
 * Listens only while `active` (Jarvis is offline), restarts itself when the recognizer
 * times out, backs off on repeated errors, and calls `onWake` once per detection.
 * Returns the listener state: 'off' | 'listening' | 'unsupported' | 'blocked' | 'error'.
 */
export function useWakePhrase({ enabled, active, phrase, onWake }) {
  const [state, setState] = useState('off');
  const onWakeRef = useRef(onWake);

  useEffect(() => {
    onWakeRef.current = onWake;
  }, [onWake]);

  useEffect(() => {
    if (!enabled || !active) {
      setState('off');
      return undefined;
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
  }, [enabled, active, phrase]);

  return state;
}
