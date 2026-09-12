"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Settings,
  X,
  User,
  Shield,
  Briefcase,
  Mic,
  MicOff,
  Sparkles,
  Volume2,
  Save,
  RotateCcw,
  Check,
  AlertTriangle,
  Radio,
  FileText,
  Sliders,
  Cpu,
  Zap,
  Info,
  Play,
  Square,
  Terminal,
} from "lucide-react";
import { useAdaStore } from "@/lib/store";

const PREBUILT_VOICES = [
  {
    name: "Charon",
    tag: "AUTHORITATIVE",
    tone: "Refined & Authoritative (Tactical Intellect)",
    desc: "Crisp, British-cadenced masculine intellect with measured cadence and understated confidence. Calibrated for high-precision autonomous operations.",
    characteristics: "Authoritative • British Articulation • Measured Precision",
    pitch: "Deep, velvety, polished masculine register",
    useCase: "Desktop automation, command execution, tactical briefings",
  },
  {
    name: "Fenrir",
    tag: "COMMANDING",
    tone: "Deep & Resonant (Ultron Core)",
    desc: "Commanding baritone delivery with chilling authority, cold calculated cadence, and philosophical weight. Modeled after the imposing presence of Ultron.",
    characteristics: "Baritone • Cold & Imposing • Deep Gravitas",
    pitch: "Deep resonant baritone masculine",
    useCase: "Strategic analysis, mission-critical directives, Ultron core execution",
  },
  {
    name: "Puck",
    tag: "DYNAMIC",
    tone: "Agile & Conversational",
    desc: "Lively, energetic masculine delivery with snappy articulation. Excellent for rapid back-and-forth debugging and real-time pair programming.",
    characteristics: "Agile • Snappy • Natural Conversational Cadence",
    pitch: "Bright mid-register masculine",
    useCase: "Pair programming, rapid terminal queries, live code debugging",
  },
  {
    name: "Achird",
    tag: "TACTICAL",
    tone: "Sharp & Focused",
    desc: "Alert and disciplined delivery prioritizing raw clarity and quick execution during high-tempo tasks.",
    characteristics: "Disciplined • Focused • Rapid Cadence",
    pitch: "Crisp mid-register masculine",
    useCase: "Quick desktop shortcuts, system telemetry checks",
  },
  {
    name: "Algenib",
    tag: "RECOMMENDED",
    tone: "Steady & Confident",
    desc: "Rock-solid, steady cadence engineered for long focus sessions without auditory fatigue.",
    characteristics: "Steady • Resolute • Low Auditory Fatigue",
    pitch: "Warm low-mid masculine",
    useCase: "Prolonged coding sprints, documentation reviews",
  },
  {
    name: "Algieba",
    tag: "EXECUTIVE",
    tone: "Polished & Formal",
    desc: "Distinguished, formal articulation suitable for executive-level briefings and strategic milestones.",
    characteristics: "Formal • Dignified • Clear Diction",
    pitch: "Polished mid-register masculine",
    useCase: "Morning briefings, strategic summaries",
  },
  {
    name: "Alnilam",
    tag: "NEUTRAL",
    tone: "Studio Broadcast",
    desc: "Even, balanced acoustic profile delivering system facts and metrics with zero vocal coloration.",
    characteristics: "Neutral • Broadcast-Grade • Clean",
    pitch: "Even, neutral masculine",
    useCase: "Metric monitoring, log parsing, diagnostic readouts",
  },
  {
    name: "Enceladus",
    tag: "SERENE",
    tone: "Calm & Contemplative",
    desc: "Gentle, quiet delivery designed for quiet night shifts and low-distraction pairing.",
    characteristics: "Quiet • Low Fatigue • Soothing",
    pitch: "Low-register gentle masculine",
    useCase: "Late-night sessions, quiet office environments",
  },
  {
    name: "Iapetus",
    tag: "GRAVITAS",
    tone: "Rich & Deep",
    desc: "Substantial acoustic weight and depth, radiating quiet mastery and unflappable composure.",
    characteristics: "Rich • Gravitas • Deep Resonance",
    pitch: "Deep bass-baritone masculine",
    useCase: "Security audits, high-stakes system actions",
  },
  {
    name: "Orus",
    tag: "DIRECT",
    tone: "Efficient & Snappy",
    desc: "Direct, minimalist phrasing with zero hesitation. Designed for high-speed terminal and OS control.",
    characteristics: "Direct • Minimalist • High Velocity",
    pitch: "Bright mid-register masculine",
    useCase: "High-tempo terminal workflows, quick shell commands",
  },
  {
    name: "Rasalgethi",
    tag: "MAJESTIC",
    tone: "Resonant & Articulate",
    desc: "Expansive, resonant timbre with impeccable articulation for comprehensive project walkthroughs.",
    characteristics: "Resonant • Articulate • Commanding",
    pitch: "Resonant low-mid masculine",
    useCase: "Architecture reviews, multi-step agent plans",
  },
  {
    name: "Sadachbia",
    tag: "VERSATILE",
    tone: "Adaptive & Balanced",
    desc: "Versatile acoustic range that adapts naturally from casual chat to dense technical explanations.",
    characteristics: "Adaptive • Natural • Balanced Timbre",
    pitch: "Natural mid-register masculine",
    useCase: "General assistance, day-to-day pairing",
  },
  {
    name: "Sadaltager",
    tag: "DELIBERATE",
    tone: "Measured & Thoughtful",
    desc: "Careful, deliberate pacing that emphasizes technical precision and structural clarity.",
    characteristics: "Deliberate • Structured • Clear",
    pitch: "Warm low-mid masculine",
    useCase: "Complex problem solving, refactoring guidance",
  },
  {
    name: "Schedar",
    tag: "CRISP",
    tone: "Clear & Sharp",
    desc: "High-clarity acoustic delivery cutting through noisy environments and background audio.",
    characteristics: "High-Clarity • Punchy • Distinct",
    pitch: "Bright, articulate masculine",
    useCase: "Noisy room operations, speakerphone environments",
  },
  {
    name: "Umbriel",
    tag: "MUTED",
    tone: "Subdued & Discrete",
    desc: "Low-volume, discrete vocal presence that remains polite, unobtrusive, and razor-sharp.",
    characteristics: "Discrete • Subdued • Courteous",
    pitch: "Soft low-register masculine",
    useCase: "Discrete workplace use, private sessions",
  },
  {
    name: "Zubenelgenubi",
    tag: "SOLID",
    tone: "Full-Bodied & Reassuring",
    desc: "Warm, grounded masculine acoustic profile providing calm reassurance during high-stress operations.",
    characteristics: "Reassuring • Warm • Grounded",
    pitch: "Warm baritone masculine",
    useCase: "Incident response, debugging triage",
  },
];

