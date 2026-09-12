"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Globe,
  Search,
  Sparkles,
  Trash2,
  X,
  ExternalLink,
  GripHorizontal,
  Minimize2,
  Maximize2,
  Radio,
  Clock,
} from "lucide-react";
import { useAdaStore } from "@/lib/store";

export function IntelModal() {
  const {
    isIntelOpen,
    setIsIntelOpen,
    intelSearchResults,
    clearIntelResults,
    addIntelResult,
    addCommsMessage,
  } = useAdaStore();

  const [searchQuery, setSearchQuery] = useState("");
  const [searchMode, setSearchMode] = useState("search"); // 'search' | 'news' | 'research'
  const [isSearching, setIsSearching] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  const closeTimeoutRef = useRef(null);
  const panelRef = useRef(null);
  const dragStartRef = useRef({ startX: 0, startY: 0, posX: 0, posY: 0 });

  // Free Dragging State — default spawn position directly to the right of the Systems Panel
  const [position, setPosition] = useState(null);
  const [isDragging, setIsDragging] = useState(false);

  // Initialize position: top-right where Comms Log used to live (x = window.innerWidth - panelWidth - 24, y = 72)
  useEffect(() => {
    if (isIntelOpen && position === null && typeof window !== "undefined") {
      const panelWidth = panelRef.current?.offsetWidth || 460;
      const defaultX = Math.max(10, window.innerWidth - panelWidth - 24);
      const defaultY = 72; // Aligned with top-18
      setPosition({ x: defaultX, y: defaultY });
    }
  }, [isIntelOpen, position]);

  // Smooth Shutter Close
  const triggerClose = useCallback(() => {
    if (isClosing) return;
    setIsClosing(true);
    closeTimeoutRef.current = setTimeout(() => {
      setIsIntelOpen(false);
      setIsClosing(false);
    }, 220); // Matches 0.22s scifi-modal-collapse-up keyframe
  }, [isClosing, setIsIntelOpen]);

  // Listen for external close toggle event (e.g. from top header button)
  useEffect(() => {
    const handleExternalClose = () => {
      if (isIntelOpen) {
        triggerClose();
      }
    };
    window.addEventListener("ada-close-intel", handleExternalClose);
    return () => window.removeEventListener("ada-close-intel", handleExternalClose);
  }, [isIntelOpen, triggerClose]);

  // Keyboard shortcut: Escape to close
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && isIntelOpen) {
        triggerClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isIntelOpen, triggerClose]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    };
  }, []);

  // Free Pointer Dragging
  const handlePointerDown = (e) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    if (e.target.closest("button") || e.target.closest("input") || e.target.closest("select")) {
      return;
    }

    const currentX = position?.x ?? (typeof window !== "undefined" ? Math.max(10, window.innerWidth - 484) : 800);
    const currentY = position?.y ?? 72;

    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      posX: currentX,
      posY: currentY,
    };
    setIsDragging(true);

    const onPointerMove = (moveEvent) => {
      const dx = moveEvent.clientX - dragStartRef.current.startX;
      const dy = moveEvent.clientY - dragStartRef.current.startY;

      const panelWidth = panelRef.current?.offsetWidth || 460;
      const panelHeight = panelRef.current?.offsetHeight || 440;

      const maxX = Math.max(10, window.innerWidth - panelWidth - 10);
      const maxY = Math.max(10, window.innerHeight - panelHeight - 10);

      const nextX = Math.min(Math.max(10, dragStartRef.current.posX + dx), maxX);
      const nextY = Math.min(Math.max(10, dragStartRef.current.posY + dy), maxY);

      setPosition({ x: nextX, y: nextY });
    };

    const onPointerUp = () => {
      setIsDragging(false);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  // Execute web reconnaissance search
  const handleExecuteSearch = async () => {
    const query = searchQuery.trim();
    if (!query || isSearching) return;

    setIsSearching(true);
    addCommsMessage?.(
      "system",
      `[WEB INTEL] Initiating ${searchMode.toUpperCase()} scan for: "${query}"...`
    );

    try {
      const res = await fetch(
        `/api/web-search?query=${encodeURIComponent(query)}&mode=${encodeURIComponent(searchMode)}`
      );
      if (res.ok) {
        const data = await res.json();
        addIntelResult({
          query,
          mode: searchMode,
          summary: data.summary,
          results: data.results,
        });
        addCommsMessage?.(
          "system",
          `[WEB INTEL] Reconnaissance complete. Indexed ${data.count || 0} intelligence items into dossiers.`
        );
        setSearchQuery("");
      } else {
        addCommsMessage?.("system", `[WEB INTEL] Search dispatch returned HTTP status ${res.status}.`);
      }
    } catch (err) {
      console.error("[IntelModal] Search failed:", err);
      addCommsMessage?.("system", `[WEB INTEL] Scan failed: ${err.message}`);
    } finally {
      setIsSearching(false);
    }
  };

  if (!isIntelOpen && !isClosing) return null;

  return (
    <aside
      ref={panelRef}
      aria-label="Neural Intel & Dossiers Window"
      style={
        position
          ? {
            left: `${position.x}px`,
            top: `${position.y}px`,
            transition: isDragging ? "none" : "box-shadow 0.2s ease",
          }
          : undefined
      }
      className={`fixed z-35 ${!position ? "top-18 right-6" : ""
        } ${isMinimized ? "w-80 h-auto" : "w-96 sm:w-[460px] md:w-[500px] h-[44vh] max-h-[440px]"
        } max-w-[calc(100vw-2rem)] flex flex-col bg-[rgba(15,12,5,0.65)] backdrop-blur-xl backdrop-saturate-150 border border-[rgba(255, 184, 0,0.25)] shadow-[0_0_40px_rgba(255, 184, 0,0.12),inset_0_1px_0_rgba(255,255,255,0.06)] chamfer-xl overflow-hidden text-[#F0F2F8] font-mono select-none pointer-events-auto p-3.5 gap-2.5 ${isDragging ? "shadow-[0_0_50px_rgba(255, 184, 0,0.25)] border-[rgba(255, 184, 0,0.5)]" : ""
        } ${isClosing ? "scifi-modal-collapse-up" : "scifi-modal-unfold-down"}`}>
      {/* Top Accent Gradient Line */}
      <div className="mx-4 mt-1 h-0.5 w-[calc(100%-32px)] bg-gradient-to-r from-[#FFB800] via-[#FFD54F] to-[#FFB800] animate-pulse shrink-0" />

      {/* Header Bar */}
      <div
        onPointerDown={handlePointerDown}
        className="flex items-center justify-between border-b border-[rgba(255, 184, 0,0.18)] pb-2 shrink-0 cursor-grab active:cursor-grabbing">
        <div className="flex items-center gap-2 pointer-events-none">
          <GripHorizontal className="w-3.5 h-3.5 text-[#FFB800]/60" />
          <div className="p-1 chamfer-xs bg-[rgba(255, 184, 0,0.1)] border border-[rgba(255, 184, 0,0.3)] shadow-[0_0_8px_rgba(255, 184, 0,0.25)]">
            <Globe className="w-3.5 h-3.5 text-[#FFB800]" />
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-['Orbitron',sans-serif] font-bold tracking-wider text-[#FFB800] flex items-center gap-1.5">
              NEURAL INTEL
              {intelSearchResults.length > 0 && (
                <span className="text-[9px] font-mono px-1.5 py-0.2 chamfer-xs bg-[rgba(255, 184, 0,0.15)] border border-[rgba(255, 184, 0,0.3)] text-[#FFB800] font-bold">
                  {intelSearchResults.length}
                </span>
              )}
            </span>
            <span className="text-[9px] font-mono tracking-wider text-[#9E8B65] uppercase">
              Web Reconnaissance &amp; Dossiers
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1" onPointerDown={(e) => e.stopPropagation()}>
          {intelSearchResults.length > 0 && !isMinimized && (
            <button
              onClick={clearIntelResults}
              className="p-1.5 chamfer-btn border border-transparent hover:border-[rgba(255,0,60,0.3)] hover:bg-[rgba(255,0,60,0.1)] text-[#9E8B65] hover:text-[#FF8095] transition-all cursor-pointer"
              title="Clear Dossier Archive">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            onClick={() => setIsMinimized((prev) => !prev)}
            className="p-1.5 chamfer-btn border border-transparent hover:border-[rgba(255, 184, 0,0.3)] hover:bg-[rgba(255, 184, 0,0.1)] text-[#9E8B65] hover:text-[#FFB800] transition-all cursor-pointer"
            title={isMinimized ? "Expand Window" : "Minimize Window"}>
            {isMinimized ? <Maximize2 className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
          </button>

          <button
            onClick={triggerClose}
            className="p-1.5 chamfer-btn border border-transparent hover:border-[rgba(255, 184, 0,0.3)] hover:bg-[rgba(255, 184, 0,0.1)] text-[#9E8B65] hover:text-[#FFB800] transition-all cursor-pointer"
            title="Close Intel Window (Esc)">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {!isMinimized && (
        <>
          {/* Interactive Search Console */}
          <div className="flex flex-col gap-1.5 shrink-0">
            <div className="flex items-center gap-1.5">
              <div className="relative flex-1 flex items-center">
                <Search className="absolute left-2.5 w-3.5 h-3.5 text-[#9E8B65]" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleExecuteSearch()}
                  placeholder="Dispatch query (e.g. 'Next.js 16 updates')..."
                  className="w-full bg-[rgba(255,255,255,0.03)] border border-[rgba(255, 184, 0,0.2)] chamfer-xs pl-8 pr-3 py-1 text-xs font-mono text-[#F0F2F8] focus:outline-none focus:border-[#FFB800] placeholder:text-[#9E8B65]/70"
                />
              </div>

              <button
                onClick={handleExecuteSearch}
                disabled={isSearching || !searchQuery.trim()}
                className="px-2.5 py-1 chamfer-btn bg-[#FFB800] hover:bg-[#FFE066] text-black font-bold text-xs font-mono transition-all disabled:opacity-40 cursor-pointer flex items-center gap-1 shadow-[0_0_10px_rgba(255, 184, 0,0.4)] shrink-0">
                <Sparkles className="w-3 h-3" />
                <span>{isSearching ? "SCAN..." : "SCAN"}</span>
              </button>
            </div>

            {/* Mode Selectors */}
            <div className="flex items-center gap-1">
              {["search", "news", "research"].map((m) => (
                <button
                  key={m}
                  onClick={() => setSearchMode(m)}
                  className={`px-2 py-0.5 chamfer-xs text-[9px] font-mono uppercase tracking-wider transition-all cursor-pointer ${searchMode === m
                      ? "bg-[rgba(255, 184, 0,0.15)] border border-[#FFB800] text-[#FFB800]"
                      : "border border-[rgba(255,255,255,0.08)] text-[#9E8B65] hover:text-[#F0F2F8]"
                    }`}>
                  {m}
                </button>
              ))}
              <span className="ml-auto text-[9px] text-[#9E8B65]">
                {intelSearchResults.length} archived
              </span>
            </div>
          </div>

          {/* Scrollable Intel Dossiers Stream */}
          <div className="flex-1 flex flex-col gap-2.5 overflow-y-auto pr-1 min-h-0">
            {intelSearchResults.length > 0 ? (
              intelSearchResults.map((intel) => (
                <div
                  key={intel.id}
                  className="p-2.5 chamfer-sm border border-[rgba(255, 184, 0,0.2)] bg-[rgba(15,12,5,0.55)] flex flex-col gap-2 shadow-[0_0_15px_rgba(255, 184, 0,0.03),inset_0_1px_0_rgba(255,255,255,0.03)]">
                  {/* Item Header */}
                  <div className="flex items-center justify-between border-b border-[rgba(255, 184, 0,0.1)] pb-1">
                    <div className="flex items-center gap-1.5 truncate mr-2">
                      <span className="px-1.5 py-0.2 chamfer-xs bg-[rgba(255, 184, 0,0.1)] border border-[rgba(255, 184, 0,0.3)] text-[#FFB800] text-[8px] font-mono uppercase font-bold">
                        {intel.mode || "INTEL"}
                      </span>
                      <span className="text-[11px] font-bold text-white truncate font-mono">
                        "{intel.query}"
                      </span>
                    </div>
                    <span className="text-[9px] font-mono text-[#9E8B65] flex items-center gap-1 shrink-0">
                      <Clock className="w-2.5 h-2.5 text-[#FFB800]" />
                      {intel.time}
                    </span>
                  </div>

                  {/* AI Summary Quote */}
                  {intel.summary && (
                    <div className="p-2 chamfer-xs bg-[rgba(255, 184, 0,0.04)] border-l-2 border-[#FFB800] text-[10px] font-mono text-[#FFE066] leading-relaxed whitespace-pre-line">
                      {intel.summary}
                    </div>
                  )}

                  {/* Retrieved Result Links Grid */}
                  {intel.results && intel.results.length > 0 && (
                    <div className="grid grid-cols-1 gap-1.5">
                      {intel.results.map((item, idx) => (
                        <div
                          key={idx}
                          className="p-2 chamfer-xs border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] hover:border-[rgba(255, 184, 0,0.3)] transition-all flex flex-col gap-1">
                          <div className="flex items-start justify-between gap-1">
                            <span className="text-[10px] font-semibold text-white line-clamp-1">
                              {item.title}
                            </span>
                            {item.url && (
                              <a
                                href={item.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-0.5 text-[8px] font-mono text-[#FFB800] hover:underline shrink-0">
                                <span>VIEW</span>
                                <ExternalLink className="w-2 h-2" />
                              </a>
                            )}
                          </div>
                          {item.snippet && (
                            <p className="text-[9px] text-[#9E8B65] line-clamp-2 leading-tight">
                              {item.snippet}
                            </p>
                          )}
                          {item.source && (
                            <span className="text-[8px] font-mono text-[#FFB800]/70 truncate">
                              SOURCE: {item.source}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-4 text-center gap-2 chamfer-sm border border-dashed border-[rgba(255, 184, 0,0.15)] bg-[rgba(15,12,5,0.3)]">
                <Radio className="w-6 h-6 text-[#FFB800] animate-pulse" />
                <div className="text-xs font-['Orbitron',sans-serif] font-bold text-[#FFB800] tracking-wider">
                  NO ACTIVE INTEL DOSSIERS
                </div>
                <p className="text-[10px] font-mono text-[#9E8B65] max-w-xs leading-relaxed">
                  Ask Ultron by voice (<span className="text-white">"Ultron, search for..."</span>,{" "}
                  <span className="text-white">"What's the weather in Tokyo?"</span>) or dispatch a query above to initiate real-time reconnaissance.
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </aside>
  );
}

export default IntelModal;
