"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpDown, Download, History, MessagesSquare, Search, Settings2, Sparkles, Upload, X } from "lucide-react";
import { useJarvisStore } from "@/lib/store";
import { SessionBulkBar, SessionRow } from "@/components/HUD/SessionVault/SessionList";
import { SessionDetail } from "@/components/HUD/SessionVault/SessionDetail";
import { bytesLabel } from "@/components/HUD/SessionVault/sessionUi";
import { VaultToast, useVaultToast } from "@/components/HUD/MemoryVault/VaultToast";
import { ghostButton, inputClass } from "@/components/HUD/MemoryVault/vaultUi";

const DAY_MS = 86400000;
const PERIODS = { today: 1, week: 7, month: 31 };
const SORTERS = {
  relevance: () => 0,
  newest: (a, b) => new Date(b.started_at) - new Date(a.started_at),
  oldest: (a, b) => new Date(a.started_at) - new Date(b.started_at),
  longest: (a, b) => b.turn_count - a.turn_count || SORTERS.newest(a, b),
  title: (a, b) => a.title.localeCompare(b.title),
};

/**
 * Session archive (Phase 11.2): past conversations with their recaps and transcripts.
 */
export function SciFiSessionVaultModal() {
  const isOpen = useJarvisStore((s) => s.isSessionVaultOpen);
  const setIsOpen = useJarvisStore((s) => s.setIsSessionVaultOpen);
  const sessions = useJarvisStore((s) => s.sessions);
  const stats = useJarvisStore((s) => s.sessionStats);
  const settings = useJarvisStore((s) => s.sessionSettings);
  const nextGreetingId = useJarvisStore((s) => s.nextGreetingId);
  const currentSessionId = useJarvisStore((s) => s.currentSessionId);
  const userApiKey = useJarvisStore((s) => s.userApiKey);
  const { loadSessions, sessionAction, addCommsMessage } = useJarvisStore.getState();

  const [isClosing, setIsClosing] = useState(false);
  const closeTimeoutRef = useRef(null);
  const fileInputRef = useRef(null);
  const { toast, showToast, clearToast } = useVaultToast();

  const [query, setQuery] = useState("");
  const [searchMode, setSearchMode] = useState("words");
  const [search, setSearch] = useState({ results: null, loading: false, mode: null });
  const [period, setPeriod] = useState("all");
  const [language, setLanguage] = useState("all");
  const [recap, setRecap] = useState("all");
  const [greeting, setGreeting] = useState("all");
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [sortBy, setSortBy] = useState("newest");

  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [checkedIds, setCheckedIds] = useState(() => new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setIsClosing(false);
    setCheckedIds(new Set());
    loadSessions();
  }, [isOpen, loadSessions, currentSessionId]);

  const triggerClose = useCallback(() => {
    if (isClosing) return;
    setIsClosing(true);
    closeTimeoutRef.current = setTimeout(() => {
      setIsOpen(false);
      setIsClosing(false);
      clearToast();
    }, 220);
  }, [isClosing, setIsOpen, clearToast]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape" && isOpen) triggerClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, triggerClose]);
  useEffect(() => () => clearTimeout(closeTimeoutRef.current), []);

  // Server-side search: words reach into transcripts, meaning ranks recaps
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setSearch({ results: null, loading: false, mode: null });
      return undefined;
    }
    setSearch((s) => ({ ...s, loading: true }));
    const timer = setTimeout(async () => {
      try {
        const key = useJarvisStore.getState().userApiKey;
        const res = await fetch(`/api/sessions?query=${encodeURIComponent(q)}&mode=${searchMode}${currentSessionId ? `&current=${currentSessionId}` : ""}`, { headers: key ? { "x-gemini-api-key": key } : {} });
        const data = await res.json();
        setSearch({ results: data.sessions || [], loading: false, mode: data.search_mode });
        if (data.search_mode === "meaning") setSortBy("relevance");
      } catch {
        setSearch({ results: [], loading: false, mode: null });
      }
    }, searchMode === "meaning" ? 450 : 250);
    return () => clearTimeout(timer);
  }, [query, searchMode, currentSessionId, sessions]);

  useEffect(() => {
    if (sortBy === "relevance" && search.mode !== "meaning") setSortBy("newest");
  }, [search.mode, sortBy]);

  const languages = useMemo(() => [...new Set(sessions.map((s) => s.language).filter(Boolean))].sort(), [sessions]);

  const visible = useMemo(() => {
    const now = Date.now();
    const list = (search.results || sessions).filter(
      (s) =>
        (period === "all" || now - new Date(s.started_at).getTime() <= PERIODS[period] * DAY_MS) &&
        (language === "all" || s.language === language) &&
        (recap === "all" || (recap === "with" ? Boolean(s.summary) : !s.summary)) &&
        (greeting === "all" || (greeting === "next" ? s.id === nextGreetingId : s.greeting === greeting)) &&
        (!pinnedOnly || s.pinned)
    );
    return sortBy === "relevance" ? list : [...list].sort(SORTERS[sortBy] || SORTERS.newest);
  }, [sessions, search.results, period, language, recap, greeting, pinnedOnly, sortBy, nextGreetingId]);

  useEffect(() => {
    if (!selectedId || !sessions.some((s) => s.id === selectedId)) setSelectedId(visible[0]?.id || null);
  }, [visible, sessions, selectedId]);

  useEffect(() => {
    setCheckedIds((prev) => {
      const live = new Set(sessions.map((s) => s.id));
      const next = new Set([...prev].filter((id) => live.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [sessions]);

  const selected = sessions.find((s) => s.id === selectedId) || null;

  // Full record (transcript) for the selected session, refreshed when it changes
  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return undefined;
    }
    let cancelled = false;
    fetch(`/api/sessions?id=${encodeURIComponent(selectedId)}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setDetail(data.session || null);
      })
      .catch(() => !cancelled && setDetail(null));
    return () => {
      cancelled = true;
    };
  }, [selectedId, selected?.updated_at, selected?.turn_count, selected?.summary, selected?.title]);

  const run = async (work) => {
    setBusy(true);
    try {
      return await work();
    } finally {
      setBusy(false);
    }
  };

  const handleUpdate = (fields) =>
    run(async () => {
      const result = await sessionAction("update", { id: selectedId, ...fields });
      if (!result.success) return showToast(result.message, { tone: "error" });
      const message =
        fields.title !== undefined
          ? "Title saved."
          : fields.summary !== undefined
            ? "Recap saved."
            : fields.greeting === "queued"
              ? "Jarvis will mention this in his next greeting."
              : fields.greeting === "skip"
                ? "Jarvis will not bring this up."
                : fields.pinned !== undefined
                  ? fields.pinned
                    ? "Pinned: retention will never remove it."
                    : "Unpinned."
                  : "Saved.";
      showToast(message);
    });

  const handleRegenerate = () =>
    run(async () => {
      const result = await sessionAction("regenerate", { id: selectedId });
      showToast(result.success ? "Title and recap rewritten." : result.message, result.success ? {} : { tone: "error" });
    });

  const handleDelete = (ids) =>
    run(async () => {
      const index = visible.findIndex((s) => ids.includes(s.id));
      const result = await sessionAction("delete", { ids });
      if (!result.success) return showToast(result.message, { tone: "error" });
      setCheckedIds(new Set());
      const next = visible.filter((s) => !ids.includes(s.id))[Math.max(0, index)];
      setSelectedId(next?.id || null);
      showToast(`Deleted ${ids.length} conversation${ids.length === 1 ? "" : "s"}.`, { undoId: result.undo_id });
    });

  const handleUndo = (undoId) =>
    run(async () => {
      const result = await sessionAction("restore", { undo_id: undoId });
      showToast(result.success ? "Undone." : result.message, result.success ? {} : { tone: "error" });
    });

  const handleBulkPin = (pinned) =>
    run(async () => {
      const result = await sessionAction("bulk_update", { ids: [...checkedIds], pinned });
      showToast(result.success ? `${pinned ? "Pinned" : "Unpinned"} ${result.updated} conversation${result.updated === 1 ? "" : "s"}.` : result.message, result.success ? {} : { tone: "error" });
    });

  const handleToMemory = () =>
    run(async () => {
      const result = await sessionAction("to_memory", { id: selectedId });
      if (!result.success) return showToast(result.message, { tone: "error" });
      useJarvisStore.getState().loadMemories();
      showToast("Recap saved to the memory vault.");
    });

  const handleContinue = () => {
    const continueSession = useJarvisStore.getState().continueSession;
    if (!continueSession || !selected) return showToast("The voice link is not ready yet.", { tone: "error" });
    addCommsMessage("system", `[SESSION] Reopening "${selected.title}"...`);
    triggerClose();
    continueSession(selected.id);
  };

  const handleImport = async (file) => {
    if (!file) return;
    let parsed;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      return showToast("That file is not valid JSON.", { tone: "error" });
    }
    await run(async () => {
      const result = await sessionAction("import", { sessions: Array.isArray(parsed) ? parsed : parsed.sessions });
      if (!result.success) return showToast(result.message, { tone: "error" });
      showToast(
        `Imported ${result.added} conversation${result.added === 1 ? "" : "s"}${result.skipped ? `, skipped ${result.skipped} already archived` : ""}${result.invalid ? `, ${result.invalid} unreadable` : ""}.`,
        result.undo_id ? { undoId: result.undo_id } : {}
      );
    });
  };

  const toggleCheck = (id) =>
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (!isOpen && !isClosing) return null;

  const selectClass = `${inputClass} py-1 px-1.5 text-[10px] uppercase cursor-pointer`;
  const filtersActive = query.trim() || period !== "all" || language !== "all" || recap !== "all" || greeting !== "all" || pinnedOnly;

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
        aria-label="Session archive"
        data-testid="session-vault"
        className={`relative w-full max-w-6xl h-[90vh] bg-[rgba(8,12,18,0.62)] backdrop-blur-xl backdrop-saturate-150 border border-[rgba(var(--jarvis-accent-rgb),0.25)] shadow-[0_0_40px_rgba(var(--jarvis-accent-rgb),0.12),inset_0_1px_0_rgba(255,255,255,0.06)] chamfer-xl overflow-hidden flex flex-col text-[#F0F2F8] font-mono ${
          isClosing ? "scifi-modal-collapse-up" : "scifi-modal-unfold-down"
        }`}>
        <div className="mx-6 mt-1 h-0.5 w-[calc(100%-48px)] bg-gradient-to-r from-[var(--jarvis-accent)] via-[var(--jarvis-accent-soft)] to-[var(--jarvis-accent)] animate-pulse" />

        {/* Header */}
        <div className="px-4 sm:px-6 pt-3 pb-3 flex items-center justify-between gap-3 border-b border-[rgba(var(--jarvis-accent-rgb),0.18)]">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 chamfer-xs bg-[rgba(var(--jarvis-accent-rgb),0.1)] border border-[rgba(var(--jarvis-accent-rgb),0.35)] shadow-[0_0_12px_rgba(var(--jarvis-accent-rgb),0.25)]">
              <History className="w-4 h-4 text-[var(--jarvis-accent)]" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-bold tracking-wider text-white flex items-center gap-2 font-['Orbitron',sans-serif]">
                SESSION ARCHIVE
                <span className="text-[10px] font-mono px-1.5 chamfer-xs bg-[rgba(var(--jarvis-accent-rgb),0.15)] border border-[rgba(var(--jarvis-accent-rgb),0.4)] text-[var(--jarvis-accent)] font-bold" data-testid="sessions-count">
                  {sessions.length} CONVERSATIONS
                </span>
              </span>
              <span className="text-[10px] text-[#7E859E] truncate">Past conversations, their recaps, and what Jarvis brings up next time</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <a href="/api/sessions?export=json" download className={ghostButton} title="Download every conversation as JSON">
              <Download className="w-3 h-3" /> <span className="hidden sm:inline">EXPORT</span>
            </a>
            <button type="button" className={ghostButton} onClick={() => fileInputRef.current?.click()} disabled={busy} title="Add conversations from an exported archive">
              <Upload className="w-3 h-3" /> <span className="hidden sm:inline">IMPORT</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              data-testid="sessions-import-input"
              onChange={(e) => {
                handleImport(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <button type="button" onClick={triggerClose} className="px-2.5 py-1 chamfer-xs text-xs text-[#7E859E] hover:text-[var(--jarvis-accent)] hover:bg-[rgba(var(--jarvis-accent-rgb),0.1)] border border-transparent hover:border-[rgba(var(--jarvis-accent-rgb),0.3)] transition-all cursor-pointer flex items-center gap-1.5" title="Close (Escape)">
              <X className="w-4 h-4" />
              <span className="text-[10px] hidden sm:inline">ESC</span>
            </button>
          </div>
        </div>

        {/* Stats strip */}
        <div className="px-4 sm:px-6 py-2 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[10px] border-b border-white/5 bg-[rgba(2,8,14,0.4)] text-[#7E859E]" data-testid="sessions-stats">
          <span>TURNS <strong className="text-[var(--jarvis-accent)]">{stats?.turns ?? 0}</strong></span>
          <span>RECAPPED <strong className="text-[var(--jarvis-accent)]">{stats?.with_recap ?? 0}</strong></span>
          <span>PINNED <strong className="text-[var(--jarvis-accent)]">{stats?.pinned ?? 0}</strong></span>
          {stats?.oldest && <span>SINCE <strong className="text-[var(--jarvis-accent)]">{new Date(stats.oldest).toLocaleDateString()}</strong></span>}
          <span>STORAGE <strong className="text-[var(--jarvis-accent)]">{bytesLabel(stats?.bytes)}</strong></span>
          {settings && (
            <button
              type="button"
              className="ml-auto flex items-center gap-1 hover:text-[var(--jarvis-accent)] cursor-pointer"
              title="Change in Settings"
              onClick={() => {
                triggerClose();
                useJarvisStore.getState().setIsSettingsModalOpen(true);
              }}>
              <Settings2 className="w-3 h-3" />
              {settings.retention_days ? `KEEPS ${settings.retention_days} DAYS` : `KEEPS ${settings.max_sessions} CONVERSATIONS`} · TRANSCRIPTS {settings.keep_transcripts ? "ON" : "OFF (RECAPS ONLY)"}
            </button>
          )}
        </div>

        {/* Toolbar */}
        <div className="px-4 sm:px-6 py-2.5 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-[#7E859E]" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchMode === "meaning" ? 'Describe it: "the trip planning"...' : "Search titles, recaps, transcripts..."}
              aria-label="Search conversations"
              className={`${inputClass} w-full pl-8 pr-[124px] py-1.5 chamfer-btn`}
            />
            <div className="absolute right-1 top-1 flex text-[9px] border border-[rgba(var(--jarvis-accent-rgb),0.25)] chamfer-xs overflow-hidden">
              {["words", "meaning"].map((mode) => (
                <button
                  type="button"
                  key={mode}
                  onClick={() => setSearchMode(mode)}
                  disabled={mode === "meaning" && !userApiKey}
                  title={mode === "meaning" && !userApiKey ? "Needs a Gemini API key" : mode === "meaning" ? "Rank recaps by meaning" : "Match words in titles, recaps, and transcripts"}
                  className={`px-1.5 py-0.5 uppercase cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${searchMode === mode ? "bg-[var(--jarvis-accent)] text-[#010e16] font-bold" : "text-[#7E859E] hover:text-white"}`}>
                  {mode === "meaning" ? <span className="flex items-center gap-0.5"><Sparkles className="w-2.5 h-2.5" />MEANING</span> : "WORDS"}
                </button>
              ))}
            </div>
          </div>
          <select aria-label="Period" value={period} onChange={(e) => setPeriod(e.target.value)} className={selectClass}>
            <option value="all">ANY TIME</option>
            <option value="today">TODAY</option>
            <option value="week">PAST WEEK</option>
            <option value="month">PAST MONTH</option>
          </select>
          <select aria-label="Language" value={language} onChange={(e) => setLanguage(e.target.value)} className={selectClass}>
            <option value="all">ANY LANGUAGE</option>
            {languages.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
          <select aria-label="Recap" value={recap} onChange={(e) => setRecap(e.target.value)} className={selectClass}>
            <option value="all">WITH OR WITHOUT RECAP</option>
            <option value="with">HAS A RECAP</option>
            <option value="without">NO RECAP</option>
          </select>
          <select aria-label="Greeting" value={greeting} onChange={(e) => setGreeting(e.target.value)} className={selectClass}>
            <option value="all">ANY GREETING STATE</option>
            <option value="next">NEXT GREETING</option>
            <option value="mentioned">MENTIONED</option>
            <option value="skip">DON&apos;T MENTION</option>
          </select>
          <button type="button" aria-pressed={pinnedOnly} className={pinnedOnly ? `${ghostButton} bg-[rgba(var(--jarvis-accent-rgb),0.25)]` : ghostButton} onClick={() => setPinnedOnly((p) => !p)}>
            PINNED
          </button>
          <label className="flex items-center gap-1 text-[#7E859E]">
            <ArrowUpDown className="w-3 h-3" />
            <select aria-label="Sort" value={sortBy} onChange={(e) => setSortBy(e.target.value)} className={selectClass}>
              {search.mode === "meaning" && <option value="relevance">BEST MATCH</option>}
              <option value="newest">NEWEST</option>
              <option value="oldest">OLDEST</option>
              <option value="longest">LONGEST</option>
              <option value="title">TITLE</option>
            </select>
          </label>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 px-4 sm:px-6 pb-3 grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] gap-4 overflow-y-auto md:overflow-hidden">
          <div className="flex flex-col gap-2 md:min-h-0">
            {checkedIds.size > 0 && (
              <SessionBulkBar
                ids={[...checkedIds]}
                busy={busy}
                onPin={handleBulkPin}
                onDelete={() => handleDelete([...checkedIds].filter((id) => id !== currentSessionId))}
                onSelectAll={() => setCheckedIds(new Set(visible.map((s) => s.id)))}
                onClear={() => setCheckedIds(new Set())}
              />
            )}
            <div className="flex items-center justify-between text-[9px] text-[#7E859E]">
              <span>
                SHOWING <strong className="text-[var(--jarvis-accent)]" data-testid="sessions-showing">{visible.length}</strong> OF {sessions.length}
                {search.loading ? " · SEARCHING..." : ""}
              </span>
              {filtersActive ? (
                <button
                  type="button"
                  className="cursor-pointer hover:text-[var(--jarvis-accent)]"
                  onClick={() => {
                    setQuery("");
                    setPeriod("all");
                    setLanguage("all");
                    setRecap("all");
                    setGreeting("all");
                    setPinnedOnly(false);
                  }}>
                  CLEAR FILTERS
                </button>
              ) : null}
            </div>
            <div className="flex flex-col gap-2 overflow-y-auto min-h-[200px] max-h-[48vh] md:max-h-none md:min-h-0 pr-1 pb-1" data-testid="sessions-list">
              {visible.map((s) => (
                <SessionRow key={s.id} session={{ ...s, live: s.id === currentSessionId }} active={s.id === selectedId} checked={checkedIds.has(s.id)} isNextGreeting={s.id === nextGreetingId} onOpen={(row) => setSelectedId(row.id)} onToggleCheck={toggleCheck} />
              ))}
              {visible.length === 0 && (
                <div className="text-center py-10 flex flex-col items-center gap-2 text-[#7E859E]">
                  <MessagesSquare className="w-6 h-6 opacity-40 text-[var(--jarvis-accent)]" />
                  <span className="text-xs italic">
                    {sessions.length ? "No conversations match these filters." : "No conversations yet. Talk to Jarvis and they will appear here."}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="min-h-[360px] md:min-h-0 p-3.5 chamfer-md border border-[rgba(var(--jarvis-accent-rgb),0.25)] bg-[rgba(3,14,22,0.75)] flex flex-col overflow-y-auto">
            {selected ? (
              <SessionDetail
                key={selected.id}
                session={selected}
                detail={detail?.id === selected.id ? detail : null}
                isNext={selected.id === nextGreetingId}
                live={selected.id === currentSessionId}
                hasKey={Boolean(userApiKey)}
                busy={busy}
                onUpdate={handleUpdate}
                onRegenerate={handleRegenerate}
                onContinue={handleContinue}
                onToMemory={handleToMemory}
                onDelete={() => handleDelete([selected.id])}
              />
            ) : (
              <div className="m-auto text-center text-[11px] text-[#7E859E] flex flex-col items-center gap-2">
                <History className="w-6 h-6 opacity-40 text-[var(--jarvis-accent)]" />
                Select a conversation to read it.
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-6 py-2.5 border-t border-[rgba(var(--jarvis-accent-rgb),0.18)] flex items-center justify-between gap-3 text-[10px] text-[#7E859E] bg-[rgba(2,8,14,0.6)]">
          <span className="flex items-center gap-2 min-w-0">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 animate-pulse ${currentSessionId ? "bg-[#2BFFA3]" : "bg-[var(--jarvis-accent)]"}`} />
            <span className="truncate">
              {currentSessionId ? "Recording the current conversation. " : ""}Secrets (passwords, keys, codes) are blanked out before anything is saved.
            </span>
          </span>
          <button type="button" onClick={triggerClose} className={ghostButton}>CLOSE</button>
        </div>

        <VaultToast toast={toast} onUndo={handleUndo} onDismiss={clearToast} />
      </div>
    </div>
  );
}

export default SciFiSessionVaultModal;