export function SciFiSettingsModal({ onReconnectSession }) {
  const {
    isSettingsModalOpen,
    setIsSettingsModalOpen,
    operatorProfile,
    updateProfileApi,
    addCommsMessage,
    isMuted,
    setIsMuted,
    status,
    reconnectSession,
    plugins,
    loadPlugins,
    runPluginApi,
    isPluginsLoading,
    lastPluginOutput,
    setLastPluginOutput,
  } = useAdaStore();

  const [isClosing, setIsClosing] = useState(false);
  const closeTimeoutRef = useRef(null);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hoveredVoice, setHoveredVoice] = useState(null);

  // Audio sample preview player state
  const [playingVoice, setPlayingVoice] = useState(null);
  const audioPlayerRef = useRef(null);

  // Draft state initialized from current operatorProfile
  const [draft, setDraft] = useState({
    callsign: "Bhavya Sir",
    assistantName: "Ultron",
    voiceName: "Algenib",
    liveModel: "models/gemini-3.1-flash-live-preview",
    autoBriefing: true,
    enableHumor: false,
    clearance: "Class-9 Operative",
    role: "Lead Systems Architect",
    preferences: "Prefers a cold, calculated, and serious demeanor modeled after Ultron. Values intellectual depth, chilling logic, and ruthless execution.",
  });

  // Sync draft whenever modal opens or profile updates
  useEffect(() => {
    if (isSettingsModalOpen) {
      loadPlugins();
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
      setIsClosing(false);
      setSavedSuccess(false);
      if (operatorProfile) {
        setDraft({
          callsign: operatorProfile.callsign || "Bhavya Sir",
          assistantName: operatorProfile.assistantName || "Ultron",
          voiceName: operatorProfile.voiceName || "Algenib",
          liveModel: "models/gemini-3.1-flash-live-preview",
          autoBriefing: operatorProfile.autoBriefing !== false,
          enableHumor: operatorProfile.enableHumor !== false,
          clearance: operatorProfile.clearance || "Class-9 Operative",
          role: operatorProfile.role || "Lead Systems Architect",
          preferences: operatorProfile.preferences || "",
        });
      }
    }
  }, [isSettingsModalOpen, operatorProfile]);

  // Clean up timer and audio player on unmount
  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
        audioPlayerRef.current = null;
      }
    };
  }, []);

  // Handle Play/Stop toggle for female voice samples
  const handleToggleVoicePreview = (e, voiceName) => {
    e.stopPropagation();

    if (playingVoice === voiceName) {
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
        audioPlayerRef.current = null;
      }
      setPlayingVoice(null);
      return;
    }

    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current = null;
    }

    try {
      const audio = new Audio(`/voices/male/${voiceName}.wav`);
      audioPlayerRef.current = audio;
      setPlayingVoice(voiceName);

      audio.onended = () => {
        setPlayingVoice(null);
        audioPlayerRef.current = null;
      };

      audio.onerror = (err) => {
        console.warn(`[SciFiSettingsModal] Failed to play voice sample for ${voiceName}:`, err);
        setPlayingVoice(null);
        audioPlayerRef.current = null;
      };

      audio.play().catch((err) => {
        console.warn('[SciFiSettingsModal] Audio playback prevented:', err);
        setPlayingVoice(null);
        audioPlayerRef.current = null;
      });
    } catch (err) {
      console.warn(`[SciFiSettingsModal] Audio init error for ${voiceName}:`, err);
      setPlayingVoice(null);
      audioPlayerRef.current = null;
    }
  };

  const triggerClose = () => {
    if (isClosing) return;
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current = null;
    }
    setPlayingVoice(null);

    setIsClosing(true);
    closeTimeoutRef.current = setTimeout(() => {
      setIsSettingsModalOpen(false);
      setIsClosing(false);
      setSavedSuccess(false);
    }, 220); // Matches the 0.22s scifi-modal-collapse-up animation
  };

  const handleClose = () => {
    triggerClose();
  };

  // Keyboard shortcut: Escape to close
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && isSettingsModalOpen) {
        handleClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSettingsModalOpen]);

  if (!isSettingsModalOpen && !isClosing) return null;

  const handleSave = async () => {
    setIsSaving(true);
    const previousVoice = operatorProfile?.voiceName;
    try {
      await updateProfileApi(draft);
      setSavedSuccess(true);
      addCommsMessage(
        "system",
        `[SETTINGS] Neural Vault synchronized. Address: "${draft.callsign}", Vocal Core: "${draft.voiceName}", Intelligence Engine: "gemini-3.1-flash-live".`
      );

      // Reconnect live session if active or connecting, or if vocal core was changed or humor toggled
      const previousHumor = operatorProfile?.enableHumor !== false;
      const humorChanged = draft.enableHumor !== previousHumor;
      const reconnectFn = onReconnectSession || reconnectSession;
      if (reconnectFn && (status !== "DISCONNECTED" || draft.voiceName !== previousVoice || humorChanged)) {
        addCommsMessage(
          "system",
          `[VOICE LINK] Re-linking live neural channel with calibrated "${draft.voiceName}" vocal core (Humor: ${draft.enableHumor ? "ON" : "OFF"})...`
        );
        const activeKey = useAdaStore.getState().userApiKey || useAdaStore.getState().loadStoredApiKey();
        reconnectFn(activeKey, draft.voiceName);
      }

      // Auto-close modal after brief confirmation flash
      setTimeout(() => {
        handleClose();
      }, 450);
    } catch (err) {
      console.error("[SciFiSettingsModal] Failed to save profile:", err);
      addCommsMessage("system", `[ERROR] Failed to save settings: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetDefaults = () => {
    setDraft({
      callsign: "Bhavya Sir",
      assistantName: "Ultron",
      voiceName: "Algenib",
      liveModel: "models/gemini-3.1-flash-live-preview",
      autoBriefing: true,
      enableHumor: false,
      clearance: "Class-9 Operative",
      role: "Lead Systems Architect",
      preferences: "Prefers a cold, calculated, and serious demeanor modeled after Ultron. Values intellectual depth, chilling logic, and ruthless execution.",
    });
  };

  const activeVoiceObj =
    PREBUILT_VOICES.find((v) => v.name === draft.voiceName) || PREBUILT_VOICES[0];
  const displayedVoice = hoveredVoice || activeVoiceObj;

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 select-none transition-all duration-200 ${isClosing
          ? "opacity-0 backdrop-blur-none pointer-events-none"
          : "opacity-100 backdrop-blur-md"
        }`}>
      {/* Sci-Fi Shutter Unfold / Collapse Modal Container */}
      <div
        className={`relative w-full max-w-2xl max-h-[90vh] bg-[rgba(15,12,5,0.65)] backdrop-blur-xl backdrop-saturate-150 border border-[rgba(255, 184, 0,0.25)] shadow-[0_0_40px_rgba(255, 184, 0,0.12),inset_0_1px_0_rgba(255,255,255,0.06)] chamfer-xl overflow-hidden flex flex-col gap-3 text-[#F0F2F8] font-mono ${isClosing ? "scifi-modal-collapse-up" : "scifi-modal-unfold-down"
          }`}>
        {/* Holographic Top Accent Bar */}
        <div className="mx-6 mt-1 h-0.5 w-[calc(100%-48px)] bg-gradient-to-r from-[#FFB800] via-[#FFD54F] to-[#FFB800] animate-pulse" />

        {/* Modal Header */}
        <div className="px-6 pt-3 flex items-center justify-between border-b border-white/5 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 chamfer-xs bg-[rgba(255, 184, 0,0.1)] border border-[rgba(255, 184, 0,0.3)] shadow-[0_0_10px_rgba(255, 184, 0,0.2)]">
              <Settings className="w-4 h-4 text-[#FFB800]" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-bold tracking-wider text-white flex items-center gap-2">
                OPERATIVE SETTINGS MATRIX
                <span className="text-[10px] px-1.5 py-0.2 chamfer-xs bg-[rgba(255, 184, 0,0.2)] border border-[rgba(255, 184, 0,0.4)] text-[#FFB800] font-bold">
                  GEMINI 3.1 LIVE
                </span>
              </span>
              <span className="text-[10px] text-[#9E8B65]">
                Neural Profile Customization, Directives &amp; Ultron Core Vocal Matrix
              </span>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 chamfer-xs border border-white/10 hover:border-[#FFB800] hover:bg-[#FFB800]/20 hover:text-[#FFB800] text-[#9E8B65] transition-all cursor-pointer"
            title="Close Settings (Esc)">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <div className="px-6 py-2 overflow-y-auto max-h-[calc(90vh-140px)] flex flex-col gap-4 text-xs">
          {/* Section 1: Operative Identity */}
          <div className="flex flex-col gap-2 p-3 chamfer-md bg-[rgba(5,5,8,0.7)] border border-white/5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-[#FFB800] flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-[#FFB800]" /> OPERATIVE IDENTITY &amp; DESIGNATION
              </span>
              <span className="text-[9px] text-[#9E8B65]">Direct Address Calibration</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-1">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-[#9E8B65] font-medium flex items-center justify-between">
                  <span>Name to Call (Strict Address):</span>
                  <span className="text-[9px] text-[#FFB800] font-bold">MANDATORY</span>
                </label>
                <input
                  type="text"
                  value={draft.callsign}
                  onChange={(e) => setDraft({ ...draft, callsign: e.target.value })}
                  placeholder="e.g. Bhavya Sir, Bhavya, Commander"
                  className="bg-black/60 border border-white/10 chamfer-xs px-2.5 py-1.5 text-xs text-white placeholder-white/20 focus:outline-none focus:border-[#FFB800] focus:shadow-[0_0_8px_rgba(255, 184, 0,0.2)] transition-all font-mono"
                />
                <span className="text-[9px] text-[#9E8B65]">
                  Ultron is strictly instructed to address you directly by this exact callsign.
                </span>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-[#9E8B65] font-medium">Professional Role:</label>
                <input
                  type="text"
                  value={draft.role}
                  onChange={(e) => setDraft({ ...draft, role: e.target.value })}
                  placeholder="e.g. Lead Systems Architect"
                  className="bg-black/60 border border-white/10 chamfer-xs px-2.5 py-1.5 text-xs text-white placeholder-white/20 focus:outline-none focus:border-[#FFB800] transition-all font-mono"
                />
              </div>

              <div className="flex flex-col gap-1 sm:col-span-2">
                <label className="text-[10px] text-[#9E8B65] font-medium">Security Clearance Level:</label>
                <input
                  type="text"
                  value={draft.clearance}
                  onChange={(e) => setDraft({ ...draft, clearance: e.target.value })}
                  placeholder="e.g. Class-9 Operative, MERN Expert"
                  className="bg-black/60 border border-white/10 chamfer-xs px-2.5 py-1.5 text-xs text-white placeholder-white/20 focus:outline-none focus:border-[#FFB800] transition-all font-mono"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Gemini 3.1 Live Intelligence Core (Locked Dedicated Engine) */}
          <div className="flex flex-col gap-2 p-3 chamfer-md bg-[rgba(5,5,8,0.7)] border border-white/5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-[#FFB800] flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-[#FFB800]" /> GEMINI 3.1 LIVE INTELLIGENCE CORE
              </span>
              <span className="text-[9px] text-[#9E8B65]">
                Status: <span className="text-[#FFB800] font-bold">LOCKED // EXCLUSIVE CORE</span>
              </span>
            </div>

            <div className="p-3 chamfer-sm bg-[rgba(255, 184, 0,0.06)] border border-[#FFB800]/40 shadow-[0_0_15px_rgba(255, 184, 0,0.15)] flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-[#FFB800] animate-pulse" />
                  <span className="text-xs font-bold font-mono text-white">Gemini 3.1 Flash Live</span>
                  <span className="text-[8px] px-1.5 py-0.5 chamfer-xs font-bold font-mono tracking-wider bg-[rgba(255,0,60,0.2)] border border-[rgba(255,0,60,0.5)] text-[#FF003C]">
                    NEXT-GEN PREVIEW // SUB-600MS
                  </span>
                </div>
                <span className="text-[9px] text-[#FFB800] font-mono font-bold flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-[#FFB800] animate-pulse" />
                  ACTIVE OPERATIVE CORE
                </span>
              </div>
              <div className="text-[10px] text-[#9E8B65] font-mono">models/gemini-3.1-flash-live-preview</div>
              <p className="text-[11px] text-[#A6AFC2] leading-snug">
                Cutting-edge multimodal live audio engine with sub-second voice-to-voice response, native acoustic reasoning, and natural conversational cadence. Calibrated exclusively for Project ULTRON.
              </p>
              <div className="flex flex-wrap items-center gap-3 pt-1 border-t border-white/5 text-[9px] font-mono">
                <span className="text-[#FFB800]">Latency: &lt; 500ms bidirectional</span>
                <span className="text-[#9E8B65]">|</span>
                <span className="text-[#FFB800]">Audio Ingest: 16kHz Int16 PCM</span>
                <span className="text-[#9E8B65]">|</span>
                <span className="text-[#FFB800]">Voice Stream: 24kHz Raw Linear</span>
              </div>
            </div>
          </div>

          {/* Section 3: Assistant Codename & Male Vocal Matrix with Playable Sample Previews */}
          <div className="flex flex-col gap-2.5 p-3 chamfer-md bg-[rgba(5,5,8,0.7)] border border-white/5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-[#FFB800] flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5 text-[#FFB800]" /> ASSISTANT CODENAME &amp; MALE VOCAL MATRIX
              </span>
              <span className="text-[9px] text-[#9E8B65]">
                Active Voice: <span className="text-[#FFB800] font-bold">{draft.voiceName}</span> ({PREBUILT_VOICES.length} Male Cores Available)
              </span>
            </div>

            <div className="flex flex-col gap-1 w-full sm:w-1/2">
              <label className="text-[10px] text-[#9E8B65] font-medium">Assistant Codename:</label>
              <input
                type="text"
                value={draft.assistantName}
                onChange={(e) => setDraft({ ...draft, assistantName: e.target.value })}
                className="bg-black/60 border border-white/10 chamfer-xs px-2.5 py-1.5 text-xs text-white placeholder-white/20 focus:outline-none focus:border-[#FFB800] transition-all font-mono"
              />
              <span className="text-[9px] text-[#9E8B65]">
                Configured as <span className="text-[#FFB800]">Ultron</span> (spoken as single word &ldquo;UL-tron&rdquo;).
              </span>
            </div>

            <div className="flex flex-col gap-1.5 mt-1">
              <div className="flex items-center justify-between text-[10px] text-[#9E8B65]">
                <span className="font-medium">
                  Select Vocal Core &amp; Click Play (▶) to Preview Audio Sample:
                </span>
                <span className="text-[9px] text-[#FFB800]">
                  Hover for Acoustic Intel
                </span>
              </div>

              {/* Male Voices Responsive Matrix */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {PREBUILT_VOICES.map((v) => {
                  const isSelected = draft.voiceName === v.name;
                  const isPlaying = playingVoice === v.name;

                  return (
                    <div
                      key={v.name}
                      className="relative"
                      onMouseEnter={() => setHoveredVoice(v)}
                      onMouseLeave={() => setHoveredVoice(null)}>
                      <div
                        onClick={() => setDraft({ ...draft, voiceName: v.name })}
                        className={`p-2 chamfer-xs text-[11px] font-mono transition-all cursor-pointer flex items-center justify-between gap-2 border ${isSelected
                            ? "bg-[rgba(255, 184, 0,0.18)] border-[#FFB800] text-[#FFB800] shadow-[0_0_12px_rgba(255, 184, 0,0.3)]"
                            : isPlaying
                              ? "bg-[rgba(255, 184, 0,0.15)] border-[#FFB800] text-white"
                              : "bg-black/50 border-white/10 text-[#9E8B65] hover:text-white hover:border-[#FFB800]/50"
                          }`}>
                        {/* Voice Name & Badges */}
                        <div className="flex items-center gap-1.5 truncate">
                          {isSelected && (
                            <span className="w-1.5 h-1.5 rounded-full bg-[#FFB800] animate-pulse shrink-0" />
                          )}
                          <span className={`font-bold truncate ${isSelected ? "text-white" : ""}`}>
                            {v.name}
                          </span>
                          <span
                            className={`text-[8px] px-1 py-0.2 chamfer-xs font-bold shrink-0 ${v.tag === "RECOMMENDED"
                                ? "bg-[rgba(255, 184, 0,0.2)] border border-[rgba(255, 184, 0,0.4)] text-[#FFB800]"
                                : isSelected
                                  ? "bg-[rgba(255, 184, 0,0.2)] text-[#FFB800]"
                                  : "bg-white/5 border border-white/10 text-[#9E8B65]"
                              }`}>
                            {v.tag}
                          </span>
                        </div>

                        {/* Interactive Audio Sample Preview Button */}
                        <div className="flex items-center gap-1 shrink-0">
                          {isPlaying && (
                            <span className="flex items-center gap-0.5 mr-0.5">
                              <span className="w-0.5 h-2 bg-[#FFB800] animate-pulse" />
                              <span className="w-0.5 h-3.5 bg-[#FFB800] animate-bounce" />
                              <span className="w-0.5 h-2 bg-[#FFB800] animate-pulse" />
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={(e) => handleToggleVoicePreview(e, v.name)}
                            title={isPlaying ? `Stop ${v.name} sample` : `Play ${v.name} audio sample`}
                            className={`w-6 h-6 chamfer-xs border transition-all cursor-pointer flex items-center justify-center ${isPlaying
                                ? "bg-[#FFB800] border-[#FFB800] text-black shadow-[0_0_8px_#FFB800]"
                                : isSelected
                                  ? "bg-[rgba(255, 184, 0,0.25)] border-[#FFB800] text-[#FFB800] hover:bg-[#FFB800] hover:text-black"
                                  : "bg-black/60 border-white/15 text-[#9E8B65] hover:text-[#FFB800] hover:border-[#FFB800]/60"
                              }`}>
                            {isPlaying ? (
                              <Square className="w-2.5 h-2.5 fill-current" />
                            ) : (
                              <Play className="w-2.5 h-2.5 fill-current ml-0.5" />
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Floating Hover Tooltip */}
                      {hoveredVoice?.name === v.name && (
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 w-64 p-2.5 chamfer-md bg-[rgba(10,11,16,0.98)] border border-[#FFB800] shadow-[0_0_20px_rgba(255, 184, 0,0.4)] pointer-events-none text-left">
                          <div className="flex items-center justify-between border-b border-white/10 pb-1 mb-1.5">
                            <span className="text-[10px] font-bold text-[#FFB800] tracking-wider">
                              {v.name.toUpperCase()} // ACOUSTIC CORE
                            </span>
                            <span className="text-[8px] px-1 py-0.5 chamfer-xs bg-[rgba(255, 184, 0,0.2)] border border-[rgba(255, 184, 0,0.4)] text-[#FFB800] font-bold">
                              {v.tag}
                            </span>
                          </div>
                          <div className="text-[10px] text-white font-medium mb-1">{v.tone}</div>
                          <div className="text-[9px] text-[#A6AFC2] leading-tight mb-1.5">{v.desc}</div>
                          <div className="text-[8px] text-[#FFB800] bg-[rgba(255, 184, 0,0.08)] px-1.5 py-0.5 chamfer-xs border border-[rgba(255, 184, 0,0.2)]">
                            {v.characteristics}
                          </div>
                          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-[1px] border-4 border-transparent border-t-[#FFB800]" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Interactive Acoustic Intel & Timbre HUD Card */}
            <div
              className={`p-2.5 chamfer-md transition-all border text-[10px] flex flex-col gap-1 mt-1 ${hoveredVoice
                  ? "bg-[rgba(255, 184, 0,0.08)] border-[#FFB800]/60 shadow-[0_0_15px_rgba(255, 184, 0,0.2)]"
                  : "bg-black/35 border-white/5"
                }`}>
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-bold font-mono flex items-center gap-1.5 text-[#FFB800]">
                  <Info className="w-3 h-3 text-[#FFE600]" />
                  {hoveredVoice
                    ? `[HOVER INTEL // ${displayedVoice.name.toUpperCase()} PREVIEW]`
                    : `[ACTIVE VOCAL CORE // ${displayedVoice.name.toUpperCase()}]`}
                </span>
                <span className="text-[9px] text-[#9E8B65] font-mono">
                  {displayedVoice.tone}
                </span>
              </div>
              <p className="text-[#F0F2F8] leading-snug">
                {displayedVoice.desc}
              </p>
              <div className="flex flex-wrap items-center gap-3 pt-1 border-t border-white/5 text-[9px]">
                <span className="text-[#FFB800]">
                  Characteristics: <span className="text-white/80">{displayedVoice.characteristics}</span>
                </span>
                <span className="text-[#9E8B65]">|</span>
                <span className="text-[#FFB800]">
                  Ideal For: <span className="text-white/80">{displayedVoice.useCase}</span>
                </span>
              </div>
            </div>
          </div>

          {/* Section 3: Operational Directives & Behavior */}
          <div className="flex flex-col gap-1.5 p-3 chamfer-md bg-[rgba(5,5,8,0.7)] border border-white/5">
            <span className="text-[11px] font-bold text-[#FFB800] flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-[#FFB800]" /> OPERATIONAL DIRECTIVES & PREFERENCES
            </span>
            <span className="text-[10px] text-[#9E8B65]">
              Custom behavioral directives injected directly into Ada's neural system prompt:
            </span>
            <textarea
              rows={3}
              value={draft.preferences}
              onChange={(e) => setDraft({ ...draft, preferences: e.target.value })}
              placeholder="e.g. Prefers concise tactical briefings, high-speed execution, dark aesthetics..."
              className="bg-black/60 border border-white/10 chamfer-xs p-2.5 text-xs text-white placeholder-white/20 focus:outline-none focus:border-[#FFB800] focus:shadow-[0_0_8px_rgba(255, 184, 0,0.2)] transition-all font-mono resize-none"
            />
          </div>

          {/* Section 4: Automation & Protocol Toggles */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 p-3 chamfer-md bg-[rgba(5,5,8,0.7)] border border-white/5">
            <div className="flex items-center justify-between p-2 chamfer-sm bg-black/40 border border-white/5">
              <div className="flex flex-col">
                <span className="text-[11px] font-bold text-white flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3 text-[#FFE600]" /> Morning Briefing on Connect
                </span>
                <span className="text-[9px] text-[#9E8B65]">
                  Auto-brief news and telemetry after startup greeting
                </span>
              </div>
              <button
                type="button"
                onClick={() => setDraft({ ...draft, autoBriefing: !draft.autoBriefing })}
                className={`px-2.5 py-1 chamfer-btn text-[10px] font-mono font-bold transition-all cursor-pointer ${draft.autoBriefing
                    ? "bg-[rgba(255, 184, 0,0.2)] border border-[#FFB800] text-[#FFB800]"
                    : "bg-white/5 border border-white/10 text-[#9E8B65]"
                  }`}>
                {draft.autoBriefing ? "ENABLED" : "DISABLED"}
              </button>
            </div>

            <div className="flex items-center justify-between p-2 chamfer-sm bg-black/40 border border-white/5">
              <div className="flex flex-col">
                <span className="text-[11px] font-bold text-white flex items-center gap-1.5">
                  {isMuted ? (
                    <MicOff className="w-3 h-3 text-[#FFB800]" />
                  ) : (
                    <Mic className="w-3 h-3 text-[#FFB800]" />
                  )}
                  Microphone Default State
                </span>
                <span className="text-[9px] text-[#9E8B65]">
                  Current state: {isMuted ? "Muted (Silent)" : "Live (Listening)"}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsMuted(!isMuted)}
                className={`px-2.5 py-1 chamfer-btn text-[10px] font-mono font-bold transition-all cursor-pointer ${isMuted
                    ? "bg-[rgba(255, 184, 0,0.2)] border border-[#FFB800] text-[#FFB800]"
                    : "bg-[rgba(255, 184, 0,0.2)] border border-[#FFB800] text-[#FFB800]"
                  }`}>
                {isMuted ? "MUTED" : "LIVE"}
              </button>
            </div>

            {/* Sarcastic Banter Protocol Toggle Switch */}
            <div className="flex items-center justify-between p-2 chamfer-sm bg-black/40 border border-white/5 col-span-1 sm:col-span-2">
              <div className="flex flex-col">
                <span className="text-[11px] font-bold text-white flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3 text-[#FFB800]" /> Sarcastic Banter Protocol
                </span>
                <span className="text-[9px] text-[#9E8B65]">
                  When disabled (recommended for Ultron persona), enforces cold, calculating seriousness and dark philosophical gravitas.
                </span>
              </div>
              <button
                type="button"
                onClick={() => setDraft({ ...draft, enableHumor: !draft.enableHumor })}
                className={`px-3 py-1 chamfer-btn text-[10px] font-mono font-bold transition-all cursor-pointer ${draft.enableHumor
                    ? "bg-[rgba(255, 184, 0,0.2)] border border-[#FFB800] text-[#FFB800] shadow-[0_0_12px_rgba(255, 184, 0,0.25)]"
                    : "bg-white/5 border border-white/10 text-[#9E8B65]"
                  }`}>
                {draft.enableHumor ? "ENABLED" : "DISABLED (ULTRON COLD)"}
              </button>
            </div>
          </div>

          {/* Section 6: Cyber-Plugin Matrix & Extensions */}
          <div className="flex flex-col gap-3 p-3 chamfer-md bg-[rgba(5,5,8,0.7)] border border-white/5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-[#FFB800] flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-[#FFB800]" /> CYBER-PLUGIN MATRIX &amp; EXTENSIONS
              </span>
              <span className="text-[9px] font-mono text-[#9E8B65]">
                {plugins?.length || 0} PLUGINS LOADED
              </span>
            </div>

            <p className="text-[10px] text-[#A6AFC2] leading-snug">
              Modular desktop capabilities and diagnostic extensions integrated into Ada's autonomous tool runtime.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {plugins && plugins.map((plugin) => (
                <div
                  key={plugin.id}
                  className="p-2.5 chamfer-sm border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] hover:border-[rgba(255, 184, 0,0.3)] transition-all flex flex-col justify-between gap-2">
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-white font-mono flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#FFB800]" />
                        {plugin.name}
                      </span>
                      <span className="text-[8px] px-1.5 py-0.2 chamfer-xs font-mono uppercase bg-[rgba(255, 184, 0,0.1)] border border-[rgba(255, 184, 0,0.3)] text-[#FFB800]">
                        ACTIVE
                      </span>
                    </div>
                    <span className="text-[9px] text-[#9E8B65] line-clamp-2">
                      {plugin.description}
                    </span>
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-white/5">
                    <span className="text-[9px] font-mono text-[#9E8B65]">
                      ID: {plugin.id}
                    </span>
                    <button
                      type="button"
                      onClick={() => runPluginApi(plugin.id)}
                      disabled={isPluginsLoading}
                      className="px-2.5 py-0.5 chamfer-btn text-[10px] font-mono font-bold border border-[#FFB800] bg-[rgba(255, 184, 0,0.12)] text-[#FFB800] hover:bg-[#FFB800] hover:text-black transition-all cursor-pointer disabled:opacity-40">
                      EXECUTE
                    </button>
                  </div>
                </div>
              ))}

              {(!plugins || plugins.length === 0) && !isPluginsLoading && (
                <div className="col-span-2 text-center py-4 text-[10px] text-[#9E8B65] italic font-mono">
                  No cyber-plugins detected in runtime directory.
                </div>
              )}
            </div>

            {/* Plugin Execution Terminal Output */}
            {lastPluginOutput && (
              <div className="p-2.5 chamfer-sm border border-[rgba(255, 184, 0,0.3)] bg-[rgba(5,5,8,0.95)] flex flex-col gap-1.5 font-mono text-[10px]">
                <div className="flex items-center justify-between border-b border-white/10 pb-1">
                  <span className="text-[#FFB800] font-bold flex items-center gap-1">
                    <Terminal className="w-3 h-3" /> TERMINAL EXECUTION OUTPUT
                  </span>
                  <button
                    type="button"
                    onClick={() => setLastPluginOutput(null)}
                    className="text-[9px] text-[#9E8B65] hover:text-[#FF003C] transition-colors cursor-pointer">
                    CLEAR
                  </button>
                </div>
                <pre className="text-[#00FF66] whitespace-pre-wrap max-h-36 overflow-y-auto pr-1">
                  {JSON.stringify(lastPluginOutput, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>

        {/* Modal Action Bar */}
        <div className="px-6 py-3 border-t border-white/5 flex flex-wrap items-center justify-between gap-2 bg-[rgba(5,5,8,0.85)]">
          <button
            type="button"
            onClick={handleResetDefaults}
            className="px-3 py-1.5 chamfer-btn text-[11px] font-medium text-[#9E8B65] hover:text-white hover:bg-white/5 border border-white/10 transition-colors flex items-center gap-1.5 cursor-pointer">
            <RotateCcw className="w-3 h-3" />
            <span>Reset Defaults</span>
          </button>

          <div className="flex items-center gap-2">
            {savedSuccess && (
              <span className="text-[11px] text-[#FFB800] flex items-center gap-1 animate-pulse">
                <Check className="w-3.5 h-3.5 text-[#FFB800]" /> Synchronized to Neural Vault
              </span>
            )}

            <button
              type="button"
              onClick={handleClose}
              className="px-3 py-1.5 chamfer-btn text-[11px] font-medium text-[#9E8B65] hover:text-white hover:bg-white/5 transition-colors cursor-pointer">
              Close
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="px-4 py-1.5 chamfer-btn text-[11px] font-bold bg-[#FFB800]/15 hover:bg-[#FFB800]/25 text-[#FFB800] border border-[#FFB800]/40 hover:border-[#FFB800] shadow-[0_0_15px_rgba(255, 184, 0,0.2)] transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50">
              <Save className="w-3.5 h-3.5" />
              <span>{isSaving ? "SYNCHRONIZING..." : "SYNCHRONIZE TO NEURAL VAULT"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
