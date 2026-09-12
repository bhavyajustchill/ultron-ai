'use client';

import { useRef, useCallback } from 'react';

/**
 * useLipSync — Extracts vocal spectral weights from pcmPlayer's AnalyserNode.
 * Decomposes low-frequency formant energy (vowels/jaw opening) and mid-high frequency
 * sibilance (mouth spreading/smiling) with zero garbage collection.
 */
export function useLipSync(pcmPlayer) {
  const lipSyncRef = useRef({
    jawOpen: 0,
    mouthSmile: 0,
  });

  /**
   * Called per-frame inside useFrame() to update morph weights synchronously with WebGL tick.
   * Zero heap allocation.
   */
  const updateLipSync = useCallback(() => {
    if (!pcmPlayer) {
      lipSyncRef.current.jawOpen *= 0.8;
      lipSyncRef.current.mouthSmile *= 0.8;
      return lipSyncRef.current;
    }

    const freqData = pcmPlayer.getByteFrequencyData();
    if (!freqData || freqData.length === 0) {
      lipSyncRef.current.jawOpen *= 0.8;
      lipSyncRef.current.mouthSmile *= 0.8;
      return lipSyncRef.current;
    }

    // 1. Low frequency bins (approx. 100Hz - 900Hz) drive vocal vowel articulation & jaw opening
    let lowSum = 0;
    const lowCount = 10;
    for (let i = 1; i <= lowCount; i++) {
      lowSum += freqData[i] || 0;
    }
    const lowAvg = lowSum / lowCount;

    // 2. Mid-high frequency bins (approx. 1.5kHz - 4kHz) drive subtle mouth spreading/smile
    let highSum = 0;
    const highStart = 16;
    const highEnd = 45;
    const highCount = highEnd - highStart;
    for (let i = highStart; i < highEnd; i++) {
      highSum += freqData[i] || 0;
    }
    const highAvg = highSum / highCount;

    // Responsive speech power curve (speech energy peaks at 150-500Hz)
    const speechThreshold = 12;
    const effectiveEnergy = Math.max(0, lowAvg - speechThreshold);
    // Smooth, subtle curve: average speech hovers around 0.4 - 0.7, peaking gracefully on loud vowels
    const targetJaw = Math.min(1.0, Math.pow(effectiveEnergy / 85, 1.05));
    const targetSmile = Math.min(0.6, Math.max(0.0, (highAvg / 180) * 0.7));

    // Smooth damping: balanced attack (0.50) on syllable onset, natural release (0.24)
    const attack = targetJaw > lipSyncRef.current.jawOpen ? 0.50 : 0.24;
    lipSyncRef.current.jawOpen += (targetJaw - lipSyncRef.current.jawOpen) * attack;
    lipSyncRef.current.mouthSmile += (targetSmile - lipSyncRef.current.mouthSmile) * 0.20;

    return lipSyncRef.current;
  }, [pcmPlayer]);

  return {
    lipSyncRef,
    updateLipSync,
  };
}
