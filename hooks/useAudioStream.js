'use client';

import { useRef, useCallback, useEffect } from 'react';
import { useAdaStore } from '@/lib/store';

/**
 * useAudioStream — Manages browser microphone capture and off-thread
 * downsampling via AudioWorkletNode ('pcm-downsampler-processor').
 * Emits 16kHz Int16 Linear PCM chunks for real-time WebSocket transmission.
 */
export function useAudioStream({ onAudioChunk, onUserSpeaking }) {
  const audioContextRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const sourceNodeRef = useRef(null);
  const muteGainRef = useRef(null);
  const workletNodeRef = useRef(null);
  const inputAnalyserRef = useRef(null);
  const frequencyDataRef = useRef(null);
  const isRecordingRef = useRef(false);
  const isStartingRef = useRef(false);

  const isMuted = useAdaStore((state) => state.isMuted);
  const status = useAdaStore((state) => state.status);
  const addCommsMessage = useAdaStore((state) => state.addCommsMessage);
  const isMutedRef = useRef(isMuted);
  isMutedRef.current = isMuted;

  // Safely resumes AudioContext if suspended by browser autoplay policy
  const resumeContext = useCallback(async () => {
    if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
      try {
        await audioContextRef.current.resume();
      } catch (err) {
        console.warn('[useAudioStream] AudioContext resume warning:', err);
      }
    }
  }, []);

  const startMic = useCallback(async () => {
    if (isRecordingRef.current || isStartingRef.current) {
      await resumeContext();
      return;
    }

    isStartingRef.current = true;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      mediaStreamRef.current = stream;

      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioContextClass();
      audioContextRef.current = ctx;

      if (ctx.state === 'suspended') {
        await ctx.resume().catch(() => {});
      }

      // Load off-thread downsampler processor
      await ctx.audioWorklet.addModule('/audio-worklet-processor.js');

      const source = ctx.createMediaStreamSource(stream);
      sourceNodeRef.current = source; // Retain reference to prevent Chromium V8 garbage collection

      const workletNode = new AudioWorkletNode(ctx, 'pcm-downsampler-processor');
      workletNodeRef.current = workletNode;

      // In Chromium, AudioWorkletProcessor.process() is only invoked if the node has an active
      // path to AudioContext.destination (pull-based graph). We connect through a GainNode
      // with gain = 0 to drive the graph continuously with zero speaker feedback.
      const muteGain = ctx.createGain();
      muteGain.gain.value = 0;
      muteGainRef.current = muteGain;

      workletNode.port.onmessage = (event) => {
        if (isMutedRef.current) {
          return;
        }

        const pcmBuffer = event.data; // ArrayBuffer of 16kHz Int16 (512 samples / 32ms)
        if (!pcmBuffer) return;

        // Calculate RMS vocal energy for speech detection (barge-in)
        const int16View = new Int16Array(pcmBuffer);
        let sumSquares = 0;
        for (let i = 0; i < int16View.length; i++) {
          const norm = int16View[i] / 32768;
          sumSquares += norm * norm;
        }
        const rms = Math.sqrt(sumSquares / int16View.length);

        // Threshold for human voice detection (for automatic barge-in)
        if (rms > 0.045 && onUserSpeaking) {
          onUserSpeaking();
        }

        if (onAudioChunk) {
          onAudioChunk(pcmBuffer);
        }
      };

      source.connect(workletNode);
      workletNode.connect(muteGain);
      muteGain.connect(ctx.destination);

      // Connect AnalyserNode for real-time operator voice spectrum visualization
      const inputAnalyser = ctx.createAnalyser();
      inputAnalyser.fftSize = 128; // 64 frequency bins
      inputAnalyser.smoothingTimeConstant = 0.65;
      source.connect(inputAnalyser);
      inputAnalyserRef.current = inputAnalyser;
      frequencyDataRef.current = new Uint8Array(inputAnalyser.frequencyBinCount);

      // Respect current mute state on tracks immediately
      if (isMutedRef.current) {
        stream.getAudioTracks().forEach((track) => {
          track.enabled = false;
        });
      }

      isRecordingRef.current = true;
    } catch (err) {
      console.error('[useAudioStream] Failed to initialize microphone capture:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        addCommsMessage(
          'system',
          '[MIC ERROR] Microphone permission denied. Please allow microphone access in browser settings.'
        );
      }
      throw err;
    } finally {
      isStartingRef.current = false;
    }
  }, [onAudioChunk, onUserSpeaking, resumeContext, addCommsMessage]);

  const stopMic = useCallback(() => {
    if (workletNodeRef.current) {
      try {
        workletNodeRef.current.disconnect();
        workletNodeRef.current.port.close();
      } catch {
        // Ignore disconnect errors
      }
      workletNodeRef.current = null;
    }

    if (muteGainRef.current) {
      try {
        muteGainRef.current.disconnect();
      } catch {
        // Ignore disconnect errors
      }
      muteGainRef.current = null;
    }

    if (inputAnalyserRef.current) {
      try {
        inputAnalyserRef.current.disconnect();
      } catch {
        // Ignore disconnect errors
      }
      inputAnalyserRef.current = null;
    }
    frequencyDataRef.current = null;

    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.disconnect();
      } catch {
        // Ignore disconnect errors
      }
      sourceNodeRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try {
        audioContextRef.current.close();
      } catch {
        // Ignore close errors
      }
      audioContextRef.current = null;
    }

    isRecordingRef.current = false;
    isStartingRef.current = false;
  }, []);

  // Global user interaction listener to resume suspended AudioContext
  useEffect(() => {
    const handleGesture = () => {
      if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume().catch(() => {});
      }
    };
    window.addEventListener('pointerdown', handleGesture);
    window.addEventListener('click', handleGesture);
    window.addEventListener('keydown', handleGesture);
    return () => {
      window.removeEventListener('pointerdown', handleGesture);
      window.removeEventListener('click', handleGesture);
      window.removeEventListener('keydown', handleGesture);
    };
  }, []);

  // Reactive synchronization: monitor connection and mute changes
  const isConnected = status !== 'DISCONNECTED' && status !== 'CONNECTING';

  useEffect(() => {
    if (!isConnected) {
      if (isRecordingRef.current) {
        stopMic();
      }
      return;
    }

    if (isMuted) {
      // When muted, disable hardware tracks to preserve operator privacy
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getAudioTracks().forEach((track) => {
          track.enabled = false;
        });
      }
    } else {
      // When unmuted, re-enable hardware tracks and ensure microphone is recording
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getAudioTracks().forEach((track) => {
          track.enabled = true;
        });
      }

      if (!isRecordingRef.current) {
        startMic().catch((err) => {
          console.warn('[useAudioStream] Unmute mic startup warning:', err);
        });
      } else {
        resumeContext();
      }
    }
  }, [isConnected, isMuted, startMic, stopMic, resumeContext]);

  useEffect(() => {
    return () => {
      stopMic();
    };
  }, [stopMic]);

  // Zero-allocation getter for operator voice FFT frequency data
  const getInputByteFrequencyData = useCallback(() => {
    if (isMutedRef.current || !isRecordingRef.current) return null;
    if (!inputAnalyserRef.current || !frequencyDataRef.current) return null;
    inputAnalyserRef.current.getByteFrequencyData(frequencyDataRef.current);
    return frequencyDataRef.current;
  }, []);

  return {
    startMic,
    stopMic,
    resumeContext,
    getInputByteFrequencyData,
    isRecording: isRecordingRef.current,
  };
}
