"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpDown, Brain, Database, Download, Layers, Pin, Plus, RefreshCw, Search, Sparkles, Undo2, Upload, X } from "lucide-react";
import { useJarvisStore } from "@/lib/store";
import { BulkBar, MemoryRow } from "@/components/HUD/MemoryVault/MemoryList";
import { MemoryEditor } from "@/components/HUD/MemoryVault/MemoryEditor";
import { DuplicateReview } from "@/components/HUD/MemoryVault/DuplicateReview";
import { CATEGORIES, IMPORTANCE, ghostButton, inputClass, solidButton, sourceKind } from "@/components/HUD/MemoryVault/vaultUi";

const IMPORTANCE_RANK = { critical: 3, high: 2, medium: 1, low: 0 };
const TOAST_MS = 10000;
const groupKey = (group) => group.memories.map((m) => m.id).sort().join("|");

const SORTERS = {
  relevance: () => 0,
  newest: (a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0),
  oldest: (a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0),
  importance: (a, b) => (IMPORTANCE_RANK[b.importance] ?? 1) - (IMPORTANCE_RANK[a.importance] ?? 1) || SORTERS.newest(a, b),
  edited: (a, b) => new Date(b.updatedAt || b.timestamp || 0) - new Date(a.updatedAt || a.timestamp || 0),
  context: (a, b) => (a.context === "prompt" ? a.slot : 999) - (b.context === "prompt" ? b.slot : 999) || SORTERS.newest(a, b),
};

/**
 * Memory vault manager (Phase 10.2): everything Jarvis remembers between conversations, which of
 * it he carries in context, and the tools to curate it.
 */
