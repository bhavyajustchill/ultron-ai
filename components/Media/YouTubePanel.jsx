"use client";

import React, { useCallback, useEffect, useRef } from "react";
import { MonitorPlay, Pause, Play, SkipBack, SkipForward, Volume2 } from "lucide-react";
import { useJarvisStore } from "@/lib/store";
import { FloatingPanel } from "@/components/Media/FloatingPanel";
import { playYouTubeQuery } from "@/lib/mediaClient";

const DUCKED_VOLUME = 20;
// YouTube IFrame API player states
const PLAYER_STATE_ENDED = 0;
const PLAYER_STATE_PLAYING = 1;
const PLAYER_STATE_PAUSED = 2;

const initialPosition = () => ({
  x: Math.max(10, window.innerWidth - Math.min(460, window.innerWidth - 32) - 24),
  y: 72,
});

/**
 * Built-in YouTube player (Phase 7.5). Driven by the `youtube_player` voice tool through the
 * store; talks to the embedded player over the IFrame API postMessage channel, auto-advances
 * through the result queue, and ducks the volume while Jarvis is speaking.
 */
export function YouTubePanel() {
  const youtube = useJarvisStore((state) => state.youtube);
  const setYouTube = useJarvisStore((state) => state.setYouTube);
  const status = useJarvisStore((state) => state.status);
  const iframeRef = useRef(null);
  const { isOpen, queue, index, isPlaying, volume, command, query } = youtube;
  const current = queue[index];

  const postToPlayer = useCallback((func, args = []) => {
    iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ event: "command", func, args }), "*");
  }, []);

  const goTo = useCallback(
    (nextIndex) => {
      if (nextIndex >= 0 && nextIndex < queue.length) setYouTube({ index: nextIndex, isPlaying: true });
    },
    [queue.length, setYouTube]
  );

  // Other HUD components can start playback with: dispatchEvent(new CustomEvent("jarvis-youtube-play", { detail: { query } }))
  useEffect(() => {
    const onPlayRequest = (e) => {
      if (e.detail?.query) playYouTubeQuery(e.detail.query).catch((err) => console.warn("[YouTubePanel] Search failed:", err));
    };
    window.addEventListener("jarvis-youtube-play", onPlayRequest);
    return () => window.removeEventListener("jarvis-youtube-play", onPlayRequest);
  }, []);

  // Voice commands relayed through the store
  useEffect(() => {
    if (!command) return;
    if (command.name === "pause") {
      postToPlayer("pauseVideo");
      setYouTube({ isPlaying: false, command: null });
    } else if (command.name === "play") {
      postToPlayer("playVideo");
      setYouTube({ isPlaying: true, command: null });
    } else if (command.name === "volume") {
      setYouTube({ volume: command.value, command: null });
    }
  }, [command, postToPlayer, setYouTube]);

  // Duck under Jarvis's voice, restore afterwards
  useEffect(() => {
    if (!isOpen) return;
    postToPlayer("setVolume", [status === "SPEAKING" ? Math.min(volume, DUCKED_VOLUME) : volume]);
  }, [status, volume, isOpen, postToPlayer, index]);

  // Player state events: advance to the next result when a video ends
  useEffect(() => {
    if (!isOpen) return;
    const onMessage = (e) => {
      let data;
      try {
        if (!/youtube(-nocookie)?\.com$/.test(new URL(e.origin).hostname)) return;
        data = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
      } catch {
        return; // opaque origin or non-JSON message
      }
      const state = data?.event === "onStateChange" ? data.info : data?.info?.playerState;
      if (state === PLAYER_STATE_ENDED) goTo(index + 1);
      else if (state === PLAYER_STATE_PLAYING && !isPlaying) setYouTube({ isPlaying: true });
      else if (state === PLAYER_STATE_PAUSED && isPlaying) setYouTube({ isPlaying: false });
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [isOpen, index, isPlaying, goTo, setYouTube]);

  if (!isOpen || !current) return null;

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const embedUrl = `https://www.youtube-nocookie.com/embed/${current.id}?autoplay=1&enablejsapi=1&rel=0&playsinline=1&origin=${encodeURIComponent(origin)}`;

  const controlButton = "p-2 chamfer-btn border border-[rgba(var(--jarvis-accent-rgb),0.3)] bg-[rgba(var(--jarvis-accent-rgb),0.06)] text-[var(--jarvis-accent)] hover:border-[var(--jarvis-accent)] hover:bg-[rgba(var(--jarvis-accent-rgb),0.15)] transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed";

  return (
    <FloatingPanel
      title="MEDIA DECK // YOUTUBE"
      subtitle={query ? `Results for "${query}"` : "Built-in player"}
      icon={MonitorPlay}
      widthClass="w-[460px]"
      initialPosition={initialPosition}
      onClose={() => {
        postToPlayer("stopVideo");
        setYouTube({ isOpen: false });
      }}>
      <div className="relative w-full aspect-video chamfer-md overflow-hidden border border-[rgba(var(--jarvis-accent-rgb),0.2)] bg-black">
        <iframe
          key={current.id}
          ref={iframeRef}
          src={embedUrl}
          title={current.title}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          className="absolute inset-0 w-full h-full"
          onLoad={() => {
            // Subscribe to player state events (needed for auto-advance)
            iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ event: "listening", id: 1, channel: "widget" }), "*");
            postToPlayer("setVolume", [volume]);
          }}
        />
      </div>

      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-xs text-[#F0F2F8] font-semibold truncate" title={current.title}>{current.title}</span>
        <span className="text-[10px] text-[#7E859E] truncate">
          {current.channel}
          {current.live ? " · LIVE" : current.duration ? ` · ${current.duration}` : ""}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <button className={controlButton} onClick={() => goTo(index - 1)} disabled={index === 0} title="Previous">
          <SkipBack className="w-3.5 h-3.5" />
        </button>
        <button
          className={controlButton}
          onClick={() => useJarvisStore.getState().sendYouTubeCommand(isPlaying ? "pause" : "play")}
          title={isPlaying ? "Pause" : "Play"}>
          {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
        </button>
        <button className={controlButton} onClick={() => goTo(index + 1)} disabled={index >= queue.length - 1} title="Next">
          <SkipForward className="w-3.5 h-3.5" />
        </button>
        <div className="flex items-center gap-1.5 ml-auto text-[#7E859E]">
          <Volume2 className="w-3.5 h-3.5" />
          <input
            type="range"
            min={0}
            max={100}
            value={volume}
            onChange={(e) => setYouTube({ volume: Number(e.target.value) })}
            className="w-24 accent-[var(--jarvis-accent)] cursor-pointer"
            aria-label="Volume"
          />
          <span className="text-[10px] w-7 text-right">{volume}</span>
        </div>
      </div>

      {queue.length > 1 && (
        <ol className="flex flex-col gap-1 max-h-36 overflow-y-auto pr-1 border-t border-[rgba(var(--jarvis-accent-rgb),0.12)] pt-2">
          {queue.map((video, i) => (
            <li key={video.id}>
              <button
                onClick={() => goTo(i)}
                className={`w-full text-left flex items-center gap-2 px-2 py-1 chamfer-xs text-[10px] transition-all cursor-pointer ${i === index
                  ? "bg-[rgba(var(--jarvis-accent-rgb),0.15)] border border-[rgba(var(--jarvis-accent-rgb),0.4)] text-[var(--jarvis-accent)]"
                  : "border border-transparent text-[#B8BDCC] hover:bg-[rgba(var(--jarvis-accent-rgb),0.06)]"}`}>
                <span className="w-4 shrink-0 text-[#7E859E]">{i + 1}</span>
                <span className="truncate flex-1">{video.title}</span>
                <span className="shrink-0 text-[#7E859E]">{video.live ? "LIVE" : video.duration || ""}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </FloatingPanel>
  );
}

export default YouTubePanel;
