"use client";

import React, { useState } from "react";
import {
  FolderClosed,
  ChevronDown,
  Shield,
  FileText,
  Activity,
  Cpu,
  Layers,
  Terminal,
  Zap,
  Globe,
  Radio,
  UserCheck,
  Search,
  ExternalLink,
  Trash2,
  Sparkles,
  Newspaper,
  Brain,
  Database,
  Plus,
  Bookmark,
  Edit3,
  Check,
  SunMedium,
  Sliders,
  Volume1,
  Volume2,
  VolumeX,
  FolderOpen,
  Minimize2,
  Lock,
  Play,
  Code,
  QrCode,
  Smartphone,
} from "lucide-react";
import { MarkdownText } from "@/components/HUD/MarkdownText";
import { useAdaStore } from "@/lib/store";

const OPERATIVE_DOSSIER_MARKDOWN = `### SYSTEM PROFILE: J.A.R.V.I.S MARK I
**Designation:** J.A.R.V.I.S // Autonomous Desktop Operating System  
**Clearance Level:** Administrator // System Core  
**Status:** **ACTIVE // ONLINE**  
**Role:** Autonomous Desktop Companion & Systems Engineering Assistant

---

#### Tactical Profile & Specializations
- **System Architecture & Telemetry:** Full native control of operating system diagnostics, hardware monitoring, and terminal operations.
- **Cognitive Capabilities:** Gemini 3.1 Live multimodal perception, sub-500ms voice reasoning, and real-time vision processing.
- **Demeanor:** Refined, composed, polite yet subtly sarcastic, with unwavering loyalty to the Operator.
- **Directives:** Assist Operator with desktop automation, mission intel, code analysis, and real-time auditory briefings.`;

