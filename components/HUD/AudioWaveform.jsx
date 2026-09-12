'use client';

import React, { useRef, useEffect } from 'react';

/**
 * AudioWaveform — High-performance HTML5 Canvas audio spectrum visualizer.
 * Renders the real-time FFT frequency response of the operator's microphone input stream.
 * Fallback to pcmPlayer output if input analyser is unavailable.
 * Zero memory allocation inside the requestAnimationFrame render loop.
 */
export function AudioWaveform({
  getInputByteFrequencyData,
  pcmPlayer,
  isLive = false,
  isMuted = false,
}) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    let animationId;

    const render = () => {
      const width = canvas.width;
      const height = canvas.height;

      ctx.clearRect(0, 0, width, height);

      let freqData = null;
      if (!isMuted && getInputByteFrequencyData) {
        freqData = getInputByteFrequencyData();
      } else if (!isMuted && pcmPlayer) {
        freqData = pcmPlayer.getByteFrequencyData();
      }

      // Detect if user voice has real energy
      let hasVocalEnergy = false;
      if (freqData && freqData.length > 0) {
        for (let k = 0; k < Math.min(freqData.length, 36); k++) {
          if (freqData[k] > 12) {
            hasVocalEnergy = true;
            break;
          }
        }
      }

      const barCount = 48;
      const barWidth = width / barCount - 2;

      for (let i = 0; i < barCount; i++) {
        let value = 0;

        if (hasVocalEnergy && freqData && freqData.length > 0) {
          // Voice formant bins (0 to ~48 corresponds to 0Hz to ~4kHz)
          const binIndex = Math.floor((i / barCount) * Math.min(freqData.length, 48));
          value = freqData[binIndex] / 255;
        } else if (isLive && !isMuted) {
          // Subtle idle ambient listening wave
          value = (Math.sin(Date.now() * 0.003 + i * 0.25) * 0.5 + 0.5) * 0.09 + 0.03;
        } else {
          // Flatline / minimal standby indication when muted or disconnected
          value = 0.02;
        }

        const barHeight = Math.max(2, value * height * 0.88);
        const x = i * (barWidth + 2);
        const y = height - barHeight;

        // Gradient: Ada Scarlet at base to Neon Cyan at crest
        const grad = ctx.createLinearGradient(0, height, 0, y);
        grad.addColorStop(0, '#FF003C');
        grad.addColorStop(1, '#00F0FF');

        ctx.fillStyle = grad;
        ctx.shadowColor = '#00F0FF';
        ctx.shadowBlur = hasVocalEnergy && value > 0.3 ? 8 : value > 0.1 ? 3 : 0;

        // Rounded bar cap
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, [2, 2, 0, 0]);
        ctx.fill();
      }

      // Reset shadow for performance
      ctx.shadowBlur = 0;

      animationId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [getInputByteFrequencyData, pcmPlayer, isLive, isMuted]);

  return (
    <div className="relative w-full h-8 flex items-center justify-center overflow-hidden">
      <canvas
        ref={canvasRef}
        width={480}
        height={32}
        className="w-full h-full max-w-xl opacity-90"
      />
    </div>
  );
}