export function SciFiMemoryVaultModal() {
  const isMemoryVaultOpen = useJarvisStore((s) => s.isMemoryVaultOpen);
  const setIsMemoryVaultOpen = useJarvisStore((s) => s.setIsMemoryVaultOpen);
  const memories = useJarvisStore((s) => s.memories);
  const stats = useJarvisStore((s) => s.memoryStats);
  const status = useJarvisStore((s) => s.status);
  const userApiKey = useJarvisStore((s) => s.userApiKey);
  const { loadMemories, saveMemoryApi, updateMemoryApi, deleteMemoriesApi, memoryVaultAction, addCommsMessage } = useJarvisStore.getState();

  const [isClosing, setIsClosing] = useState(false);
  const closeTimeoutRef = useRef(null);
  const fileInputRef = useRef(null);
  const toastTimerRef = useRef(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchMode, setSearchMode] = useState("words");
  const [semantic, setSemantic] = useState({ results: null, loading: false, error: null });
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterImportance, setFilterImportance] = useState("all");
  const [filterSource, setFilterSource] = useState("all");
  const [filterContext, setFilterContext] = useState("all");
  const [sortBy, setSortBy] = useState("newest");

  const [selectedId, setSelectedId] = useState(null);
  const [paneMode, setPaneMode] = useState("detail"); // detail | new | duplicates
  const [checkedIds, setCheckedIds] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const [contextChanged, setContextChanged] = useState(false);
  const [duplicates, setDuplicates] = useState({ loading: false, error: null, mode: null, groups: [] });
  const [dismissedGroups, setDismissedGroups] = useState(() => new Set());

  const apiKey = () => userApiKey || useJarvisStore.getState().userApiKey || "";
  const limit = stats?.prompt_limit || 15;

  const showToast = useCallback((message, extra = {}) => {
    clearTimeout(toastTimerRef.current);
    setToast({ message, ...extra });
    toastTimerRef.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  // Reload and reset when opened
  useEffect(() => {
    if (!isMemoryVaultOpen) return;
    setIsClosing(false);
    setCheckedIds(new Set());
    setPaneMode("detail");
    loadMemories();
  }, [isMemoryVaultOpen, loadMemories]);

  const triggerClose = useCallback(() => {
    if (isClosing) return;
    setIsClosing(true);
    closeTimeoutRef.current = setTimeout(() => {
      setIsMemoryVaultOpen(false);
      setIsClosing(false);
      setToast(null);
    }, 220); // Matches the 0.22s scifi-modal-collapse-up animation
  }, [isClosing, setIsMemoryVaultOpen]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && isMemoryVaultOpen) triggerClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isMemoryVaultOpen, triggerClose]);

  useEffect(
    () => () => {
      clearTimeout(closeTimeoutRef.current);
      clearTimeout(toastTimerRef.current);
    },
    []
  );

  // Search by meaning: ranked server-side (debounced), then filtered and shown like any list
  useEffect(() => {
    const query = searchQuery.trim();
    if (searchMode !== "meaning" || !query) {
      setSemantic({ results: null, loading: false, error: null });
      return undefined;
    }
    setSemantic((s) => ({ ...s, loading: true, error: null }));
    const timer = setTimeout(async () => {
      try {
        const key = apiKey();
        const res = await fetch(`/api/memory?query=${encodeURIComponent(query)}&limit=all`, { headers: key ? { "x-gemini-api-key": key } : {} });
        const data = await res.json();
        setSemantic({
          results: data.memories || [],
          loading: false,
          error: data.search_mode === "semantic" ? null : "Meaning search unavailable right now; matched words instead.",
        });
        setSortBy("relevance");
      } catch {
        setSemantic({ results: null, loading: false, error: "Search failed." });
      }
    }, 450);
    return () => clearTimeout(timer);
  }, [searchQuery, searchMode]);

  useEffect(() => {
    if (sortBy === "relevance" && !semantic.results) setSortBy("newest");
  }, [semantic.results, sortBy]);

  const visible = useMemo(() => {
    const byId = new Map(memories.map((m) => [m.id, m]));
    let list = semantic.results
      ? semantic.results.map((r) => (byId.has(r.id) ? { ...byId.get(r.id), relevance: r.relevance } : null)).filter(Boolean)
      : memories;
    const q = searchQuery.trim().toLowerCase();
    if (q && !semantic.results && searchMode === "words") {
      list = list.filter((m) => [m.content, m.category, m.source, m.id].some((f) => String(f || "").toLowerCase().includes(q)));
    }
    list = list.filter(
      (m) =>
        (filterCategory === "all" || (m.category || "").toLowerCase() === filterCategory) &&
        (filterImportance === "all" || (m.importance || "medium") === filterImportance) &&
        (filterSource === "all" || sourceKind(m.source) === filterSource) &&
        (filterContext === "all" || (filterContext === "pinned" ? m.pinned : m.context === filterContext))
    );
    return sortBy === "relevance" ? list : [...list].sort(SORTERS[sortBy] || SORTERS.newest);
  }, [memories, semantic.results, searchQuery, searchMode, filterCategory, filterImportance, filterSource, filterContext, sortBy]);

  // Keep a record selected while browsing
  useEffect(() => {
    if (paneMode !== "detail") return;
    if (!selectedId || !memories.some((m) => m.id === selectedId)) setSelectedId(visible[0]?.id || null);
  }, [visible, memories, selectedId, paneMode]);

  // Drop checks for records that are gone
  useEffect(() => {
    setCheckedIds((prev) => {
      const live = new Set(memories.map((m) => m.id));
      const next = new Set([...prev].filter((id) => live.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [memories]);

  const selected = memories.find((m) => m.id === selectedId) || null;
  const filtersActive = filterCategory !== "all" || filterImportance !== "all" || filterSource !== "all" || filterContext !== "all" || searchQuery.trim();

  const run = async (work) => {
    setBusy(true);
    try {
      return await work();
    } finally {
      setBusy(false);
    }
  };

  // ── Actions ──
  const handleCreate = (fields) =>
    run(async () => {
      const created = await saveMemoryApi(fields);
      if (!created) return showToast("The memory could not be saved.", { tone: "error" });
      addCommsMessage("system", `[DEEP MEMORY] Saved to the vault: "${created.content.slice(0, 60)}${created.content.length > 60 ? "..." : ""}"`);
      setPaneMode("detail");
      setSelectedId(created.id);
      setContextChanged(true);
      showToast("Memory saved.");
    });

  const handleUpdate = (id, fields) =>
    run(async () => {
      const updated = await updateMemoryApi({ id, ...fields });
      if (!updated) return showToast("The change could not be saved.", { tone: "error" });
      setContextChanged(true);
      if (fields.content !== undefined) showToast("Text saved.");
    });

  const handleDelete = (ids) =>
    run(async () => {
      const index = visible.findIndex((m) => ids.includes(m.id));
      const undoId = await deleteMemoriesApi(ids);
      if (!undoId) return showToast("Nothing was deleted.", { tone: "error" });
      setContextChanged(true);
      setCheckedIds(new Set());
      const next = visible.filter((m) => !ids.includes(m.id))[Math.max(0, index)] || null;
      setSelectedId(next?.id || null);
      showToast(`Deleted ${ids.length} memor${ids.length === 1 ? "y" : "ies"}.`, { undoId });
    });

  const handleUndo = (undoId) =>
    run(async () => {
      const result = await memoryVaultAction("restore", { undo_id: undoId });
      setContextChanged(true);
      showToast(result.success ? "Undone." : result.message, result.success ? {} : { tone: "error" });
    });

  const handleBulk = (changes) =>
    run(async () => {
      const ids = [...checkedIds];
      const result = await memoryVaultAction("bulk_update", { ids, changes });
      if (!result.success) return showToast(result.message, { tone: "error" });
      setContextChanged(true);
      showToast(`Updated ${result.updated} memor${result.updated === 1 ? "y" : "ies"}.`);
    });

  const handleImport = async (file) => {
    if (!file) return;
    let parsed;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      return showToast("That file is not valid JSON.", { tone: "error" });
    }
    const records = Array.isArray(parsed) ? parsed : parsed.memories;
    await run(async () => {
      const result = await memoryVaultAction("import", { memories: records });
      if (!result.success) return showToast(result.message, { tone: "error" });
      if (result.added) setContextChanged(true);
      showToast(
        `Imported ${result.added} memor${result.added === 1 ? "y" : "ies"}${result.skipped ? `, skipped ${result.skipped} already in the vault` : ""}${result.invalid ? `, ${result.invalid} unreadable` : ""}.`,
        result.undo_id ? { undoId: result.undo_id } : {}
      );
    });
  };

  const loadDuplicates = async () => {
    setPaneMode("duplicates");
    setDuplicates({ loading: true, error: null, mode: null, groups: [] });
    try {
      const key = apiKey();
      const res = await fetch("/api/memory?duplicates=1", { headers: key ? { "x-gemini-api-key": key } : {} });
      const data = await res.json();
      setDuplicates({ loading: false, error: data.success ? null : data.message || "Could not compare memories.", mode: data.mode, groups: data.groups || [] });
    } catch {
      setDuplicates({ loading: false, error: "Could not compare memories.", mode: null, groups: [] });
    }
  };

  const handleMerge = (payload) =>
    run(async () => {
      const result = await memoryVaultAction("merge", payload);
      if (!result.success) return showToast(result.message, { tone: "error" });
      setContextChanged(true);
      const touched = new Set([payload.keep_id, ...payload.remove_ids]);
      setDuplicates((d) => ({ ...d, groups: d.groups.filter((g) => !g.memories.some((m) => touched.has(m.id))) }));
      showToast(`Merged ${payload.remove_ids.length + 1} memories into one.`, { undoId: result.undo_id });
    });

  const relink = () => {
    const relinkSession = useJarvisStore.getState().relinkSession;
    if (!relinkSession) return;
    relinkSession();
    setContextChanged(false);
    showToast("Re-linking: Jarvis picks up the vault changes in a moment.");
  };

  const toggleCheck = (id) =>
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (!isMemoryVaultOpen && !isClosing) return null;

  const duplicateGroups = duplicates.groups.filter((g) => !dismissedGroups.has(groupKey(g)));
  const connected = status && status !== "DISCONNECTED";
  const selectClass = `${inputClass} py-1 px-1.5 text-[10px] uppercase cursor-pointer`;

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) triggerClose();
      }}
      className={`fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 select-none transition-all duration-200 ${
        isClosing ? "opacity-0 backdrop-blur-none pointer-events-none" : "opacity-100 backdrop-blur-md"
      }`}>
      <div
        role="dialog"
        aria-label="Neural memory vault"
        data-testid="memory-vault"
        className={`relative w-full max-w-6xl h-[90vh] bg-[rgba(8,12,18,0.62)] backdrop-blur-xl backdrop-saturate-150 border border-[rgba(var(--jarvis-accent-rgb),0.25)] shadow-[0_0_40px_rgba(var(--jarvis-accent-rgb),0.12),inset_0_1px_0_rgba(255,255,255,0.06)] chamfer-xl overflow-hidden flex flex-col text-[#F0F2F8] font-mono ${
          isClosing ? "scifi-modal-collapse-up" : "scifi-modal-unfold-down"
        }`}>
        <div className="mx-6 mt-1 h-0.5 w-[calc(100%-48px)] bg-gradient-to-r from-[var(--jarvis-accent)] via-[var(--jarvis-accent-soft)] to-[var(--jarvis-accent)] animate-pulse" />

        {/* Header */}
        <div className="px-4 sm:px-6 pt-3 pb-3 flex items-center justify-between gap-3 border-b border-[rgba(var(--jarvis-accent-rgb),0.18)]">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 chamfer-xs bg-[rgba(var(--jarvis-accent-rgb),0.1)] border border-[rgba(var(--jarvis-accent-rgb),0.35)] shadow-[0_0_12px_rgba(var(--jarvis-accent-rgb),0.25)]">
              <Brain className="w-4 h-4 text-[var(--jarvis-accent)]" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-bold tracking-wider text-white flex items-center gap-2 font-['Orbitron',sans-serif]">
                NEURAL MEMORY VAULT
                <span className="text-[10px] font-mono px-1.5 chamfer-xs bg-[rgba(var(--jarvis-accent-rgb),0.15)] border border-[rgba(var(--jarvis-accent-rgb),0.4)] text-[var(--jarvis-accent)] font-bold" data-testid="vault-count">
                  {memories.length} RECORDS
                </span>
              </span>
              <span className="text-[10px] text-[#7E859E] truncate">Everything Jarvis remembers between conversations, and what he keeps in mind</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <a href="/api/memory?export=1" download className={ghostButton} title="Download the whole vault as JSON">
              <Download className="w-3 h-3" /> <span className="hidden sm:inline">EXPORT</span>
            </a>
            <button type="button" className={ghostButton} onClick={() => fileInputRef.current?.click()} title="Add memories from an exported vault file" disabled={busy}>
              <Upload className="w-3 h-3" /> <span className="hidden sm:inline">IMPORT</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              data-testid="vault-import-input"
              onChange={(e) => {
                handleImport(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={triggerClose}
              className="px-2.5 py-1 chamfer-xs text-xs text-[#7E859E] hover:text-[var(--jarvis-accent)] hover:bg-[rgba(var(--jarvis-accent-rgb),0.1)] border border-transparent hover:border-[rgba(var(--jarvis-accent-rgb),0.3)] transition-all cursor-pointer flex items-center gap-1.5"
              title="Close Vault (Escape)">
              <X className="w-4 h-4" />
              <span className="text-[10px] hidden sm:inline">ESC</span>
            </button>
          </div>
        </div>

        {/* Stats strip */}
        <div className="px-4 sm:px-6 py-2 flex flex-wrap items-center gap-x-5 gap-y-2 text-[10px] border-b border-white/5 bg-[rgba(2,8,14,0.4)]" data-testid="vault-stats">
          <button type="button" onClick={() => setFilterContext(filterContext === "prompt" ? "all" : "prompt")} className="flex items-center gap-2 cursor-pointer group" title="Memories Jarvis gets in full at the start of every conversation">
            <span className="text-[#7E859E] group-hover:text-[var(--jarvis-accent)]">IN CONTEXT</span>
            <span className="w-24 h-1.5 bg-[rgba(var(--jarvis-accent-rgb),0.12)] chamfer-xs overflow-hidden">
              <span className="block h-full bg-[var(--jarvis-accent)] shadow-[0_0_6px_var(--jarvis-accent)]" style={{ width: `${Math.min(100, ((stats?.in_prompt || 0) / limit) * 100)}%` }} />
            </span>
            <span className="text-[var(--jarvis-accent)] font-bold">{stats?.in_prompt ?? 0}/{limit}</span>
          </button>
          <button type="button" onClick={() => setFilterContext(filterContext === "pinned" ? "all" : "pinned")} className="flex items-center gap-1 cursor-pointer text-[#7E859E] hover:text-[var(--jarvis-accent)]">
            <Pin className="w-3 h-3" /> PINNED <strong className={stats?.pinned > limit ? "text-[#FFB020]" : "text-[var(--jarvis-accent)]"}>{stats?.pinned ?? 0}</strong>
          </button>
          {stats?.muted ? (
            <button type="button" onClick={() => setFilterContext(filterContext === "muted" ? "all" : "muted")} className="text-[#FFB020] cursor-pointer" title="Held back while humour is off">
              MUTED <strong>{stats.muted}</strong>
            </button>
          ) : null}
          <span className="flex items-center gap-1 flex-wrap">
            {["all", ...CATEGORIES].map((c) => (
              <button
                type="button"
                key={c}
                onClick={() => setFilterCategory(c)}
                className={`px-2 py-0.5 chamfer-xs uppercase transition-all cursor-pointer border ${
                  filterCategory === c
                    ? "bg-[rgba(var(--jarvis-accent-rgb),0.2)] text-[var(--jarvis-accent)] border-[var(--jarvis-accent)] font-semibold"
                    : "text-[#7E859E] hover:text-white border-transparent hover:border-white/10"
                }`}>
                {c} {c === "all" ? memories.length : stats?.by_category?.[c] ?? 0}
              </button>
            ))}
          </span>
          {stats?.pinned > limit && <span className="text-[#FFB020] w-full sm:w-auto">More pinned than context slots: the oldest, least important pins are on recall.</span>}
        </div>

        {/* Toolbar */}
        <div className="px-4 sm:px-6 py-2.5 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-[#7E859E]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={searchMode === "meaning" ? 'Describe it: "what I drink"...' : "Search memories..."}
              aria-label="Search memories"
              className={`${inputClass} w-full pl-8 pr-[124px] py-1.5 chamfer-btn`}
            />
            <div className="absolute right-1 top-1 flex text-[9px] border border-[rgba(var(--jarvis-accent-rgb),0.25)] chamfer-xs overflow-hidden">
              {["words", "meaning"].map((mode) => (
                <button
                  type="button"
                  key={mode}
                  onClick={() => setSearchMode(mode)}
                  disabled={mode === "meaning" && !apiKey()}
                  title={mode === "meaning" && !apiKey() ? "Needs a Gemini API key" : mode === "meaning" ? "Rank by meaning" : "Match words"}
                  className={`px-1.5 py-0.5 uppercase cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${searchMode === mode ? "bg-[var(--jarvis-accent)] text-[#010e16] font-bold" : "text-[#7E859E] hover:text-white"}`}>
                  {mode === "meaning" ? <span className="flex items-center gap-0.5"><Sparkles className="w-2.5 h-2.5" />MEANING</span> : "WORDS"}
                </button>
              ))}
            </div>
          </div>
          <select aria-label="Importance" value={filterImportance} onChange={(e) => setFilterImportance(e.target.value)} className={selectClass}>
            <option value="all">ANY IMPORTANCE</option>
            {[...IMPORTANCE].reverse().map((i) => <option key={i} value={i}>{i}</option>)}
          </select>
          <select aria-label="Source" value={filterSource} onChange={(e) => setFilterSource(e.target.value)} className={selectClass}>
            <option value="all">ANY SOURCE</option>
            <option value="jarvis">JARVIS (CONVERSATION)</option>
            <option value="you">YOU (VAULT)</option>
            <option value="system">SYSTEM</option>
            <option value="import">IMPORTED</option>
          </select>
          <select aria-label="Context" value={filterContext} onChange={(e) => setFilterContext(e.target.value)} className={selectClass}>
            <option value="all">ANY CONTEXT</option>
            <option value="prompt">IN CONTEXT</option>
            <option value="recall">ON RECALL</option>
            <option value="pinned">PINNED</option>
            <option value="muted">MUTED</option>
          </select>
          <label className="flex items-center gap-1 text-[#7E859E]">
            <ArrowUpDown className="w-3 h-3" />
            <select aria-label="Sort" value={sortBy} onChange={(e) => setSortBy(e.target.value)} className={selectClass}>
              {semantic.results && <option value="relevance">BEST MATCH</option>}
              <option value="newest">NEWEST</option>
              <option value="oldest">OLDEST</option>
              <option value="importance">IMPORTANCE</option>
              <option value="edited">RECENTLY EDITED</option>
              <option value="context">CONTEXT ORDER</option>
            </select>
          </label>
          <button type="button" className={paneMode === "duplicates" ? solidButton : ghostButton} onClick={loadDuplicates} disabled={busy}>
            <Layers className="w-3 h-3" /> DUPLICATES
          </button>
          <button type="button" className={solidButton} onClick={() => setPaneMode("new")}>
            <Plus className="w-3.5 h-3.5" /> NEW
          </button>
        </div>

        {/* Body: list + detail */}
        <div className="flex-1 min-h-0 px-4 sm:px-6 pb-3 grid grid-cols-1 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] gap-4 overflow-y-auto md:overflow-hidden">
          <div className="flex flex-col gap-2 md:min-h-0">
            {checkedIds.size > 0 && (
              <BulkBar
                count={checkedIds.size}
                busy={busy}
                onPin={(pinned) => handleBulk({ pinned })}
                onCategory={(category) => handleBulk({ category })}
                onImportance={(importance) => handleBulk({ importance })}
                onDelete={() => handleDelete([...checkedIds])}
                onSelectAll={() => setCheckedIds(new Set(visible.map((m) => m.id)))}
                onClear={() => setCheckedIds(new Set())}
              />
            )}
            <div className="flex items-center justify-between text-[9px] text-[#7E859E]">
              <span>
                SHOWING <strong className="text-[var(--jarvis-accent)]" data-testid="vault-showing">{visible.length}</strong> OF {memories.length}
                {semantic.loading ? " · RANKING BY MEANING..." : ""}
                {semantic.error ? ` · ${semantic.error.toUpperCase()}` : ""}
              </span>
              {filtersActive ? (
                <button
                  type="button"
                  className="cursor-pointer hover:text-[var(--jarvis-accent)]"
                  onClick={() => {
                    setSearchQuery("");
                    setFilterCategory("all");
                    setFilterImportance("all");
                    setFilterSource("all");
                    setFilterContext("all");
                  }}>
                  CLEAR FILTERS
                </button>
              ) : null}
            </div>
            <div className="flex flex-col gap-2 overflow-y-auto min-h-[200px] max-h-[48vh] md:max-h-none md:min-h-0 pr-1 pb-1" data-testid="vault-list">
              {visible.map((m) => (
                <MemoryRow
                  key={m.id}
                  memory={m}
                  active={paneMode === "detail" && m.id === selectedId}
                  checked={checkedIds.has(m.id)}
                  onOpen={(mem) => {
                    setPaneMode("detail");
                    setSelectedId(mem.id);
                  }}
                  onToggleCheck={toggleCheck}
                />
              ))}
              {visible.length === 0 && (
                <div className="text-center py-10 flex flex-col items-center gap-2 text-[#7E859E]">
                  <Database className="w-6 h-6 opacity-40 text-[var(--jarvis-accent)]" />
                  <span className="text-xs italic">{memories.length ? "No memories match these filters." : "The vault is empty."}</span>
                  {!memories.length && (
                    <button type="button" onClick={() => setPaneMode("new")} className="text-[11px] text-[var(--jarvis-accent)] underline hover:text-white cursor-pointer">
                      Write the first memory
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="min-h-[320px] md:min-h-0 p-3.5 chamfer-md border border-[rgba(var(--jarvis-accent-rgb),0.25)] bg-[rgba(3,14,22,0.75)] flex flex-col overflow-y-auto">
            {paneMode === "duplicates" ? (
              <DuplicateReview
                state={{ ...duplicates, groups: duplicateGroups }}
                busy={busy}
                onMerge={handleMerge}
                onDismiss={(group) => setDismissedGroups((prev) => new Set(prev).add(groupKey(group)))}
                onClose={() => setPaneMode("detail")}
              />
            ) : paneMode === "new" ? (
              <MemoryEditor key="new" memory={null} limit={limit} busy={busy} onCreate={handleCreate} onCancelNew={() => setPaneMode("detail")} />
            ) : selected ? (
              <MemoryEditor key={selected.id} memory={selected} limit={limit} busy={busy} onUpdate={handleUpdate} onDelete={(id) => handleDelete([id])} />
            ) : (
              <div className="m-auto text-center text-[11px] text-[#7E859E] flex flex-col items-center gap-2">
                <Brain className="w-6 h-6 opacity-40 text-[var(--jarvis-accent)]" />
                Select a memory to edit it, or write a new one.
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-6 py-2.5 border-t border-[rgba(var(--jarvis-accent-rgb),0.18)] flex items-center justify-between gap-3 text-[10px] text-[#7E859E] bg-[rgba(2,8,14,0.6)]">
          <span className="flex items-center gap-2 min-w-0">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${contextChanged ? "bg-[#FFB020]" : "bg-[var(--jarvis-accent)]"} animate-pulse`} />
            <span className="truncate">
              {contextChanged
                ? connected
                  ? "Changes saved. Jarvis's context updates when he re-links."
                  : "Changes saved. Jarvis picks them up when he next connects."
                : "Pinned memories, then the most important and newest, fill Jarvis's context. The rest he recalls on demand."}
            </span>
          </span>
          <span className="flex items-center gap-2 shrink-0">
            {contextChanged && connected && (
              <button type="button" className={solidButton} onClick={relink} data-testid="vault-relink">
                <RefreshCw className="w-3 h-3" /> RE-LINK NOW
              </button>
            )}
            <button type="button" onClick={triggerClose} className={ghostButton}>
              CLOSE VAULT
            </button>
          </span>
        </div>

        {/* Toast */}
        {toast && (
          <div
            role="status"
            data-testid="vault-toast"
            className={`absolute bottom-14 left-1/2 -translate-x-1/2 flex items-center gap-3 px-3.5 py-2 chamfer-sm border text-[11px] shadow-[0_8px_30px_rgba(0,0,0,0.5)] bg-[rgba(3,14,22,0.97)] ${
              toast.tone === "error" ? "border-[rgba(255,0,60,0.5)] text-[#FF8095]" : "border-[rgba(var(--jarvis-accent-rgb),0.5)] text-[#F0F2F8]"
            }`}>
            <span>{toast.message}</span>
            {toast.undoId && (
              <button
                type="button"
                className="flex items-center gap-1 font-bold text-[var(--jarvis-accent)] hover:text-white cursor-pointer"
                onClick={() => {
                  const id = toast.undoId;
                  setToast(null);
                  handleUndo(id);
                }}>
                <Undo2 className="w-3 h-3" /> UNDO
              </button>
            )}
            <button type="button" className="text-[#7E859E] hover:text-white cursor-pointer" onClick={() => setToast(null)} aria-label="Dismiss">
              <X className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default SciFiMemoryVaultModal;