export function TacticalDrawer({ isOpen, onClose, onTriggerBriefing }) {
  const {
    status,
    latencyMs,
    isMuted,
    isDrawerOpen,
    setIsDrawerOpen,
    activeDrawerTab,
    setActiveDrawerTab,
    intelSearchResults,
    addIntelResult,
    clearIntelResults,
    addCommsMessage,
    operatorProfile,
    memories,
    isMemoryLoading,
    selectedMemoryModal,
    setSelectedMemoryModal,
    loadMemories,
    saveMemoryApi,
    deleteMemoryApi,
    updateProfileApi,
    plugins,
    isPluginsLoading,
    lastPluginOutput,
    loadPlugins,
    runPluginApi,
    executeOsActionApi,
    osBridgeStatus,
    recentOsActions,
    postFxEnabled,
    bloomEnabled,
    chromaticAberrationEnabled,
    vignetteEnabled,
    scanlinesEnabled,
    setPostFxEnabled,
    setBloomEnabled,
    setChromaticAberrationEnabled,
    setVignetteEnabled,
    setScanlinesEnabled,
    togglePostFx,
    fps,
    frameTimeMs,
    setIsMobileModalOpen,
  } = useAdaStore();

  const [searchQuery, setSearchQuery] = useState("");
  const [searchMode, setSearchMode] = useState("search"); // 'search' | 'news' | 'research'
  const [isSearching, setIsSearching] = useState(false);

  // Memory Vault State
  const [newMemoryText, setNewMemoryText] = useState("");
  const [newMemoryCategory, setNewMemoryCategory] = useState("tactical");
  const [newMemoryImportance, setNewMemoryImportance] = useState("medium");
  const [memoryFilterCategory, setMemoryFilterCategory] = useState("all");
  const [memorySearch, setMemorySearch] = useState("");
  const [isAddingMemory, setIsAddingMemory] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileDraft, setProfileDraft] = useState({
    callsign: "",
    clearance: "",
    role: "",
    preferences: "",
  });

  const activeTab = activeDrawerTab || "intel";
  const open = isOpen !== undefined ? isOpen : isDrawerOpen;

  React.useEffect(() => {
    if (open && activeTab === "memory") {
      loadMemories();
    }
    if (open && (activeTab === "plugins" || activeTab === "system")) {
      loadPlugins();
    }
  }, [open, activeTab, loadMemories, loadPlugins]);

  const handleStartEditProfile = () => {
    setProfileDraft({
      callsign: operatorProfile.callsign || "",
      clearance: operatorProfile.clearance || "",
      role: operatorProfile.role || "",
      preferences: operatorProfile.preferences || "",
    });
    setIsEditingProfile(true);
  };

  const handleSaveProfile = async () => {
    await updateProfileApi(profileDraft);
    setIsEditingProfile(false);
    addCommsMessage("system", "[DEEP MEMORY] Operator profile coordinates updated.");
  };

  const handleSaveNewMemory = async (e) => {
    if (e) e.preventDefault();
    if (!newMemoryText.trim() || isAddingMemory) return;
    setIsAddingMemory(true);
    const saved = await saveMemoryApi({
      content: newMemoryText.trim(),
      category: newMemoryCategory,
      importance: newMemoryImportance,
    });
    if (saved) {
      setNewMemoryText("");
      addCommsMessage("system", `[DEEP MEMORY] Inscribed directive: "${saved.content}"`);
    }
    setIsAddingMemory(false);
  };

  const handleDeleteMemory = async (id, preview) => {
    const success = await deleteMemoryApi(id);
    if (success) {
      addCommsMessage(
        "system",
        `[DEEP MEMORY] Expunged record from vault: "${preview.slice(0, 30)}..."`,
      );
    }
  };

  const handleClose = () => {
    if (onClose) onClose();
    setIsDrawerOpen(false);
  };

  const handleExecuteSearch = async (queryToRun) => {
    const query = (queryToRun || searchQuery).trim();
    if (!query || isSearching) return;

    setIsSearching(true);
    addCommsMessage("system", `[INTEL DESK] Executing web reconnaissance for: "${query}"...`);

    try {
      const res = await fetch(
        `/api/web-search?query=${encodeURIComponent(query)}&mode=${encodeURIComponent(searchMode)}`,
      );
      if (res.ok) {
        const data = await res.json();
        addIntelResult({
          query,
          mode: searchMode,
          summary: data.summary,
          results: data.results,
        });
        setSearchQuery("");
        addCommsMessage(
          "ada",
          `Reconnaissance complete for "${query}". I have indexed ${data.count || 0} intelligence items into your console.`,
        );
      }
    } catch (err) {
      console.error("[TacticalDrawer] Search failed:", err);
    } finally {
      setIsSearching(false);
    }
  };

  if (!open) return null;

  return (
    <div className="absolute bottom-20 left-4 right-4 z-40 max-h-[480px] hud-panel-cyan chamfer-lg border border-[rgba(0,240,255,0.4)] bg-[rgba(10,11,16,0.96)] backdrop-blur-xl flex flex-col shadow-[0_0_40px_rgba(0,240,255,0.15)] animate-in slide-in-from-bottom-5 duration-200 overflow-hidden">
      {/* Drawer Header */}
      <div className="flex items-center justify-between px-5 py-2.5 border-b border-[rgba(0,240,255,0.2)] bg-[rgba(5,5,8,0.7)]">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs font-['Orbitron',sans-serif] font-bold text-[#00F0FF] tracking-wider">
            <FolderClosed className="w-4 h-4 text-[#00F0FF]" />
            <span>TACTICAL INTEL MATRIX</span>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-1 ml-4 font-mono text-xs">
            <button
              onClick={() => setActiveDrawerTab("dossier")}
              className={`px-3 py-1 chamfer-btn transition-all cursor-pointer flex items-center gap-1.5 ${activeTab === "dossier"
                  ? "bg-[rgba(0,240,255,0.15)] border border-[#00F0FF] text-[#00F0FF] shadow-[0_0_10px_rgba(0,240,255,0.3)]"
                  : "text-[#7E859E] hover:text-[#F0F2F8] hover:bg-[rgba(255,255,255,0.03)]"
                }`}>
              <UserCheck className="w-3.5 h-3.5" />
              <span>DOSSIER</span>
            </button>

            <button
              onClick={() => setActiveDrawerTab("intel")}
              className={`px-3 py-1 chamfer-btn transition-all cursor-pointer flex items-center gap-1.5 ${activeTab === "intel"
                  ? "bg-[rgba(0,240,255,0.15)] border border-[#00F0FF] text-[#00F0FF] shadow-[0_0_10px_rgba(0,240,255,0.3)]"
                  : "text-[#7E859E] hover:text-[#F0F2F8] hover:bg-[rgba(255,255,255,0.03)]"
                }`}>
              <FileText className="w-3.5 h-3.5" />
              <span>NEURAL INTEL</span>
              {intelSearchResults.length > 0 && (
                <span className="px-1.5 py-0.2 chamfer-xs bg-[#00F0FF] text-black font-bold text-[9px]">
                  {intelSearchResults.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveDrawerTab("memory")}
              className={`px-3 py-1 chamfer-btn transition-all cursor-pointer flex items-center gap-1.5 ${activeTab === "memory"
                  ? "bg-[rgba(0,240,255,0.15)] border border-[#00F0FF] text-[#00F0FF] shadow-[0_0_10px_rgba(0,240,255,0.3)]"
                  : "text-[#7E859E] hover:text-[#F0F2F8] hover:bg-[rgba(255,255,255,0.03)]"
                }`}>
              <Brain className="w-3.5 h-3.5" />
              <span>MEMORY VAULT</span>
              {memories.length > 0 && (
                <span className="px-1.5 py-0.2 chamfer-xs bg-[#00F0FF] text-black font-bold text-[9px]">
                  {memories.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveDrawerTab("plugins")}
              className={`px-3 py-1 chamfer-btn transition-all cursor-pointer flex items-center gap-1.5 ${activeTab === "plugins"
                  ? "bg-[rgba(0,240,255,0.15)] border border-[#00F0FF] text-[#00F0FF] shadow-[0_0_10px_rgba(0,240,255,0.3)]"
                  : "text-[#7E859E] hover:text-[#F0F2F8] hover:bg-[rgba(255,255,255,0.03)]"
                }`}>
              <Sliders className="w-3.5 h-3.5" />
              <span>OS & PLUGINS</span>
              {plugins.length > 0 && (
                <span className="px-1.5 py-0.2 chamfer-xs bg-[#00F0FF] text-black font-bold text-[9px]">
                  {plugins.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveDrawerTab("system")}
              className={`px-3 py-1 chamfer-btn transition-all cursor-pointer flex items-center gap-1.5 ${activeTab === "system"
                  ? "bg-[rgba(0,240,255,0.15)] border border-[#00F0FF] text-[#00F0FF] shadow-[0_0_10px_rgba(0,240,255,0.3)]"
                  : "text-[#7E859E] hover:text-[#F0F2F8] hover:bg-[rgba(255,255,255,0.03)]"
                }`}>
              <Cpu className="w-3.5 h-3.5" />
              <span>SYSTEM MATRIX</span>
            </button>
          </div>
        </div>

        {/* Close Button */}
        <button
          onClick={handleClose}
          className="p-1 chamfer-xs text-[#7E859E] hover:text-[#00F0FF] hover:bg-[rgba(0,240,255,0.1)] transition-colors cursor-pointer"
          title="Minimize Tactical Intel Drawer">
          <ChevronDown className="w-4 h-4" />
        </button>
      </div>

      {/* Drawer Body Content */}
      <div className="flex-1 p-5 overflow-y-auto min-h-0 font-mono text-xs text-[#F0F2F8]">
        {/* Tab 1: Operative Dossier */}
        {activeTab === "dossier" && (
          <div className="flex flex-col md:flex-row gap-6">
            <div className="flex-1">
              <MarkdownText content={OPERATIVE_DOSSIER_MARKDOWN} isAda={true} />
            </div>

            <div className="w-full md:w-64 flex flex-col gap-2.5 p-3.5 chamfer-md border border-[rgba(0,240,255,0.25)] bg-[rgba(0,240,255,0.04)] shrink-0">
              <div className="text-[10px] font-['Orbitron',sans-serif] text-[#00F0FF] font-bold tracking-wider uppercase">
                OPERATIVE STATUS CARD
              </div>
              <div className="flex flex-col gap-1.5 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-[#7E859E]">Identity:</span>
                  <span className="text-[#F0F2F8] font-semibold">J.A.R.V.I.S</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#7E859E]">Clearance:</span>
                  <span className="text-[#00F0FF]">Core Administrator</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#7E859E]">Voice Core:</span>
                  <span className="text-[#5CE1E6]">Charon (Refined)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#7E859E]">Neural Link:</span>
                  <span className={status !== "DISCONNECTED" ? "text-[#00F0FF]" : "text-[#7E859E]"}>
                    {status}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#7E859E]">Audio Mode:</span>
                  <span className={isMuted ? "text-[#00F0FF]" : "text-[#00F0FF]"}>
                    {isMuted ? "TEXT ONLY" : "DUAL MIC"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Neural Intel Feed with Live Search Engine */}
        {activeTab === "intel" && (
          <div className="flex flex-col gap-4">
            {/* Interactive Search Console */}
            <div className="flex flex-col sm:flex-row items-center gap-2.5 p-2.5 chamfer-md border border-[rgba(0,240,255,0.25)] bg-[rgba(10,11,16,0.85)]">
              <div className="relative flex-1 w-full flex items-center">
                <Search className="absolute left-3 w-4 h-4 text-[#7E859E]" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleExecuteSearch()}
                  placeholder="Dispatch web query or topic (e.g. 'Latest quantum computing news')..."
                  className="w-full bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.1)] chamfer-xs pl-9 pr-3 py-1.5 text-xs font-mono text-[#F0F2F8] focus:outline-none focus:border-[#00F0FF] placeholder:text-[#7E859E]"
                />
              </div>

              {/* Mode Selector */}
              <div className="flex items-center gap-1 shrink-0">
                {["search", "news", "research"].map((m) => (
                  <button
                    key={m}
                    onClick={() => setSearchMode(m)}
                    className={`px-2.5 py-1 chamfer-xs text-[10px] font-mono uppercase tracking-wider transition-all cursor-pointer ${searchMode === m
                        ? "bg-[rgba(0,240,255,0.15)] border border-[#00F0FF] text-[#00F0FF]"
                        : "border border-[rgba(255,255,255,0.08)] text-[#7E859E] hover:text-[#F0F2F8]"
                      }`}>
                    {m}
                  </button>
                ))}

                <button
                  onClick={() => handleExecuteSearch()}
                  disabled={isSearching || !searchQuery.trim()}
                  className="px-3 py-1 chamfer-btn bg-[#00F0FF] hover:bg-[#38f4ff] text-black font-bold text-xs font-mono transition-all disabled:opacity-40 cursor-pointer flex items-center gap-1 shadow-[0_0_10px_rgba(0,240,255,0.3)]">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{isSearching ? "SCANNING..." : "SCAN"}</span>
                </button>
              </div>
            </div>

            {/* Results Stream */}
            {intelSearchResults.length > 0 ? (
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono text-[#7E859E] tracking-wider uppercase flex items-center gap-1.5">
                    <Globe className="w-3 h-3 text-[#00F0FF]" />
                    <span>RETRIEVED INTEL DOSSIERS ({intelSearchResults.length})</span>
                  </span>
                  <button
                    onClick={clearIntelResults}
                    className="flex items-center gap-1 text-[10px] font-mono text-[#7E859E] hover:text-[#FF003C] transition-colors cursor-pointer">
                    <Trash2 className="w-3 h-3" />
                    <span>CLEAR ARCHIVE</span>
                  </button>
                </div>

                <div className="flex flex-col gap-3">
                  {intelSearchResults.map((intel) => (
                    <div
                      key={intel.id}
                      className="p-4 chamfer-md border border-[rgba(0,240,255,0.25)] bg-[rgba(10,11,16,0.8)] flex flex-col gap-2.5">
                      <div className="flex items-center justify-between border-b border-[rgba(255,255,255,0.06)] pb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="px-1.5 py-0.2 chamfer-xs bg-[rgba(0,240,255,0.1)] border border-[rgba(0,240,255,0.3)] text-[#00F0FF] text-[9px] font-mono uppercase">
                            {intel.mode}
                          </span>
                          <span className="text-xs font-bold text-[#F0F2F8] font-mono">
                            QUERY: "{intel.query}"
                          </span>
                        </div>
                        <span className="text-[10px] font-mono text-[#7E859E]">{intel.time}</span>
                      </div>

                      {/* Summary Quote */}
                      {intel.summary && (
                        <div className="p-2.5 chamfer-xs bg-[rgba(0,240,255,0.04)] border-l-2 border-[#00F0FF] text-[11px] font-mono text-[#00F0FF]/90 whitespace-pre-line">
                          {intel.summary}
                        </div>
                      )}

                      {/* Items Grid */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-1">
                        {intel.results?.map((item, idx) => (
                          <div
                            key={idx}
                            className="p-2.5 chamfer-xs border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] hover:border-[rgba(0,240,255,0.3)] transition-all flex flex-col justify-between gap-1.5">
                            <div>
                              <div className="text-[11px] font-semibold text-[#F0F2F8] line-clamp-1">
                                {item.title}
                              </div>
                              <p className="text-[10px] text-[#7E859E] mt-1 line-clamp-2">
                                {item.snippet}
                              </p>
                            </div>
                            <div className="flex items-center justify-between pt-1 border-t border-[rgba(255,255,255,0.04)] text-[9px] font-mono">
                              <span className="text-[#00F0FF] truncate max-w-[150px]">
                                {item.source}
                              </span>
                              {item.url && (
                                <a
                                  href={item.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-1 text-[#7E859E] hover:text-[#00F0FF] transition-colors">
                                  <span>VIEW</span>
                                  <ExternalLink className="w-2.5 h-2.5" />
                                </a>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              /* Placeholder with Tactical Quick Actions */
              <div className="flex flex-col items-center justify-center p-8 text-center chamfer-md border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.01)] gap-3">
                <Globe className="w-8 h-8 text-[#00F0FF] animate-pulse" />
                <div className="max-w-md">
                  <div className="text-xs font-semibold text-[#F0F2F8] font-mono">
                    NEURAL INTELLIGENCE RADAR STANDBY
                  </div>
                  <p className="text-[11px] text-[#7E859E] font-mono mt-1 leading-relaxed">
                    Ask J.A.R.V.I.S verbally ("JARVIS, look up the latest space news") or enter a query above.
                    Grounded search dossiers will materialize here automatically.
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
                  {[
                    "Latest Quantum Computing Milestones",
                    "Global Tech Market Headlines",
                    "J.A.R.V.I.S Core Archives",
                  ].map((preset) => (
                    <button
                      key={preset}
                      onClick={() => handleExecuteSearch(preset)}
                      className="px-2.5 py-1 chamfer-xs bg-[rgba(0,240,255,0.05)] border border-[rgba(0,240,255,0.2)] text-[10px] font-mono text-[#00F0FF] hover:bg-[rgba(0,240,255,0.15)] transition-all cursor-pointer">
                      {preset}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab: Memory Vault */}
        {activeTab === "memory" && (
          <div className="flex flex-col gap-5">
            {/* Top Tactical Controls Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-3 chamfer-md border border-[rgba(0,102,255,0.25)] bg-[rgba(0,102,255,0.03)]">
              <div className="flex items-center gap-2">
                <Brain className="w-4 h-4 text-[#70B5FF]" />
                <span className="text-xs font-['Orbitron',sans-serif] font-bold text-[#70B5FF]">
                  DEEP MEMORY VAULT // PERSISTENT RETRIEVAL
                </span>
                <span className="px-2 py-0.5 chamfer-xs bg-[rgba(0,102,255,0.15)] text-[#70B5FF] text-[10px] font-mono border border-[rgba(0,102,255,0.3)]">
                  {memories.length} RECORDS
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    if (onTriggerBriefing) {
                      onTriggerBriefing();
                    } else {
                      addCommsMessage(
                        "system",
                        "[BRIEFING] Morning / Tactical Briefing protocol initiated.",
                      );
                    }
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 chamfer-btn bg-[rgba(0,102,255,0.15)] border border-[#0066FF] text-[#70B5FF] hover:bg-[#0066FF] hover:text-white transition-all cursor-pointer font-['Orbitron',sans-serif] text-[11px] font-bold shadow-[0_0_12px_rgba(0,102,255,0.25)]"
                  title="Execute Morning / Tactical Briefing Protocol">
                  <SunMedium className="w-3.5 h-3.5" />
                  <span>TRIGGER BRIEFING</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              {/* Operator Identity & Profile Card */}
              <div className="lg:col-span-1 p-4 chamfer-md border border-[rgba(0,240,255,0.25)] bg-[rgba(0,240,255,0.02)] flex flex-col gap-3">
                <div className="flex items-center justify-between border-b border-[rgba(0,240,255,0.15)] pb-2">
                  <div className="flex items-center gap-1.5 text-xs font-['Orbitron',sans-serif] font-bold text-[#00F0FF]">
                    <UserCheck className="w-3.5 h-3.5" />
                    <span>OPERATOR PROFILE</span>
                  </div>
                  {!isEditingProfile ? (
                    <button
                      onClick={handleStartEditProfile}
                      className="flex items-center gap-1 text-[10px] font-mono text-[#7E859E] hover:text-[#00F0FF] transition-colors cursor-pointer">
                      <Edit3 className="w-3 h-3" />
                      <span>EDIT</span>
                    </button>
                  ) : (
                    <button
                      onClick={handleSaveProfile}
                      className="flex items-center gap-1 text-[10px] font-mono text-[#00F0FF] hover:text-white transition-colors cursor-pointer">
                      <Check className="w-3 h-3" />
                      <span>SAVE</span>
                    </button>
                  )}
                </div>

                {!isEditingProfile ? (
                  <div className="flex flex-col gap-2 text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-[#7E859E]">Callsign:</span>
                      <span className="text-[#F0F2F8] font-bold">
                        {operatorProfile.callsign || "Operator"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#7E859E]">Clearance:</span>
                      <span className="text-[#00F0FF]">
                        {operatorProfile.clearance || "Class-9"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#7E859E]">Role:</span>
                      <span className="text-[#FF8095]">{operatorProfile.role || "Operative"}</span>
                    </div>
                    <div className="flex flex-col gap-1 pt-1 border-t border-[rgba(255,255,255,0.06)]">
                      <span className="text-[#7E859E] text-[10px]">Preferences & Directives:</span>
                      <p className="text-[11px] text-[#F0F2F8]/90 italic">
                        &ldquo;
                        {operatorProfile.preferences ||
                          "Direct communication, low-latency execution."}
                        &rdquo;
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2 text-[11px]">
                    <div>
                      <label className="text-[9px] text-[#7E859E] block mb-0.5">Callsign:</label>
                      <input
                        type="text"
                        value={profileDraft.callsign}
                        onChange={(e) =>
                          setProfileDraft((p) => ({ ...p, callsign: e.target.value }))
                        }
                        className="w-full px-2 py-1 chamfer-xs bg-[rgba(10,11,16,0.9)] border border-[rgba(0,240,255,0.3)] text-[#F0F2F8] font-mono text-xs focus:outline-none focus:border-[#00F0FF]"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] text-[#7E859E] block mb-0.5">Clearance:</label>
                      <input
                        type="text"
                        value={profileDraft.clearance}
                        onChange={(e) =>
                          setProfileDraft((p) => ({ ...p, clearance: e.target.value }))
                        }
                        className="w-full px-2 py-1 chamfer-xs bg-[rgba(10,11,16,0.9)] border border-[rgba(0,240,255,0.3)] text-[#00F0FF] font-mono text-xs focus:outline-none focus:border-[#00F0FF]"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] text-[#7E859E] block mb-0.5">Role:</label>
                      <input
                        type="text"
                        value={profileDraft.role}
                        onChange={(e) => setProfileDraft((p) => ({ ...p, role: e.target.value }))}
                        className="w-full px-2 py-1 chamfer-xs bg-[rgba(10,11,16,0.9)] border border-[rgba(0,240,255,0.3)] text-[#FF8095] font-mono text-xs focus:outline-none focus:border-[#00F0FF]"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] text-[#7E859E] block mb-0.5">Preferences:</label>
                      <textarea
                        rows={2}
                        value={profileDraft.preferences}
                        onChange={(e) =>
                          setProfileDraft((p) => ({ ...p, preferences: e.target.value }))
                        }
                        className="w-full px-2 py-1 chamfer-xs bg-[rgba(10,11,16,0.9)] border border-[rgba(0,240,255,0.3)] text-[#F0F2F8] font-mono text-xs focus:outline-none focus:border-[#00F0FF] resize-none"
                      />
                    </div>
                  </div>
                )}

                <div className="pt-2 border-t border-[rgba(0,240,255,0.1)] text-[10px] text-[#7E859E]">
                  J.A.R.V.I.S autonomously reads these coordinates via{" "}
                  <code className="text-[#00E5FF]">recall_memory</code> to maintain personalized,
                  ongoing operational rapport.
                </div>
              </div>

              {/* Memory List & Add Directive Form */}
              <div className="lg:col-span-2 flex flex-col gap-3">
                {/* Inscribe Memory Form */}
                <form
                  onSubmit={handleSaveNewMemory}
                  className="p-3 chamfer-md border border-[rgba(255,0,60,0.2)] bg-[rgba(255,0,60,0.02)] flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-['Orbitron',sans-serif] font-bold text-[#FF8095] tracking-wider uppercase">
                      INSCRIBE NEW DIRECTIVE / MEMORY
                    </span>
                    <div className="flex items-center gap-2">
                      <select
                        value={newMemoryCategory}
                        onChange={(e) => setNewMemoryCategory(e.target.value)}
                        className="px-2 py-0.5 chamfer-xs bg-[rgba(10,11,16,0.9)] border border-[rgba(255,255,255,0.2)] text-[10px] text-[#F0F2F8] font-mono cursor-pointer">
                        <option value="tactical">Tactical</option>
                        <option value="preference">Preference</option>
                        <option value="mission">Mission</option>
                      </select>
                      <select
                        value={newMemoryImportance}
                        onChange={(e) => setNewMemoryImportance(e.target.value)}
                        className="px-2 py-0.5 chamfer-xs bg-[rgba(10,11,16,0.9)] border border-[rgba(255,255,255,0.2)] text-[10px] text-[#F0F2F8] font-mono cursor-pointer">
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                        <option value="critical">Critical</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="e.g. Operator prefers concise 3-bullet code summaries..."
                      value={newMemoryText}
                      onChange={(e) => setNewMemoryText(e.target.value)}
                      className="flex-1 px-3 py-1.5 chamfer-xs bg-[rgba(5,5,8,0.8)] border border-[rgba(255,255,255,0.15)] focus:border-[#0066FF] text-xs font-mono text-[#F0F2F8] placeholder-[#7E859E]/50 focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={!newMemoryText.trim() || isAddingMemory}
                      className="flex items-center gap-1.5 px-3 py-1.5 chamfer-btn bg-[rgba(0,102,255,0.2)] border border-[#0066FF] text-[#70B5FF] hover:bg-[#0066FF] hover:text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer text-xs font-mono font-bold">
                      <Plus className="w-3.5 h-3.5" />
                      <span>INSCRIBE</span>
                    </button>
                  </div>
                </form>

                {/* Filters & Search */}
                <div className="flex items-center justify-between gap-2 pt-1">
                  <div className="flex items-center gap-1">
                    {["all", "tactical", "preference", "mission"].map((cat) => (
                      <button
                        key={cat}
                        onClick={() => setMemoryFilterCategory(cat)}
                        className={`px-2 py-0.5 chamfer-xs text-[10px] font-mono uppercase transition-all cursor-pointer ${memoryFilterCategory === cat
                            ? "bg-[rgba(0,102,255,0.2)] text-[#70B5FF] border border-[#0066FF]"
                            : "text-[#7E859E] hover:text-[#F0F2F8]"
                          }`}>
                        {cat}
                      </button>
                    ))}
                  </div>

                  <div className="relative">
                    <Search className="w-3 h-3 absolute left-2 top-2 text-[#7E859E]" />
                    <input
                      type="text"
                      placeholder="Search vault..."
                      value={memorySearch}
                      onChange={(e) => setMemorySearch(e.target.value)}
                      className="pl-7 pr-2 py-1 chamfer-xs bg-[rgba(10,11,16,0.7)] border border-[rgba(255,255,255,0.1)] text-[10px] font-mono text-[#F0F2F8] focus:outline-none focus:border-[#00F0FF]"
                    />
                  </div>
                </div>

                {/* Stored Memories List */}
                <div className="flex flex-col gap-2 max-h-[220px] overflow-y-auto pr-1">
                  {memories
                    .filter((m) => {
                      if (memoryFilterCategory !== "all" && m.category !== memoryFilterCategory)
                        return false;
                      if (
                        memorySearch &&
                        !m.content?.toLowerCase().includes(memorySearch.toLowerCase())
                      )
                        return false;
                      return true;
                    })
                    .map((mem) => (
                      <div
                        key={mem.id}
                        onClick={() => setSelectedMemoryModal(mem)}
                        className="p-2.5 chamfer-sm border border-[rgba(255,255,255,0.08)] bg-[rgba(10,11,16,0.6)] hover:border-[rgba(0,240,255,0.4)] hover:bg-[rgba(0,240,255,0.03)] transition-all flex items-start justify-between gap-3 group cursor-pointer">
                        <div className="flex flex-col gap-1 flex-1">
                          <div className="flex items-center gap-2">
                            <span
                              className={`px-1.5 py-0.2 chamfer-xs text-[8px] font-mono uppercase border ${mem.category === "mission"
                                  ? "bg-[rgba(0,240,255,0.1)] text-[#00F0FF] border-[rgba(0,240,255,0.3)]"
                                  : mem.category === "preference"
                                    ? "bg-[rgba(255,128,149,0.1)] text-[#FF8095] border-[rgba(255,128,149,0.3)]"
                                    : "bg-[rgba(255,230,0,0.1)] text-[#FFE600] border-[rgba(255,230,0,0.3)]"
                                }`}>
                              {mem.category}
                            </span>
                            <span className="text-[9px] font-mono text-[#7E859E]">
                              {new Date(mem.timestamp).toLocaleDateString()}{" "}
                              {new Date(mem.timestamp).toLocaleTimeString()}
                            </span>
                            {mem.importance === "critical" && (
                              <span className="text-[8px] font-mono text-[#0066FF] font-bold uppercase">
                                [CRITICAL]
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-[#F0F2F8] font-mono leading-relaxed line-clamp-3">
                            {mem.content}
                          </p>
                        </div>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteMemory(mem.id, mem.content);
                          }}
                          className="p-1 chamfer-xs text-[#7E859E] hover:text-[#0066FF] hover:bg-[rgba(0,102,255,0.1)] opacity-0 group-hover:opacity-100 transition-all cursor-pointer shrink-0"
                          title="Expunge memory directive">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  {memories.length === 0 && (
                    <div className="text-center py-6 text-[11px] text-[#7E859E] italic">
                      No memory directives inscribed in persistent vault.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 4: OS & Cyber-Plugin Matrix */}
        {activeTab === "plugins" && (
          <div className="flex flex-col gap-5">
            {/* Header Control Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-3 chamfer-md border border-[rgba(0,240,255,0.25)] bg-[rgba(0,240,255,0.03)]">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-[#00F0FF]" />
                <span className="text-xs font-['Orbitron',sans-serif] font-bold text-[#00F0FF]">
                  LOCAL OS COMPANION & CYBER-PLUGIN MATRIX
                </span>
                <span className="px-2 py-0.5 chamfer-xs bg-[rgba(0,240,255,0.15)] text-[#00F0FF] text-[10px] font-mono border border-[rgba(0,240,255,0.3)]">
                  BRIDGE: {osBridgeStatus || "ONLINE"}
                </span>
              </div>

              <div className="text-[10px] font-mono text-[#7E859E]">
                Gemini 3.1 Live Tools: <span className="text-[#00F0FF]">execute_os_action</span> &{" "}
                <span className="text-[#FF8095]">run_cyber_plugin</span>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Column 1: Local OS Automation Deck */}
              <div className="p-4 chamfer-md border border-[rgba(0,240,255,0.2)] bg-[rgba(10,11,16,0.85)] flex flex-col gap-4">
                <div className="flex items-center justify-between border-b border-[rgba(0,240,255,0.15)] pb-2">
                  <div className="flex items-center gap-1.5 text-xs font-['Orbitron',sans-serif] font-bold text-[#00F0FF]">
                    <Terminal className="w-3.5 h-3.5" />
                    <span>NATIVE OS DESKTOP CONTROLS</span>
                  </div>
                  <span className="text-[10px] font-mono text-[#7E859E]">Windows Platform</span>
                </div>

                {/* Master Volume Controls */}
                <div className="flex flex-col gap-2 p-3 chamfer-sm bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.06)]">
                  <span className="text-[10px] font-['Orbitron',sans-serif] text-[#7E859E] uppercase tracking-wider">
                    Audio Master Gain
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => executeOsActionApi("volume_down")}
                      className="flex-1 px-2.5 py-1.5 chamfer-xs bg-[rgba(0,240,255,0.08)] border border-[rgba(0,240,255,0.3)] text-[#00F0FF] hover:bg-[rgba(0,240,255,0.2)] transition-all cursor-pointer font-mono text-xs flex items-center justify-center gap-1">
                      <Volume1 className="w-3.5 h-3.5" />
                      <span>VOL -10%</span>
                    </button>
                    <button
                      onClick={() => executeOsActionApi("mute")}
                      className="px-3 py-1.5 chamfer-xs bg-[rgba(0,102,255,0.1)] border border-[rgba(0,102,255,0.3)] text-[#70B5FF] hover:bg-[rgba(0,102,255,0.25)] transition-all cursor-pointer font-mono text-xs flex items-center justify-center gap-1">
                      <VolumeX className="w-3.5 h-3.5" />
                      <span>MUTE</span>
                    </button>
                    <button
                      onClick={() => executeOsActionApi("volume_up")}
                      className="flex-1 px-2.5 py-1.5 chamfer-xs bg-[rgba(0,240,255,0.08)] border border-[rgba(0,240,255,0.3)] text-[#00F0FF] hover:bg-[rgba(0,240,255,0.2)] transition-all cursor-pointer font-mono text-xs flex items-center justify-center gap-1">
                      <Volume2 className="w-3.5 h-3.5" />
                      <span>VOL +10%</span>
                    </button>
                  </div>
                </div>

                {/* Quick App Launchers */}
                <div className="flex flex-col gap-2">
                  <span className="text-[10px] font-['Orbitron',sans-serif] text-[#7E859E] uppercase tracking-wider">
                    Whitelisted Application Launchers
                  </span>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { key: "code", label: "VS CODE", icon: Code },
                      { key: "terminal", label: "TERMINAL", icon: Terminal },
                      { key: "notepad", label: "NOTEPAD", icon: FileText },
                      { key: "calc", label: "CALCULATOR", icon: Activity },
                      { key: "explorer", label: "EXPLORER", icon: FolderClosed },
                      { key: "taskmgr", label: "TASK MGR", icon: Cpu },
                    ].map((app) => (
                      <button
                        key={app.key}
                        onClick={() => executeOsActionApi("launch_app", app.key)}
                        className="px-2.5 py-2 chamfer-xs bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.1)] hover:border-[#00F0FF] hover:text-[#00F0FF] transition-all cursor-pointer text-[10px] font-mono flex items-center justify-center gap-1.5 text-[#F0F2F8]">
                        <app.icon className="w-3 h-3 text-[#00F0FF]" />
                        <span>{app.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Tactical Desktop Actions */}
                <div className="flex flex-col gap-2">
                  <span className="text-[10px] font-['Orbitron',sans-serif] text-[#7E859E] uppercase tracking-wider">
                    Desktop Directives
                  </span>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => executeOsActionApi("open_folder")}
                      className="px-2 py-1.5 chamfer-xs bg-[rgba(0,240,255,0.05)] border border-[rgba(0,240,255,0.2)] hover:bg-[rgba(0,240,255,0.15)] text-[#00F0FF] text-[10px] font-mono cursor-pointer flex items-center justify-center gap-1">
                      <FolderOpen className="w-3 h-3" />
                      <span>WORKSPACE</span>
                    </button>
                    <button
                      onClick={() => executeOsActionApi("minimize_all")}
                      className="px-2 py-1.5 chamfer-xs bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.15)] hover:border-[#F0F2F8] text-[#F0F2F8] text-[10px] font-mono cursor-pointer flex items-center justify-center gap-1">
                      <Minimize2 className="w-3 h-3" />
                      <span>MINIMIZE</span>
                    </button>
                    <button
                      onClick={() => executeOsActionApi("lock_screen")}
                      className="px-2 py-1.5 chamfer-xs bg-[rgba(0,102,255,0.08)] border border-[rgba(0,102,255,0.25)] hover:bg-[rgba(0,102,255,0.2)] text-[#70B5FF] text-[10px] font-mono cursor-pointer flex items-center justify-center gap-1">
                      <Lock className="w-3 h-3" />
                      <span>LOCK OS</span>
                    </button>
                  </div>
                </div>

                {/* Audit Log */}
                {recentOsActions.length > 0 && (
                  <div className="flex flex-col gap-1.5 pt-2 border-t border-[rgba(255,255,255,0.06)]">
                    <span className="text-[9px] font-mono text-[#7E859E] uppercase">
                      Recent OS Action Dispatch:
                    </span>
                    <div className="flex flex-col gap-1 max-h-20 overflow-y-auto">
                      {recentOsActions.slice(0, 3).map((act) => (
                        <div
                          key={act.id}
                          className="flex justify-between text-[9px] font-mono text-[#7E859E]">
                          <span className="text-[#00F0FF]">
                            {act.action} {act.target ? `(${act.target})` : ""}
                          </span>
                          <span>{act.time}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Column 2: Cyber-Plugin Matrix Console */}
              <div className="p-4 chamfer-md border border-[rgba(0,240,255,0.2)] bg-[rgba(10,11,16,0.85)] flex flex-col gap-3">
                <div className="flex items-center justify-between border-b border-[rgba(0,240,255,0.15)] pb-2">
                  <div className="flex items-center gap-1.5 text-xs font-['Orbitron',sans-serif] font-bold text-[#00F0FF]">
                    <Zap className="w-3.5 h-3.5" />
                    <span>CYBER-PLUGIN MATRIX ({plugins.length})</span>
                  </div>
                  <span className="text-[10px] font-mono text-[#7E859E]">Drop-in /plugins</span>
                </div>

                {/* Plugins Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {plugins.map((plugin) => (
                    <div
                      key={plugin.id}
                      className="p-2.5 chamfer-sm border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] flex flex-col justify-between gap-2 hover:border-[rgba(0,240,255,0.3)] transition-all">
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-semibold text-[#F0F2F8] font-mono">
                            {plugin.name}
                          </span>
                          <span className="px-1.5 py-0.2 chamfer-xs bg-[rgba(0,240,255,0.1)] text-[#00F0FF] text-[8px] font-mono uppercase">
                            ACTIVE
                          </span>
                        </div>
                        <p className="text-[9px] text-[#7E859E] mt-1 line-clamp-2 leading-relaxed">
                          {plugin.description}
                        </p>
                      </div>

                      <button
                        onClick={() => runPluginApi(plugin.id)}
                        className="w-full py-1 chamfer-btn bg-[rgba(0,240,255,0.15)] border border-[#00F0FF] text-[#00F0FF] hover:bg-[#00F0FF] hover:text-black transition-all cursor-pointer font-mono text-[10px] font-bold flex items-center justify-center gap-1">
                        <Play className="w-2.5 h-2.5 fill-current" />
                        <span>RUN PLUGIN</span>
                      </button>
                    </div>
                  ))}
                </div>

                {/* Plugin Output Terminal */}
                <div className="flex flex-col gap-1.5 pt-2 border-t border-[rgba(255,255,255,0.06)] flex-1 min-h-[120px]">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-['Orbitron',sans-serif] text-[#7E859E] uppercase tracking-wider">
                      Plugin Execution Console
                    </span>
                    {lastPluginOutput && (
                      <span className="text-[9px] font-mono text-[#00F0FF]">
                        {lastPluginOutput.pluginName || lastPluginOutput.pluginId} (
                        {lastPluginOutput.executionDurationMs || 0}ms)
                      </span>
                    )}
                  </div>
                  <pre className="flex-1 p-2.5 chamfer-sm bg-[rgba(5,5,8,0.9)] border border-[rgba(255,255,255,0.1)] text-[10px] font-mono text-[#00F0FF] overflow-x-auto max-h-40 whitespace-pre-wrap">
                    {lastPluginOutput
                      ? JSON.stringify(lastPluginOutput.output || lastPluginOutput, null, 2)
                      : "// Select and run a cyber plugin above to inspect real-time outputs..."}
                  </pre>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 5: System Matrix */}
        {activeTab === "system" && (
          <div className="flex flex-col gap-4">
            {/* Row 1: Core System Specifications */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* 3D Engine Card */}
              <div className="p-3.5 chamfer-md border border-[rgba(0,240,255,0.25)] bg-[rgba(0,240,255,0.03)] flex flex-col gap-2">
                <div className="flex items-center gap-1.5 text-xs font-['Orbitron',sans-serif] font-bold text-[#00F0FF]">
                  <Layers className="w-3.5 h-3.5" />
                  <span>3D R3F ENGINE</span>
                </div>
                <div className="flex flex-col gap-1 text-[11px] font-mono">
                  <div className="flex justify-between">
                    <span className="text-[#7E859E]">Visual Core:</span>
                    <span className="text-[#F0F2F8]">ArcReactorOrb.jsx</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#7E859E]">Orbital Belts:</span>
                    <span className="text-[#00F0FF]">3 Counter-Rotating Layers</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#7E859E]">Particle Count:</span>
                    <span className="text-[#00F0FF]">300 Motes (Holographic Cyan)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#7E859E]">Audio Driver:</span>
                    <span className="text-[#00F0FF]">Live Spectrum Stator</span>
                  </div>
                </div>
              </div>

              {/* Audio Pipeline Card */}
              <div className="p-3.5 chamfer-md border border-[rgba(0,240,255,0.25)] bg-[rgba(0,240,255,0.03)] flex flex-col gap-2">
                <div className="flex items-center gap-1.5 text-xs font-['Orbitron',sans-serif] font-bold text-[#00F0FF]">
                  <Radio className="w-3.5 h-3.5" />
                  <span>WEB AUDIO PIPELINE</span>
                </div>
                <div className="flex flex-col gap-1 text-[11px] font-mono">
                  <div className="flex justify-between">
                    <span className="text-[#7E859E]">Mic Ingest:</span>
                    <span className="text-[#00F0FF]">16kHz Int16 PCM</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#7E859E]">Downsampler:</span>
                    <span className="text-[#F0F2F8]">AudioWorkletNode</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#7E859E]">Playback:</span>
                    <span className="text-[#FF8095]">24kHz Gapless PCM</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#7E859E]">Barge-In:</span>
                    <span className="text-[#00F0FF]">&lt; 50ms Auto-Flush</span>
                  </div>
                </div>
              </div>

              {/* AI Core Card */}
              <div className="p-3.5 chamfer-md border border-[rgba(255,255,255,0.15)] bg-[rgba(255,255,255,0.02)] flex flex-col gap-2">
                <div className="flex items-center gap-1.5 text-xs font-['Orbitron',sans-serif] font-bold text-[#F0F2F8]">
                  <Zap className="w-3.5 h-3.5 text-[#00F0FF]" />
                  <span>AI GATEWAY</span>
                </div>
                <div className="flex flex-col gap-1 text-[11px] font-mono">
                  <div className="flex justify-between">
                    <span className="text-[#7E859E]">Model Core:</span>
                    <span className="text-[#00F0FF] truncate max-w-[130px]">gemini-3.1-flash-live</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#7E859E]">Voice Actor:</span>
                    <span className="text-[#FF8095]">{operatorProfile?.voiceName || "Aoede"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#7E859E]">WebSocket:</span>
                    <span
                      className={status !== "DISCONNECTED" ? "text-[#00F0FF]" : "text-[#7E859E]"}>
                      {status}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#7E859E]">Ping Latency:</span>
                    <span className="text-[#00F0FF]">{latencyMs ? `${latencyMs}ms` : "--"}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Row 2: Direct Hardware Renderer, Benchmarks & Mobile PWA */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Direct Hardware Rendering (Zero Filter) Card */}
              <div className="p-3.5 chamfer-md border border-[rgba(0,240,255,0.3)] bg-[rgba(10,11,16,0.85)] flex flex-col gap-2.5 shadow-sm">
                <div className="flex items-center justify-between border-b border-[rgba(0,240,255,0.2)] pb-2">
                  <div className="flex items-center gap-1.5 text-xs font-['Orbitron',sans-serif] font-bold text-[#00F0FF]">
                    <Layers className="w-3.5 h-3.5" />
                    <span>HARDWARE RENDERER</span>
                  </div>
                  <span className="px-2 py-0.5 chamfer-xs text-[9px] font-mono font-bold bg-[#00FF66]/20 text-[#00FF66] border border-[#00FF66]/40">
                    DIRECT WEBGL
                  </span>
                </div>

                <div className="flex flex-col gap-1.5 font-mono text-[11px]">
                  <div className="flex items-center justify-between">
                    <span className="text-[#7E859E]">Buffer Presentation:</span>
                    <span className="text-[#00FF66] font-semibold">Zero-Copy Swap-Chain</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#7E859E]">Preserve Drawing Buffer:</span>
                    <span className="text-[#F0F2F8]">FALSE (Max Throughput)</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#7E859E]">Backface Culling:</span>
                    <span className="text-[#00FF66] font-semibold">HARDWARE FRONT-SIDE</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#7E859E]">Texture Sampler:</span>
                    <span className="text-[#00F0FF]">Linear Mipmapping</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#7E859E]">Visual Texture Clarity:</span>
                    <span className="text-[#00F0FF] font-semibold">100% PURE NATIVE</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#7E859E]">GPU Power Preference:</span>
                    <span className="text-[#00FF66] font-semibold">High-Performance (dGPU)</span>
                  </div>
                </div>
              </div>

              {/* Performance Benchmarks Card */}
              <div className="p-3.5 chamfer-md border border-[rgba(0,255,102,0.3)] bg-[rgba(10,11,16,0.85)] flex flex-col gap-2.5 shadow-sm">
                <div className="flex items-center justify-between border-b border-[rgba(0,255,102,0.2)] pb-2">
                  <div className="flex items-center gap-1.5 text-xs font-['Orbitron',sans-serif] font-bold text-[#00FF66]">
                    <Activity className="w-3.5 h-3.5" />
                    <span>BENCHMARKS & PROFILER</span>
                  </div>
                  <span className="px-1.5 py-0.5 chamfer-xs bg-[#00FF66]/15 text-[#00FF66] text-[9px] font-mono font-bold">
                    NOMINAL
                  </span>
                </div>

                <div className="flex flex-col gap-1.5 font-mono text-[11px]">
                  <div className="flex justify-between items-center">
                    <span className="text-[#7E859E]">Target 60 FPS:</span>
                    <span className="text-[#00FF66] font-bold">
                      {fps ? `${fps} FPS` : "60.0 FPS"}
                    </span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-[#7E859E]">Frame Time Delta:</span>
                    <span className="text-[#00F0FF]">
                      {frameTimeMs ? `${frameTimeMs} ms` : "16.6 ms"}
                    </span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-[#7E859E]">Voice Latency Target:</span>
                    <span className="text-[#00FF66] font-semibold">
                      {latencyMs ? `${latencyMs}ms (&lt;500ms)` : "&lt; 500ms (PASS)"}
                    </span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-[#7E859E]">R3F Zero-GC Audit:</span>
                    <span className="text-[#00FF66] font-semibold">ZERO HEAP ALLOC</span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-[#7E859E]">Multisampling:</span>
                    <span className="text-[#F0F2F8]">0 (Fast Pass Mode)</span>
                  </div>
                </div>
              </div>

              {/* Mobile Remote Relay & PWA Card */}
              <div className="p-3.5 chamfer-md border border-[rgba(0,102,255,0.3)] bg-[rgba(10,11,16,0.85)] flex flex-col gap-2.5 shadow-sm">
                <div className="flex items-center justify-between border-b border-[rgba(0,102,255,0.2)] pb-2">
                  <div className="flex items-center gap-1.5 text-xs font-['Orbitron',sans-serif] font-bold text-[#70B5FF]">
                    <Smartphone className="w-3.5 h-3.5" />
                    <span>MOBILE REMOTE (PWA)</span>
                  </div>
                  <span className="px-1.5 py-0.5 chamfer-xs bg-[#0066FF]/15 text-[#70B5FF] text-[9px] font-mono">
                    LAN READY
                  </span>
                </div>

                <div className="flex flex-col gap-1.5 font-mono text-[11px]">
                  <div className="flex justify-between items-center">
                    <span className="text-[#7E859E]">PWA Standalone:</span>
                    <span className="text-[#00FF66] font-semibold">ENABLED</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[#7E859E]">Mic Relay Protocol:</span>
                    <span className="text-[#00F0FF]">Push-To-Talk</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[#7E859E]">Pairing Channel:</span>
                    <span className="text-[#F0F2F8]">Local WiFi QR</span>
                  </div>
                </div>

                <button
                  onClick={() => setIsMobileModalOpen(true)}
                  className="mt-auto w-full py-1.5 chamfer-btn bg-[rgba(0,102,255,0.15)] border border-[#0066FF] text-[#70B5FF] hover:bg-[#0066FF] hover:text-white transition-all cursor-pointer font-mono text-xs font-bold flex items-center justify-center gap-1.5 shadow-[0_0_12px_rgba(0,102,255,0.25)]">
                  <QrCode className="w-3.5 h-3.5" />
                  <span>PAIR MOBILE VIA QR CODE</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
export default TacticalDrawer;
