"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Brain,
  X,
  Plus,
  Search,
  Trash2,
  Maximize2,
  Database,
  Check,
  Sparkles,
  Filter,
} from "lucide-react";
import { useAdaStore } from "@/lib/store";

export function SciFiMemoryVaultModal() {
  const {
    isMemoryVaultOpen,
    setIsMemoryVaultOpen,
    memories,
    loadMemories,
    setSelectedMemoryModal,
    saveMemoryApi,
    deleteMemoryApi,
    addCommsMessage,
  } = useAdaStore();

  const [isClosing, setIsClosing] = useState(false);
  const closeTimeoutRef = useRef(null);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");

  // Inscribe New Directive Form State
  const [isAdding, setIsAdding] = useState(false);
  const [newContent, setNewContent] = useState("");
  const [newCategory, setNewCategory] = useState("tactical");
  const [newImportance, setNewImportance] = useState("medium");
  const [isSaving, setIsSaving] = useState(false);

  // Inline Delete Confirmation
  const [deletingId, setDeletingId] = useState(null);

  // Reload memories when opened
  useEffect(() => {
    if (isMemoryVaultOpen) {
      loadMemories();
      setIsClosing(false);
      setDeletingId(null);
    }
  }, [isMemoryVaultOpen, loadMemories]);

  // Handle Animated Close
  const triggerClose = () => {
    if (isClosing) return;
    setIsClosing(true);
    closeTimeoutRef.current = setTimeout(() => {
      setIsMemoryVaultOpen(false);
      setIsClosing(false);
      setIsAdding(false);
      setDeletingId(null);
    }, 220); // Matches the 0.22s scifi-modal-collapse-up animation
  };

  // Keyboard shortcut: Escape to close
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && isMemoryVaultOpen) {
        triggerClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isMemoryVaultOpen]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    };
  }, []);

  // Filtered Memories Memo
  const filteredMemories = useMemo(() => {
    return (memories || []).filter((m) => {
      if (filterCategory !== "all" && m.category?.toLowerCase() !== filterCategory) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const content = (m.content || m.text || "").toLowerCase();
        const id = String(m.id || "").toLowerCase();
        const cat = (m.category || "").toLowerCase();
        return content.includes(q) || id.includes(q) || cat.includes(q);
      }
      return true;
    });
  }, [memories, filterCategory, searchQuery]);

  // Save New Directive
  const handleSaveDirective = async (e) => {
    if (e) e.preventDefault();
    const trimmed = newContent.trim();
    if (!trimmed || isSaving) return;

    setIsSaving(true);
    try {
      const created = await saveMemoryApi({
        content: trimmed,
        category: newCategory,
        importance: newImportance,
      });
      if (created) {
        addCommsMessage("system", `New directive inscribed into Neural Vault [${created.id}].`);
        setNewContent("");
        setIsAdding(false);
      }
    } catch (err) {
      console.error("[SciFiMemoryVaultModal] Inscribe failed:", err);
    } finally {
      setIsSaving(false);
    }
  };

  // Handle Purge Directive
  const handleDeleteDirective = async (id, e) => {
    e.stopPropagation();
    if (deletingId !== id) {
      setDeletingId(id);
      return;
    }
    try {
      await deleteMemoryApi(id);
      addCommsMessage("system", `Directive [${id}] expunged from Syndicate Vault.`);
      setDeletingId(null);
    } catch (err) {
      console.error("[SciFiMemoryVaultModal] Delete failed:", err);
    }
  };

  if (!isMemoryVaultOpen && !isClosing) return null;

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) triggerClose();
      }}
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 backdrop-blur-md select-none transition-all duration-200 ${
        isClosing
          ? "opacity-0 backdrop-blur-none pointer-events-none"
          : "opacity-100 backdrop-blur-md"
      }`}>
      {/* Sci-Fi Shutter Unfold / Collapse Modal Container */}
      <div
        className={`relative w-full max-w-3xl max-h-[88vh] bg-[rgba(8,12,18,0.55)] backdrop-blur-xl backdrop-saturate-150 border border-[rgba(0,229,255,0.25)] shadow-[0_0_40px_rgba(0,229,255,0.12),inset_0_1px_0_rgba(255,255,255,0.06)] chamfer-xl overflow-hidden flex flex-col gap-3 text-[#F0F2F8] font-mono ${
          isClosing ? "scifi-modal-collapse-up" : "scifi-modal-unfold-down"
        }`}>
        {/* Holographic Top Accent Gradient Line */}
        <div className="mx-6 mt-1 h-0.5 w-[calc(100%-48px)] bg-gradient-to-r from-[#00E5FF] via-[#70E8FF] to-[#00E5FF] animate-pulse" />

        {/* Modal Header */}
        <div className="px-6 pt-3 flex items-center justify-between border-b border-[rgba(0,229,255,0.18)] pb-3">
          <div className="flex items-center gap-3">
            <div className="p-2 chamfer-xs bg-[rgba(0,229,255,0.1)] border border-[rgba(0,229,255,0.35)] shadow-[0_0_12px_rgba(0,229,255,0.25)]">
              <Brain className="w-4 h-4 text-[#00E5FF]" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-bold tracking-wider text-white flex items-center gap-2 font-['Orbitron',sans-serif]">
                NEURAL MEMORY VAULT
                <span className="text-[10px] font-mono px-1.5 py-0.2 chamfer-xs bg-[rgba(0,229,255,0.15)] border border-[rgba(0,229,255,0.4)] text-[#00E5FF] font-bold">
                  {memories.length} RECORDS
                </span>
              </span>
              <span className="text-[10px] text-[#7E859E]">
                Autonomous Long-Term Recall, Directives &amp; Quantum Knowledge Matrix
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={triggerClose}
              className="px-2.5 py-1 chamfer-xs text-xs text-[#7E859E] hover:text-[#00E5FF] hover:bg-[rgba(0,229,255,0.1)] border border-transparent hover:border-[rgba(0,229,255,0.3)] transition-all cursor-pointer flex items-center gap-1.5"
              title="Close Vault (Escape)">
              <X className="w-4 h-4" />
              <span className="text-[10px] hidden sm:inline font-mono">ESC</span>
            </button>
          </div>
        </div>

        {/* Toolbar: Inscribe Button & Search/Filter Controls */}
        <div className="px-6 flex flex-col gap-2.5">
          {/* Top Row: Inscribe Toggle & Search */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
            <button
              onClick={() => setIsAdding((prev) => !prev)}
              className={`flex items-center justify-center gap-2 px-3.5 py-1.5 chamfer-btn text-xs font-mono font-semibold transition-all cursor-pointer ${
                isAdding
                  ? "border border-[#00E5FF] bg-[rgba(0,229,255,0.2)] text-[#00E5FF] shadow-[0_0_12px_rgba(0,229,255,0.3)]"
                  : "border border-[rgba(0,229,255,0.35)] bg-[rgba(0,229,255,0.08)] text-[#00E5FF] hover:bg-[rgba(0,229,255,0.18)]"
              }`}>
              <Plus className={`w-3.5 h-3.5 transition-transform ${isAdding ? "rotate-45" : ""}`} />
              <span>{isAdding ? "CANCEL INSCRIPTION" : "INSCRIBE DIRECTIVE TO VAULT"}</span>
            </button>

            {/* Live Search Input */}
            <div className="relative flex-1 sm:max-w-xs">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-[#7E859E]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search directives, ID, or keywords..."
                className="w-full pl-8 pr-3 py-1.5 chamfer-btn bg-[rgba(2,12,20,0.85)] border border-[rgba(0,229,255,0.25)] focus:border-[#00E5FF] focus:shadow-[0_0_12px_rgba(0,229,255,0.2)] text-xs text-[#F0F2F8] placeholder-[rgba(126,133,158,0.6)] outline-none transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-2 text-[#7E859E] hover:text-white">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Inscribe Directive Form (Collapsible) */}
          {isAdding && (
            <form
              onSubmit={handleSaveDirective}
              className="p-3.5 chamfer-md bg-[rgba(3,18,28,0.9)] border border-[rgba(0,229,255,0.35)] shadow-[0_4px_20px_rgba(0,0,0,0.4)] flex flex-col gap-2.5 animate-fadeIn">
              <div className="flex items-center justify-between text-[11px] font-bold text-[#00E5FF]">
                <span className="flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" /> NEW DIRECTIVE SPECIFICATION
                </span>
                <span className="text-[9px] text-[#7E859E] font-normal">
                  Persistent Long-Term Storage
                </span>
              </div>

              <textarea
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                placeholder="Specify directive, fact, operational preference, or mission instruction..."
                rows={2}
                autoFocus
                className="w-full bg-[rgba(1,10,16,0.95)] border border-[rgba(0,229,255,0.3)] chamfer-sm p-2 text-xs font-mono text-white placeholder-[rgba(126,133,158,0.6)] focus:outline-none focus:border-[#00E5FF] focus:shadow-[0_0_10px_rgba(0,229,255,0.2)] transition-all resize-none"
              />

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-white/5">
                {/* Category Selection */}
                <div className="flex items-center gap-1 text-[10px]">
                  <span className="text-[#7E859E] mr-1">CATEGORY:</span>
                  {["tactical", "preference", "mission"].map((cat) => (
                    <button
                      type="button"
                      key={cat}
                      onClick={() => setNewCategory(cat)}
                      className={`px-2 py-0.5 chamfer-xs uppercase font-mono transition-all cursor-pointer ${
                        newCategory === cat
                          ? "bg-[#00E5FF] text-[#010e16] font-bold shadow-[0_0_8px_rgba(0,229,255,0.4)]"
                          : "border border-[rgba(0,229,255,0.25)] text-[#7E859E] hover:text-[#00E5FF]"
                      }`}>
                      {cat}
                    </button>
                  ))}
                </div>

                {/* Importance Selection */}
                <div className="flex items-center gap-1 text-[10px]">
                  <span className="text-[#7E859E] mr-1">IMPORTANCE:</span>
                  {["medium", "high", "critical"].map((imp) => (
                    <button
                      type="button"
                      key={imp}
                      onClick={() => setNewImportance(imp)}
                      className={`px-2 py-0.5 chamfer-xs uppercase font-mono transition-all cursor-pointer ${
                        newImportance === imp
                          ? imp === "critical"
                            ? "bg-[#FF003C] text-white font-bold shadow-[0_0_10px_#FF003C]"
                            : imp === "high"
                              ? "bg-[#FFE600] text-black font-bold shadow-[0_0_8px_#FFE600]"
                              : "bg-[#00E5FF] text-black font-bold shadow-[0_0_8px_#00E5FF]"
                          : "border border-[rgba(255,255,255,0.1)] text-[#7E859E] hover:text-white"
                      }`}>
                      {imp}
                    </button>
                  ))}
                </div>

                {/* Save Action */}
                <div className="flex items-center gap-2 ml-auto">
                  <button
                    type="submit"
                    disabled={!newContent.trim() || isSaving}
                    className="flex items-center gap-1 px-3 py-1 chamfer-btn bg-[#00E5FF] hover:bg-[#5ce1e6] text-[#010e16] font-bold text-xs disabled:opacity-30 disabled:pointer-events-none transition-all cursor-pointer shadow-[0_0_10px_rgba(0,229,255,0.3)]">
                    <Check className="w-3.5 h-3.5" />
                    <span>{isSaving ? "INSCRIBING..." : "SAVE TO VAULT"}</span>
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* Category Filter Tabs */}
          <div className="flex items-center justify-between gap-2 border-b border-white/5 pb-2 text-[10px]">
            <div className="flex items-center gap-1.5">
              <Filter className="w-3 h-3 text-[#7E859E] mr-1" />
              {["all", "tactical", "preference", "mission"].map((c) => (
                <button
                  key={c}
                  onClick={() => setFilterCategory(c)}
                  className={`px-2 py-0.5 chamfer-xs uppercase font-mono transition-all cursor-pointer ${
                    filterCategory === c
                      ? "bg-[rgba(0,229,255,0.2)] text-[#00E5FF] border border-[#00E5FF] shadow-[0_0_8px_rgba(0,229,255,0.3)] font-semibold"
                      : "text-[#7E859E] hover:text-white border border-transparent hover:border-white/10"
                  }`}>
                  {c}
                </button>
              ))}
            </div>

            <span className="text-[9px] text-[#7E859E] font-mono">
              MATCHING: <strong className="text-[#00E5FF]">{filteredMemories.length}</strong>
            </span>
          </div>
        </div>

        {/* Scrollable Memories Card Grid */}
        <div className="px-6 py-1 overflow-y-auto max-h-[50vh] flex flex-col gap-2.5">
          {filteredMemories.map((mem) => {
            const category = mem.category?.toLowerCase() || "tactical";
            const isCritical = mem.importance?.toLowerCase() === "critical";
            const isHigh = mem.importance?.toLowerCase() === "high";
            const content = mem.content || mem.text || "Directive payload encrypted in vault.";
            const isDeleting = deletingId === mem.id;

            return (
              <div
                key={mem.id}
                onClick={() => setSelectedMemoryModal(mem)}
                className="p-3 chamfer-md border border-[rgba(0,229,255,0.2)] bg-[rgba(4,16,25,0.7)] hover:border-[#00E5FF] hover:bg-[rgba(0,229,255,0.06)] hover:shadow-[0_0_18px_rgba(0,229,255,0.15)] transition-all flex flex-col gap-2 cursor-pointer group shadow-sm relative">
                {/* Header Row: ID, Category, Importance, Timestamp, Delete */}
                <div className="flex items-center justify-between text-[10px] font-mono">
                  <div className="flex items-center gap-2">
                    <span className="text-[#00E5FF] font-bold tracking-wider">
                      SEC-REC-{mem.id ? String(mem.id).slice(-4).toUpperCase() : "00"}
                    </span>

                    <span
                      className={`px-1.5 py-0.2 chamfer-xs uppercase border text-[9px] font-semibold ${
                        category === "mission"
                          ? "bg-[rgba(0,229,255,0.15)] text-[#00E5FF] border-[rgba(0,229,255,0.4)]"
                          : category === "preference"
                            ? "bg-[rgba(255,128,149,0.15)] text-[#FF8095] border-[rgba(255,128,149,0.4)]"
                            : "bg-[rgba(255,230,0,0.15)] text-[#FFE600] border-[rgba(255,230,0,0.4)]"
                      }`}>
                      {category}
                    </span>

                    {isCritical && (
                      <span className="text-[8px] text-[#FF003C] font-bold border border-[#FF003C]/40 bg-[#FF003C]/10 px-1 chamfer-xs animate-pulse shadow-[0_0_6px_rgba(255,0,60,0.3)]">
                        CRITICAL
                      </span>
                    )}
                    {isHigh && (
                      <span className="text-[8px] text-[#FFE600] font-bold border border-[#FFE600]/40 bg-[#FFE600]/10 px-1 chamfer-xs shadow-[0_0_6px_rgba(255,230,0,0.3)]">
                        HIGH
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 text-[#7E859E]">
                    <span className="text-[9px]">
                      {mem.timestamp
                        ? new Date(mem.timestamp).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                          })
                        : "ACTIVE"}
                    </span>

                    {/* Delete Action */}
                    <button
                      onClick={(e) => handleDeleteDirective(mem.id, e)}
                      className={`p-1 chamfer-xs transition-all cursor-pointer ${
                        isDeleting
                          ? "bg-[#FF003C] text-white font-bold animate-pulse px-1.5"
                          : "text-[#7E859E] hover:text-[#FF003C] hover:bg-[rgba(255,0,60,0.15)]"
                      }`}
                      title={isDeleting ? "Click again to confirm purge" : "Purge directive"}>
                      {isDeleting ? (
                        <span className="text-[9px]">CONFIRM?</span>
                      ) : (
                        <Trash2 className="w-3 h-3" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Content Preview */}
                <p className="text-xs text-[#F0F2F8] font-mono leading-relaxed line-clamp-2">
                  {content}
                </p>

                {/* Card Footer: Source & Decrypt CTA */}
                <div className="flex items-center justify-between pt-1 border-t border-white/5 text-[9px] text-[#7E859E]">
                  <span className="truncate max-w-[200px] opacity-70">
                    {mem.source ? `SOURCE: ${mem.source}` : "QUANTUM ENCRYPTED"}
                  </span>

                  <span className="flex items-center gap-1 text-[#00E5FF] font-semibold opacity-80 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all">
                    <span>DECRYPT MODAL</span>
                    <Maximize2 className="w-2.5 h-2.5" />
                  </span>
                </div>
              </div>
            );
          })}

          {filteredMemories.length === 0 && (
            <div className="text-center py-10 flex flex-col items-center gap-2 text-[#7E859E] font-mono">
              <Database className="w-6 h-6 opacity-40 text-[#00E5FF]" />
              <span className="text-xs italic">
                {searchQuery
                  ? "No directives matching search criteria."
                  : "Neural Memory Vault is currently empty."}
              </span>
              <button
                onClick={() => setIsAdding(true)}
                className="mt-1 text-[11px] text-[#00E5FF] underline hover:text-white cursor-pointer">
                Inscribe your first directive
              </button>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-2.5 border-t border-[rgba(0,229,255,0.18)] flex items-center justify-between text-[10px] text-[#7E859E] font-mono bg-[rgba(2,8,14,0.6)]">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00E5FF] animate-pulse" />
            <span>Click any card to open decrypted detail modal &amp; in-place editor</span>
          </div>

          <button
            onClick={triggerClose}
            className="px-3 py-1 chamfer-btn border border-[rgba(0,229,255,0.3)] bg-[rgba(0,229,255,0.06)] text-[#00E5FF] hover:bg-[#00E5FF] hover:text-[#010e16] font-semibold transition-all cursor-pointer">
            CLOSE VAULT
          </button>
        </div>
      </div>
    </div>
  );
}

export default SciFiMemoryVaultModal;
