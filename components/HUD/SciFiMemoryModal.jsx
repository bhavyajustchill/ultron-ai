"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Brain,
  ShieldAlert,
  Target,
  Clock,
  Fingerprint,
  Copy,
  Check,
  Trash2,
  X,
  Edit3,
  Save,
  Database,
  Cpu,
  Layers,
  Sparkles,
  AlertTriangle,
} from "lucide-react";
import { useAdaStore } from "@/lib/store";

export function SciFiMemoryModal() {
  const {
    selectedMemoryModal,
    setSelectedMemoryModal,
    deleteMemoryApi,
    updateMemoryApi,
    addCommsMessage,
  } = useAdaStore();

  const [activeMemory, setActiveMemory] = useState(null);
  const [isClosing, setIsClosing] = useState(false);
  const closeTimeoutRef = useRef(null);

  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [draftContent, setDraftContent] = useState("");
  const [draftCategory, setDraftCategory] = useState("tactical");
  const [draftImportance, setDraftImportance] = useState("medium");

  // Sync draft state whenever a new memory is selected
  useEffect(() => {
    if (selectedMemoryModal) {
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
      setActiveMemory(selectedMemoryModal);
      setIsClosing(false);
      setDraftContent(selectedMemoryModal.content || selectedMemoryModal.text || "");
      setDraftCategory(selectedMemoryModal.category || "tactical");
      setDraftImportance(selectedMemoryModal.importance || "medium");
      setIsEditing(false);
      setIsConfirmingDelete(false);
      setCopied(false);
    } else if (!isClosing && activeMemory) {
      triggerClose();
    }
  }, [selectedMemoryModal]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    };
  }, []);

  const triggerClose = () => {
    if (isClosing) return;
    setIsClosing(true);
    closeTimeoutRef.current = setTimeout(() => {
      setActiveMemory(null);
      setIsClosing(false);
      setSelectedMemoryModal(null);
      setIsEditing(false);
      setIsConfirmingDelete(false);
    }, 220); // Matches the 0.22s collapse animation
  };

  const handleClose = () => {
    triggerClose();
  };

  // Keyboard shortcut: Escape to close
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && (selectedMemoryModal || activeMemory)) {
        handleClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedMemoryModal, activeMemory]);

  if (!activeMemory && !selectedMemoryModal) return null;
  const currentMemory = activeMemory || selectedMemoryModal;

  const handleCopyDirective = () => {
    const textToCopy = draftContent || currentMemory.content || currentMemory.text || "";
    if (!textToCopy) return;
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveEdit = async () => {
    if (!draftContent.trim()) return;
    await updateMemoryApi({
      id: currentMemory.id,
      content: draftContent.trim(),
      category: draftCategory,
      importance: draftImportance,
    });
    setIsEditing(false);
    addCommsMessage("system", `Memory directive [${currentMemory.id}] updated in Syndicate Vault.`);
  };

  const handleDelete = async () => {
    if (!isConfirmingDelete) {
      setIsConfirmingDelete(true);
      return;
    }
    const id = currentMemory.id;
    await deleteMemoryApi(id);
    addCommsMessage("system", `Memory record [${id}] expunged from Syndicate Vault.`);
    handleClose();
  };

  // Importance color badges
  const getImportanceBadge = (importance) => {
    switch (importance?.toLowerCase()) {
      case "critical":
        return {
          text: "CRITICAL",
          color:
            "text-[#FF003C] border-[rgba(255,0,60,0.4)] bg-[rgba(255,0,60,0.12)] shadow-[0_0_12px_rgba(255,0,60,0.3)]",
          dot: "bg-[#FF003C] animate-ping",
        };
      case "high":
        return {
          text: "HIGH PRIORITY",
          color:
            "text-[#FFE600] border-[rgba(255,230,0,0.4)] bg-[rgba(255,230,0,0.12)] shadow-[0_0_10px_rgba(255,230,0,0.25)]",
          dot: "bg-[#FFE600] animate-pulse",
        };
      case "medium":
        return {
          text: "STANDARD",
          color: "text-[#00F0FF] border-[rgba(0,240,255,0.3)] bg-[rgba(0,240,255,0.08)]",
          dot: "bg-[#00F0FF]",
        };
      default:
        return {
          text: "LOW / RECON",
          color: "text-[#7E859E] border-[rgba(255,255,255,0.15)] bg-[rgba(255,255,255,0.04)]",
          dot: "bg-[#7E859E]",
        };
    }
  };

  // Category visual helper
  const getCategoryIcon = (category) => {
    switch (category?.toLowerCase()) {
      case "mission":
        return <Target className="w-3.5 h-3.5 text-[#00F0FF]" />;
      case "preference":
        return <Brain className="w-3.5 h-3.5 text-[#FF8095]" />;
      case "tactical":
      default:
        return <ShieldAlert className="w-3.5 h-3.5 text-[#FFE600]" />;
    }
  };

  const importanceBadge = getImportanceBadge(currentMemory.importance);
  const memoryTimestamp = currentMemory.timestamp ? new Date(currentMemory.timestamp) : new Date();

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
      className={`fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6 backdrop-blur-md select-none transition-all duration-200 ${
        isClosing
          ? "opacity-0 backdrop-blur-none pointer-events-none"
          : "opacity-100 backdrop-blur-md"
      }`}>
      {/* Sci-Fi Shutter Unfold / Collapse Modal Container */}
      <div
        className={`relative w-full max-w-2xl bg-[rgba(8,12,18,0.55)] backdrop-blur-xl backdrop-saturate-150 border border-[rgba(0,229,255,0.25)] shadow-[0_0_40px_rgba(0,229,255,0.12),inset_0_1px_0_rgba(255,255,255,0.06)] chamfer-xl overflow-hidden flex flex-col gap-4 text-[#F0F2F8] font-mono ${
          isClosing ? "scifi-modal-collapse-up" : "scifi-modal-unfold-down"
        }`}>
        {/* Holographic Top Accent Bar */}
        <div className="mx-6 mt-1 h-0.5 w-[calc(100%-48px)] bg-gradient-to-r from-[#FF003C] via-[#00F0FF] to-[#FF003C] animate-pulse" />

        {/* Modal Header */}
        <div className="px-6 pt-3 pb-2 flex items-center justify-between border-b border-[rgba(0,240,255,0.18)]">
          <div className="flex items-center gap-3">
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00F0FF] opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#00F0FF]" />
            </span>
            <div>
              <h2 className="text-xs sm:text-sm font-['Orbitron',sans-serif] font-bold tracking-wider text-[#00F0FF]">
                SYNDICATE NEURAL MEMORY VAULT
              </h2>
              <p className="text-[10px] text-[#7E859E]">
                QUANTUM PERSISTENCE LAYER // RECORD DECRYPTED
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <span className="text-[11px] font-mono font-bold text-[#FF003C] border border-[#FF003C]/40 bg-[#FF003C]/10 px-2.5 py-0.5 chamfer-xs shadow-[0_0_10px_rgba(255,0,60,0.25)] whitespace-nowrap">
              SEC-REC-{currentMemory.id ? String(currentMemory.id).slice(-4).toUpperCase() : "09"}
            </span>
            <button
              onClick={handleClose}
              className="px-2.5 py-1 chamfer-xs text-xs text-[#7E859E] hover:text-[#FF003C] hover:bg-[#FF003C]/10 border border-transparent hover:border-[#FF003C]/30 transition-all cursor-pointer flex items-center gap-1.5"
              title="Close Modal (Escape)">
              <X className="w-4 h-4" />
              <span className="text-[10px] hidden sm:inline font-mono">ESC</span>
            </button>
          </div>
        </div>

        {/* Context Telemetry Grid */}
        <div className="px-6 grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
          {/* 1. Category */}
          <div className="p-2 chamfer-sm border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] flex flex-col gap-1">
            <div className="flex items-center justify-between text-[10px] text-[#7E859E]">
              <span>CATEGORY</span>
              {getCategoryIcon(isEditing ? draftCategory : currentMemory.category)}
            </div>
            {isEditing ? (
              <select
                value={draftCategory}
                onChange={(e) => setDraftCategory(e.target.value)}
                className="bg-[#050508] border border-[rgba(0,240,255,0.3)] chamfer-xs px-1.5 py-0.5 text-xs text-[#00F0FF] uppercase focus:outline-none">
                <option value="tactical">tactical</option>
                <option value="preference">preference</option>
                <option value="mission">mission</option>
              </select>
            ) : (
              <span className="font-bold uppercase text-[#00F0FF]">
                {currentMemory.category || "TACTICAL"}
              </span>
            )}
          </div>

          {/* 2. Priority / Importance */}
          <div className="p-2 chamfer-sm border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] flex flex-col gap-1">
            <div className="flex items-center justify-between text-[10px] text-[#7E859E]">
              <span>PRIORITY</span>
              <span className={`w-1.5 h-1.5 rounded-full ${importanceBadge.dot}`} />
            </div>
            {isEditing ? (
              <select
                value={draftImportance}
                onChange={(e) => setDraftImportance(e.target.value)}
                className="bg-[#050508] border border-[rgba(0,240,255,0.3)] chamfer-xs px-1.5 py-0.5 text-xs text-[#FFE600] uppercase focus:outline-none">
                <option value="critical">critical</option>
                <option value="high">high</option>
                <option value="medium">medium</option>
                <option value="low">low</option>
              </select>
            ) : (
              <span className="font-bold uppercase text-white">{importanceBadge.text}</span>
            )}
          </div>

          {/* 3. Source Origin */}
          <div className="p-2 chamfer-sm border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] flex flex-col gap-1">
            <div className="flex items-center justify-between text-[10px] text-[#7E859E]">
              <span>ORIGIN</span>
              <Cpu className="w-3.5 h-3.5 text-[#7E859E]" />
            </div>
            <span className="font-mono text-[11px] text-[#FF8095] truncate">
              {currentMemory.source || "operative_dialog"}
            </span>
          </div>

          {/* 4. Timestamp */}
          <div className="p-2 chamfer-sm border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] flex flex-col gap-1">
            <div className="flex items-center justify-between text-[10px] text-[#7E859E]">
              <span>INSCRIBED</span>
              <Clock className="w-3.5 h-3.5 text-[#7E859E]" />
            </div>
            <span className="font-mono text-[11px] text-[#F0F2F8]">
              {memoryTimestamp.toLocaleDateString()}
            </span>
          </div>
        </div>

        {/* Directive Payload Console */}
        <div className="px-6 flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-[#00F0FF] font-semibold flex items-center gap-1.5">
              <span className="text-[#FF003C]">&gt;</span> DIRECTIVE_PAYLOAD:
            </span>
            <span className="text-[10px] text-[#7E859E]">
              {memoryTimestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          </div>

          <div className="relative p-4 chamfer-md bg-[rgba(5,5,8,0.92)] border border-[rgba(0,240,255,0.2)] shadow-[inset_0_0_20px_rgba(0,0,0,0.8)]">
            {/* Terminal Line Number Strip */}
            <div className="absolute top-4 left-3 select-none text-[11px] font-mono text-[#7E859E]/40 leading-relaxed flex flex-col text-right pr-2 border-r border-white/5">
              <span>01</span>
              <span>02</span>
              <span>03</span>
              <span>04</span>
            </div>

            {isEditing ? (
              <textarea
                value={draftContent}
                onChange={(e) => setDraftContent(e.target.value)}
                rows={5}
                className="w-full pl-8 bg-transparent text-sm text-[#F0F2F8] font-mono leading-relaxed focus:outline-none resize-none"
                placeholder="Directive content..."
                autoFocus
              />
            ) : (
              <div className="pl-8 text-sm text-[#F0F2F8] font-mono leading-relaxed break-words whitespace-pre-wrap selection:bg-[#00F0FF]/20 selection:text-[#00F0FF]">
                {currentMemory.content || currentMemory.text || "NO DIRECTIVE PAYLOAD RECORDED."}
              </div>
            )}
          </div>
        </div>

        {/* Modal Action Controls Footer */}
        <div className="px-6 py-3 border-t border-[rgba(255,255,255,0.08)] bg-[rgba(5,5,8,0.6)] flex flex-wrap items-center justify-between gap-3 text-xs">
          {/* Status Indicator */}
          <div className="flex items-center gap-2 text-[10px] text-[#7E859E]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00FF66]" />
            <span className="hidden sm:inline">STATE: COMMITTED TO GEMINI CONTEXT</span>
            <span className="sm:hidden">COMMITTED</span>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            {/* Purge Record */}
            <button
              onClick={handleDelete}
              className={`px-3 py-1.5 chamfer-btn font-mono text-xs flex items-center gap-1.5 transition-all cursor-pointer ${
                isConfirmingDelete
                  ? "bg-[#FF003C] text-white font-bold animate-pulse shadow-[0_0_15px_#FF003C]"
                  : "border border-[rgba(255,0,60,0.3)] bg-[rgba(255,0,60,0.06)] text-[#FF8095] hover:bg-[#FF003C]/20 hover:border-[#FF003C]"
              }`}
              title={
                isConfirmingDelete
                  ? "Click again to confirm purge"
                  : "Purge directive from memory vault"
              }>
              <Trash2 className="w-3.5 h-3.5" />
              <span>{isConfirmingDelete ? "CONFIRM PURGE?" : "PURGE"}</span>
            </button>

            {/* Copy Directive */}
            <button
              onClick={handleCopyDirective}
              className="px-3 py-1.5 chamfer-btn border border-[rgba(255,255,255,0.15)] bg-[rgba(255,255,255,0.03)] hover:border-[#00F0FF] hover:text-[#00F0FF] transition-all cursor-pointer flex items-center gap-1.5">
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-[#00FF66]" />
                  <span className="text-[#00FF66]">COPIED</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>COPY</span>
                </>
              )}
            </button>

            {/* Edit / Save */}
            {isEditing ? (
              <button
                onClick={handleSaveEdit}
                className="px-3.5 py-1.5 chamfer-btn bg-[#00F0FF] hover:bg-[#80F7FF] text-black font-bold flex items-center gap-1.5 shadow-[0_0_15px_rgba(0,240,255,0.4)] transition-all cursor-pointer">
                <Save className="w-3.5 h-3.5" />
                <span>SAVE</span>
              </button>
            ) : (
              <button
                onClick={() => setIsEditing(true)}
                className="px-3 py-1.5 chamfer-btn border border-[rgba(0,240,255,0.4)] bg-[rgba(0,240,255,0.08)] text-[#00F0FF] hover:bg-[#00F0FF]/20 hover:border-[#00F0FF] flex items-center gap-1.5 transition-all cursor-pointer">
                <Edit3 className="w-3.5 h-3.5" />
                <span>EDIT</span>
              </button>
            )}

            {/* Dismiss */}
            <button
              onClick={handleClose}
              className="px-3 py-1.5 chamfer-btn bg-white/10 hover:bg-white/20 text-white transition-all cursor-pointer">
              CLOSE
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

