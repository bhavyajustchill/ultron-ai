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
  Ear,
  Power,
  Palette,
  Headphones,
  History,
} from "lucide-react";
import { useJarvisStore } from "@/lib/store";
import { GEMINI_LIVE_MODEL, GEMINI_LIVE_LABEL } from "@/lib/jarvisPersona";
import { DEFAULT_WAKE_PHRASE } from "@/lib/wakePhrase";
import { ACCENT_PRESETS, DEFAULT_ACCENT, normalizeHex } from "@/lib/accentTheme";
import { listAudioDevices, canChooseOutput } from "@/lib/audioDevices";

const PREBUILT_VOICES = [
  {
    name: "Charon",
    tag: "RECOMMENDED",
    tone: "Refined & Authoritative (JARVIS Core)",
    desc: "Crisp, British-cadenced masculine intellect with measured cadence and understated confidence. Calibrated for high-precision autonomous operations and dry wit.",
    characteristics: "Authoritative • British Articulation • Razor-Sharp Wit",
    pitch: "Deep, velvety, polished masculine register",
    useCase: "Desktop automation, command execution, tactical briefings",
  },
  {
    name: "Fenrir",
    tag: "COMMANDING",
    tone: "Deep & Resonant",
    desc: "Powerful, baritone delivery with decisive authority. Commanding presence for mission-critical directives and complex systems management.",
    characteristics: "Baritone • Decisive • Commanding Presence",
    pitch: "Deep resonant baritone masculine",
    useCase: "System alerts, tactical directives, security protocols",
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
    tag: "RESOLUTE",
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
  } = useJarvisStore();

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
    assistantName: "Jarvis",
    voiceName: "Charon",
    liveModel: GEMINI_LIVE_MODEL,
    autoBriefing: true,
    enableHumor: true,
    proactiveEnabled: true,
    clipboardWatch: false,
    keepTranscripts: true,
    sessionRetentionDays: 180,
    accentColor: DEFAULT_ACCENT,
    wakeWordEnabled: true,
    wakePhrase: DEFAULT_WAKE_PHRASE,
    clearance: "Class-9 Operative",
    role: "Lead Systems Architect",
    preferences: "Prefers concise, authoritative tactical briefings, high-speed execution, dry British wit, and playful daily humor.",
  });

  // Accent theme (Phase 8.7): previewed live, saved with the profile, reverted if not saved
  const setAccentPreview = useJarvisStore((state) => state.setAccentPreview);
  const selectAccent = (hex) => {
    const accent = normalizeHex(hex);
    if (!accent) return;
    setDraft((current) => ({ ...current, accentColor: accent }));
    setAccentPreview(accent);
  };
  const [accentInput, setAccentInput] = useState("");

  // Audio devices (Phase 8.7) are per browser and apply immediately
  const audioInput = useJarvisStore((state) => state.audioInput);
  const audioOutput = useJarvisStore((state) => state.audioOutput);
  const setAudioDevice = useJarvisStore((state) => state.setAudioDevice);
  const [audioDevices, setAudioDevices] = useState({ inputs: [], outputs: [], labelled: false });
  const refreshAudioDevices = async (requestLabels = false) => {
    try {
      setAudioDevices(await listAudioDevices({ requestLabels }));
    } catch (err) {
      addCommsMessage("system", `[AUDIO] Device list unavailable: ${err.message}`);
    }
  };
  const chooseAudioDevice = (kind, id) => {
    const pool = kind === "input" ? audioDevices.inputs : audioDevices.outputs;
    const device = pool.find((d) => d.id === id) || null;
    setAudioDevice(kind, device);
    addCommsMessage("system", `[AUDIO] ${kind === "input" ? "Microphone" : "Speaker"}: ${device?.label || "system default"}.`);
  };
  useEffect(() => {
    if (isSettingsModalOpen) refreshAudioDevices(false);
  }, [isSettingsModalOpen]);

  // Offline "Hey Jarvis" models (Phase 8.12): installed on request because of their licence
  const offlineWakeReady = useJarvisStore((state) => state.offlineWakeReady);
  const [wakeModelBusy, setWakeModelBusy] = useState(false);
  const changeWakeModels = async (action) => {
    setWakeModelBusy(true);
    try {
      const res = await fetch("/api/wakeword", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const result = await res.json();
      useJarvisStore.getState().setOfflineWakeReady(Boolean(result.installed));
      addCommsMessage("system", `[WAKE] ${result.message}`);
    } catch (err) {
      addCommsMessage("system", `[WAKE] Could not change the offline wake word: ${err.message}`);
    } finally {
      setWakeModelBusy(false);
    }
  };

  // Start on login is a desktop login entry, applied immediately rather than on Save
  // undefined while checking, null when the status could not be read
  const [startOnLogin, setStartOnLogin] = useState(undefined);
  const [startOnLoginBusy, setStartOnLoginBusy] = useState(false);

  const callStartOnLogin = async (value) => {
    const res = await fetch("/api/system-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "start_on_login", value }),
    });
    return res.json();
  };

  useEffect(() => {
    if (!isSettingsModalOpen) return;
    callStartOnLogin("status")
      .then((result) => setStartOnLogin(result.success ? result.start_on_login : null))
      .catch(() => setStartOnLogin(null));
  }, [isSettingsModalOpen]);

  const toggleStartOnLogin = async () => {
    setStartOnLoginBusy(true);
    try {
      const result = await callStartOnLogin(startOnLogin ? "off" : "on");
      if (result.success) setStartOnLogin(result.start_on_login);
      addCommsMessage("system", `[SETTINGS] ${result.message}`);
    } catch (err) {
      addCommsMessage("system", `[SETTINGS] Start on login could not be changed: ${err.message}`);
    } finally {
      setStartOnLoginBusy(false);
    }
  };

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
          assistantName: operatorProfile.assistantName || "Jarvis",
          voiceName: operatorProfile.voiceName || "Charon",
          liveModel: GEMINI_LIVE_MODEL,
          autoBriefing: operatorProfile.autoBriefing !== false,
          enableHumor: operatorProfile.enableHumor !== false,
          proactiveEnabled: operatorProfile.proactiveEnabled !== false,
          clipboardWatch: operatorProfile.clipboardWatch === true,
          keepTranscripts: operatorProfile.keepTranscripts !== false,
          sessionRetentionDays: [30, 90, 180, 365, 0].includes(Number(operatorProfile.sessionRetentionDays)) ? Number(operatorProfile.sessionRetentionDays) : 180,
          accentColor: normalizeHex(operatorProfile.accentColor) || DEFAULT_ACCENT,
          wakeWordEnabled: operatorProfile.wakeWordEnabled !== false,
          wakePhrase: operatorProfile.wakePhrase || DEFAULT_WAKE_PHRASE,
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
    setAccentPreview(null);

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
      await updateProfileApi({ ...draft, wakePhrase: draft.wakePhrase.trim() || DEFAULT_WAKE_PHRASE });
      setSavedSuccess(true);
      addCommsMessage(
        "system",
        `[SETTINGS] Neural Vault synchronized. Address: "${draft.callsign}", Vocal Core: "${draft.voiceName}", Intelligence Engine: "${GEMINI_LIVE_MODEL.replace("models/", "")}".`
      );

      // Live link: re-link with the new settings and carry the conversation over. Offline: a voice or
      // humour change connects fresh so the new voice greets the operator.
      const previousHumor = operatorProfile?.enableHumor !== false;
      const humorChanged = draft.enableHumor !== previousHumor;
      const reconnectFn = onReconnectSession || reconnectSession;
      const relinkSession = useJarvisStore.getState().relinkSession;
      // Only fields that shape the live session need a re-link (not the accent or HUD toggles)
      const sessionChanged =
        humorChanged ||
        ["voiceName", "callsign", "assistantName", "role", "clearance", "preferences", "wakePhrase"].some(
          (key) => (draft[key] || "") !== (operatorProfile?.[key] || "")
        );
      setAccentPreview(null);
      if (status !== "DISCONNECTED" && relinkSession && sessionChanged) {
        relinkSession(draft.voiceName);
      } else if (reconnectFn && (draft.voiceName !== previousVoice || humorChanged)) {
        addCommsMessage(
          "system",
          `[VOICE LINK] Re-linking live neural channel with calibrated "${draft.voiceName}" vocal core (Humor: ${draft.enableHumor ? "ON" : "OFF"})...`
        );
        const activeKey = useJarvisStore.getState().userApiKey || useJarvisStore.getState().loadStoredApiKey();
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
    setAccentPreview(DEFAULT_ACCENT);
    setDraft({
      callsign: "Bhavya Sir",
      assistantName: "Jarvis",
      voiceName: "Charon",
      liveModel: GEMINI_LIVE_MODEL,
      autoBriefing: true,
      enableHumor: true,
      proactiveEnabled: true,
      clipboardWatch: false,
      keepTranscripts: true,
      sessionRetentionDays: 180,
      accentColor: DEFAULT_ACCENT,
      wakeWordEnabled: true,
      wakePhrase: DEFAULT_WAKE_PHRASE,
      clearance: "Class-9 Operative",
      role: "Lead Systems Architect",
      preferences: "Prefers concise, authoritative tactical briefings, high-speed execution, dry British wit, and playful daily humor.",
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
        className={`relative w-full max-w-2xl max-h-[90vh] bg-[rgba(8,12,18,0.55)] backdrop-blur-xl backdrop-saturate-150 border border-[rgba(var(--jarvis-accent-rgb),0.25)] shadow-[0_0_40px_rgba(var(--jarvis-accent-rgb),0.12),inset_0_1px_0_rgba(255,255,255,0.06)] chamfer-xl overflow-hidden flex flex-col gap-3 text-[#F0F2F8] font-mono ${isClosing ? "scifi-modal-collapse-up" : "scifi-modal-unfold-down"
          }`}>
        {/* Holographic Top Accent Bar */}
        <div className="mx-6 mt-1 h-0.5 w-[calc(100%-48px)] bg-gradient-to-r from-[var(--jarvis-accent-2)] via-[#70E8FF] to-[var(--jarvis-accent-2)] animate-pulse" />

        {/* Modal Header */}
        <div className="px-6 pt-3 flex items-center justify-between border-b border-white/5 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 chamfer-xs bg-[rgba(var(--jarvis-accent-2-rgb),0.1)] border border-[rgba(var(--jarvis-accent-2-rgb),0.3)] shadow-[0_0_10px_rgba(var(--jarvis-accent-2-rgb),0.2)]">
              <Settings className="w-4 h-4 text-[var(--jarvis-accent-2)]" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-bold tracking-wider text-white flex items-center gap-2">
                OPERATIVE SETTINGS MATRIX
                <span className="text-[10px] px-1.5 py-0.2 chamfer-xs bg-[rgba(var(--jarvis-accent-2-rgb),0.2)] border border-[rgba(var(--jarvis-accent-2-rgb),0.4)] text-[var(--jarvis-accent-2)] font-bold">
                  {GEMINI_LIVE_LABEL.toUpperCase()}
                </span>
              </span>
              <span className="text-[10px] text-[#7E859E]">
                Neural Profile Customization, Directives &amp; J.A.R.V.I.S Male Vocal Cores
              </span>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 chamfer-xs border border-white/10 hover:border-[var(--jarvis-accent-2)] hover:bg-[var(--jarvis-accent-2)]/20 hover:text-[var(--jarvis-accent-2)] text-[#7E859E] transition-all cursor-pointer"
            title="Close Settings (Esc)">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <div className="px-6 py-2 overflow-y-auto max-h-[calc(90vh-140px)] flex flex-col gap-4 text-xs">
          {/* Section 1: Operative Identity */}
          <div className="flex flex-col gap-2 p-3 chamfer-md bg-[rgba(5,5,8,0.7)] border border-white/5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-[var(--jarvis-accent-2)] flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-[var(--jarvis-accent-2)]" /> OPERATIVE IDENTITY &amp; DESIGNATION
              </span>
              <span className="text-[9px] text-[#7E859E]">Direct Address Calibration</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-1">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-[#7E859E] font-medium flex items-center justify-between">
                  <span>Name to Call (Strict Address):</span>
                  <span className="text-[9px] text-[var(--jarvis-accent-2)] font-bold">MANDATORY</span>
                </label>
                <input
                  type="text"
                  value={draft.callsign}
                  onChange={(e) => setDraft({ ...draft, callsign: e.target.value })}
                  placeholder="e.g. Bhavya Sir, Bhavya, Commander"
                  className="bg-black/60 border border-white/10 chamfer-xs px-2.5 py-1.5 text-xs text-white placeholder-white/20 focus:outline-none focus:border-[var(--jarvis-accent-2)] focus:shadow-[0_0_8px_rgba(var(--jarvis-accent-2-rgb),0.2)] transition-all font-mono"
                />
                <span className="text-[9px] text-[#7E859E]">
                  J.A.R.V.I.S is strictly instructed to address you directly by this exact callsign.
                </span>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-[#7E859E] font-medium">Professional Role:</label>
                <input
                  type="text"
                  value={draft.role}
                  onChange={(e) => setDraft({ ...draft, role: e.target.value })}
                  placeholder="e.g. Lead Systems Architect"
                  className="bg-black/60 border border-white/10 chamfer-xs px-2.5 py-1.5 text-xs text-white placeholder-white/20 focus:outline-none focus:border-[var(--jarvis-accent-2)] transition-all font-mono"
                />
              </div>

              <div className="flex flex-col gap-1 sm:col-span-2">
                <label className="text-[10px] text-[#7E859E] font-medium">Security Clearance Level:</label>
                <input
                  type="text"
                  value={draft.clearance}
                  onChange={(e) => setDraft({ ...draft, clearance: e.target.value })}
                  placeholder="e.g. Class-9 Operative, MERN Expert"
                  className="bg-black/60 border border-white/10 chamfer-xs px-2.5 py-1.5 text-xs text-white placeholder-white/20 focus:outline-none focus:border-[var(--jarvis-accent-2)] transition-all font-mono"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Gemini Live Intelligence Core (Locked Dedicated Engine) */}
          <div className="flex flex-col gap-2 p-3 chamfer-md bg-[rgba(5,5,8,0.7)] border border-white/5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-[var(--jarvis-accent-2)] flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-[var(--jarvis-accent-2)]" /> {GEMINI_LIVE_LABEL.toUpperCase()} INTELLIGENCE CORE
              </span>
              <span className="text-[9px] text-[#7E859E]">
                Status: <span className="text-[var(--jarvis-accent-2)] font-bold">LOCKED // EXCLUSIVE CORE</span>
              </span>
            </div>

            <div className="p-3 chamfer-sm bg-[rgba(var(--jarvis-accent-2-rgb),0.06)] border border-[var(--jarvis-accent-2)]/40 shadow-[0_0_15px_rgba(var(--jarvis-accent-2-rgb),0.15)] flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-[var(--jarvis-accent-2)] animate-pulse" />
                  <span className="text-xs font-bold font-mono text-white">{GEMINI_LIVE_LABEL}</span>
                  <span className="text-[8px] px-1.5 py-0.5 chamfer-xs font-bold font-mono tracking-wider bg-[rgba(255,0,60,0.2)] border border-[rgba(255,0,60,0.5)] text-[#FF003C]">
                    NEXT-GEN PREVIEW // SUB-600MS
                  </span>
                </div>
                <span className="text-[9px] text-[var(--jarvis-accent-2)] font-mono font-bold flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-[var(--jarvis-accent-2)] animate-pulse" />
                  ACTIVE OPERATIVE CORE
                </span>
              </div>
              <div className="text-[10px] text-[#7E859E] font-mono">{GEMINI_LIVE_MODEL}</div>
              <p className="text-[11px] text-[#A6AFC2] leading-snug">
                Cutting-edge multimodal live audio engine with sub-second voice-to-voice response, native acoustic reasoning, and natural conversational cadence. Calibrated exclusively for Project J.A.R.V.I.S Mark II.
              </p>
              <div className="flex flex-wrap items-center gap-3 pt-1 border-t border-white/5 text-[9px] font-mono">
                <span className="text-[var(--jarvis-accent-2)]">Latency: &lt; 500ms bidirectional</span>
                <span className="text-[#7E859E]">|</span>
                <span className="text-[var(--jarvis-accent-2)]">Audio Ingest: 16kHz Int16 PCM</span>
                <span className="text-[#7E859E]">|</span>
                <span className="text-[var(--jarvis-accent-2)]">Voice Stream: 24kHz Raw Linear</span>
              </div>
            </div>
          </div>

          {/* Section 3: Assistant Codename & Male Vocal Matrix with Playable Sample Previews */}
          <div className="flex flex-col gap-2.5 p-3 chamfer-md bg-[rgba(5,5,8,0.7)] border border-white/5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-[var(--jarvis-accent-2)] flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5 text-[var(--jarvis-accent)]" /> ASSISTANT CODENAME &amp; MALE VOCAL MATRIX
              </span>
              <span className="text-[9px] text-[#7E859E]">
                Active Voice: <span className="text-[var(--jarvis-accent-2)] font-bold">{draft.voiceName}</span> ({PREBUILT_VOICES.length} Male Cores Available)
              </span>
            </div>

            <div className="flex flex-col gap-1 w-full sm:w-1/2">
              <label className="text-[10px] text-[#7E859E] font-medium">Assistant Codename:</label>
              <input
                type="text"
                value={draft.assistantName}
                onChange={(e) => setDraft({ ...draft, assistantName: e.target.value })}
                className="bg-black/60 border border-white/10 chamfer-xs px-2.5 py-1.5 text-xs text-white placeholder-white/20 focus:outline-none focus:border-[var(--jarvis-accent-2)] transition-all font-mono"
              />
              <span className="text-[9px] text-[#7E859E]">
                Configured as <span className="text-[var(--jarvis-accent-2)]">Jarvis</span> (spoken as single word &ldquo;JAR-vis&rdquo; without acronym pauses).
              </span>
            </div>

            <div className="flex flex-col gap-1.5 mt-1">
              <div className="flex items-center justify-between text-[10px] text-[#7E859E]">
                <span className="font-medium">
                  Select Vocal Core &amp; Click Play (▶) to Preview Audio Sample:
                </span>
                <span className="text-[9px] text-[var(--jarvis-accent-2)]">
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
                            ? "bg-[rgba(var(--jarvis-accent-2-rgb),0.18)] border-[var(--jarvis-accent-2)] text-[var(--jarvis-accent-2)] shadow-[0_0_12px_rgba(var(--jarvis-accent-2-rgb),0.3)]"
                            : isPlaying
                              ? "bg-[rgba(var(--jarvis-accent-2-rgb),0.15)] border-[var(--jarvis-accent-2)] text-white"
                              : "bg-black/50 border-white/10 text-[#7E859E] hover:text-white hover:border-[var(--jarvis-accent-2)]/50"
                          }`}>
                        {/* Voice Name & Badges */}
                        <div className="flex items-center gap-1.5 truncate">
                          {isSelected && (
                            <span className="w-1.5 h-1.5 rounded-full bg-[var(--jarvis-accent-2)] animate-pulse shrink-0" />
                          )}
                          <span className={`font-bold truncate ${isSelected ? "text-white" : ""}`}>
                            {v.name}
                          </span>
                          <span
                            className={`text-[8px] px-1 py-0.2 chamfer-xs font-bold shrink-0 ${v.tag === "RECOMMENDED"
                                ? "bg-[rgba(var(--jarvis-accent-2-rgb),0.2)] border border-[rgba(var(--jarvis-accent-2-rgb),0.4)] text-[var(--jarvis-accent-2)]"
                                : isSelected
                                  ? "bg-[rgba(var(--jarvis-accent-2-rgb),0.2)] text-[var(--jarvis-accent-2)]"
                                  : "bg-white/5 border border-white/10 text-[#7E859E]"
                              }`}>
                            {v.tag}
                          </span>
                        </div>

                        {/* Interactive Audio Sample Preview Button */}
                        <div className="flex items-center gap-1 shrink-0">
                          {isPlaying && (
                            <span className="flex items-center gap-0.5 mr-0.5">
                              <span className="w-0.5 h-2 bg-[var(--jarvis-accent-2)] animate-pulse" />
                              <span className="w-0.5 h-3.5 bg-[var(--jarvis-accent-2)] animate-bounce" />
                              <span className="w-0.5 h-2 bg-[var(--jarvis-accent-2)] animate-pulse" />
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={(e) => handleToggleVoicePreview(e, v.name)}
                            title={isPlaying ? `Stop ${v.name} sample` : `Play ${v.name} audio sample`}
                            className={`w-6 h-6 chamfer-xs border transition-all cursor-pointer flex items-center justify-center ${isPlaying
                                ? "bg-[var(--jarvis-accent-2)] border-[var(--jarvis-accent-2)] text-black shadow-[0_0_8px_var(--jarvis-accent-2)]"
                                : isSelected
                                  ? "bg-[rgba(var(--jarvis-accent-2-rgb),0.25)] border-[var(--jarvis-accent-2)] text-[var(--jarvis-accent-2)] hover:bg-[var(--jarvis-accent-2)] hover:text-black"
                                  : "bg-black/60 border-white/15 text-[#7E859E] hover:text-[var(--jarvis-accent-2)] hover:border-[var(--jarvis-accent-2)]/60"
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
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 w-64 p-2.5 chamfer-md bg-[rgba(10,11,16,0.98)] border border-[var(--jarvis-accent-2)] shadow-[0_0_20px_rgba(var(--jarvis-accent-2-rgb),0.4)] pointer-events-none text-left">
                          <div className="flex items-center justify-between border-b border-white/10 pb-1 mb-1.5">
                            <span className="text-[10px] font-bold text-[var(--jarvis-accent-2)] tracking-wider">
                              {v.name.toUpperCase()} // ACOUSTIC CORE
                            </span>
                            <span className="text-[8px] px-1 py-0.5 chamfer-xs bg-[rgba(var(--jarvis-accent-2-rgb),0.2)] border border-[rgba(var(--jarvis-accent-2-rgb),0.4)] text-[var(--jarvis-accent-2)] font-bold">
                              {v.tag}
                            </span>
                          </div>
                          <div className="text-[10px] text-white font-medium mb-1">{v.tone}</div>
                          <div className="text-[9px] text-[#A6AFC2] leading-tight mb-1.5">{v.desc}</div>
                          <div className="text-[8px] text-[var(--jarvis-accent-2)] bg-[rgba(var(--jarvis-accent-2-rgb),0.08)] px-1.5 py-0.5 chamfer-xs border border-[rgba(var(--jarvis-accent-2-rgb),0.2)]">
                            {v.characteristics}
                          </div>
                          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-[1px] border-4 border-transparent border-t-[var(--jarvis-accent-2)]" />
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
                  ? "bg-[rgba(var(--jarvis-accent-2-rgb),0.08)] border-[var(--jarvis-accent-2)]/60 shadow-[0_0_15px_rgba(var(--jarvis-accent-2-rgb),0.2)]"
                  : "bg-black/35 border-white/5"
                }`}>
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-bold font-mono flex items-center gap-1.5 text-[var(--jarvis-accent-2)]">
                  <Info className="w-3 h-3 text-[#FFE600]" />
                  {hoveredVoice
                    ? `[HOVER INTEL // ${displayedVoice.name.toUpperCase()} PREVIEW]`
                    : `[ACTIVE VOCAL CORE // ${displayedVoice.name.toUpperCase()}]`}
                </span>
                <span className="text-[9px] text-[#7E859E] font-mono">
                  {displayedVoice.tone}
                </span>
              </div>
              <p className="text-[#F0F2F8] leading-snug">
                {displayedVoice.desc}
              </p>
              <div className="flex flex-wrap items-center gap-3 pt-1 border-t border-white/5 text-[9px]">
                <span className="text-[var(--jarvis-accent-2)]">
                  Characteristics: <span className="text-white/80">{displayedVoice.characteristics}</span>
                </span>
                <span className="text-[#7E859E]">|</span>
                <span className="text-[var(--jarvis-accent-2)]">
                  Ideal For: <span className="text-white/80">{displayedVoice.useCase}</span>
                </span>
              </div>
            </div>
          </div>

          {/* Section 3: Operational Directives & Behavior */}
          <div className="flex flex-col gap-1.5 p-3 chamfer-md bg-[rgba(5,5,8,0.7)] border border-white/5">
            <span className="text-[11px] font-bold text-[var(--jarvis-accent-2)] flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-[var(--jarvis-accent-2)]" /> OPERATIONAL DIRECTIVES & PREFERENCES
            </span>
            <span className="text-[10px] text-[#7E859E]">
              Custom behavioral directives injected directly into Jarvis's neural system prompt:
            </span>
            <textarea
              rows={3}
              value={draft.preferences}
              onChange={(e) => setDraft({ ...draft, preferences: e.target.value })}
              placeholder="e.g. Prefers concise tactical briefings, high-speed execution, dark aesthetics..."
              className="bg-black/60 border border-white/10 chamfer-xs p-2.5 text-xs text-white placeholder-white/20 focus:outline-none focus:border-[var(--jarvis-accent-2)] focus:shadow-[0_0_8px_rgba(var(--jarvis-accent-2-rgb),0.2)] transition-all font-mono resize-none"
            />
          </div>

          {/* Section 4: Automation & Protocol Toggles */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 p-3 chamfer-md bg-[rgba(5,5,8,0.7)] border border-white/5">
            <div className="flex items-center justify-between p-2 chamfer-sm bg-black/40 border border-white/5">
              <div className="flex flex-col">
                <span className="text-[11px] font-bold text-white flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3 text-[#FFE600]" /> Morning Briefing on Connect
                </span>
                <span className="text-[9px] text-[#7E859E]">
                  Auto-brief news and telemetry after startup greeting
                </span>
              </div>
              <button
                type="button"
                onClick={() => setDraft({ ...draft, autoBriefing: !draft.autoBriefing })}
                className={`px-2.5 py-1 chamfer-btn text-[10px] font-mono font-bold transition-all cursor-pointer ${draft.autoBriefing
                    ? "bg-[rgba(var(--jarvis-accent-2-rgb),0.2)] border border-[var(--jarvis-accent-2)] text-[var(--jarvis-accent-2)]"
                    : "bg-white/5 border border-white/10 text-[#7E859E]"
                  }`}>
                {draft.autoBriefing ? "ENABLED" : "DISABLED"}
              </button>
            </div>

            <div className="flex items-center justify-between p-2 chamfer-sm bg-black/40 border border-white/5">
              <div className="flex flex-col">
                <span className="text-[11px] font-bold text-white flex items-center gap-1.5">
                  {isMuted ? (
                    <MicOff className="w-3 h-3 text-[var(--jarvis-accent-2)]" />
                  ) : (
                    <Mic className="w-3 h-3 text-[var(--jarvis-accent-2)]" />
                  )}
                  Microphone Default State
                </span>
                <span className="text-[9px] text-[#7E859E]">
                  Current state: {isMuted ? "Muted (Silent)" : "Live (Listening)"}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsMuted(!isMuted)}
                className={`px-2.5 py-1 chamfer-btn text-[10px] font-mono font-bold transition-all cursor-pointer ${isMuted
                    ? "bg-[rgba(var(--jarvis-accent-2-rgb),0.2)] border border-[var(--jarvis-accent-2)] text-[var(--jarvis-accent-2)]"
                    : "bg-[rgba(var(--jarvis-accent-2-rgb),0.2)] border border-[var(--jarvis-accent-2)] text-[var(--jarvis-accent-2)]"
                  }`}>
                {isMuted ? "MUTED" : "LIVE"}
              </button>
            </div>

            {/* British Wit & Daily Humor Protocol Toggle Switch */}
            <div className="flex items-center justify-between p-2 chamfer-sm bg-black/40 border border-white/5 col-span-1 sm:col-span-2">
              <div className="flex flex-col">
                <span className="text-[11px] font-bold text-white flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3 text-[var(--jarvis-accent)]" /> British Wit & Daily Humor
                </span>
                <span className="text-[9px] text-[#7E859E]">
                  Infuse daily banter, greetings, and briefings with Jarvis's signature deadpan wit & playful sarcasm
                </span>
              </div>
              <button
                type="button"
                onClick={() => setDraft({ ...draft, enableHumor: !draft.enableHumor })}
                className={`px-3 py-1 chamfer-btn text-[10px] font-mono font-bold transition-all cursor-pointer ${draft.enableHumor
                    ? "bg-[rgba(var(--jarvis-accent-rgb),0.2)] border border-[var(--jarvis-accent)] text-[var(--jarvis-accent)] shadow-[0_0_12px_rgba(var(--jarvis-accent-rgb),0.25)]"
                    : "bg-white/5 border border-white/10 text-[#7E859E]"
                  }`}>
                {draft.enableHumor ? "ENABLED" : "DISABLED"}
              </button>
            </div>

            {/* Proactive check-ins (Phase 8.6) */}
            <div className="flex items-center justify-between p-2 chamfer-sm bg-black/40 border border-white/5 col-span-1 sm:col-span-2">
              <div className="flex flex-col">
                <span className="text-[11px] font-bold text-white flex items-center gap-1.5">
                  <Radio className="w-3 h-3 text-[var(--jarvis-accent)]" /> Proactive Check-ins
                </span>
                <span className="text-[9px] text-[#7E859E]">
                  After 15 quiet minutes Jarvis may offer one useful remark (at most every 20 minutes). Hardware and topic alerts are always spoken.
                </span>
              </div>
              <button
                type="button"
                onClick={() => setDraft({ ...draft, proactiveEnabled: !draft.proactiveEnabled })}
                className={`px-3 py-1 chamfer-btn text-[10px] font-mono font-bold transition-all cursor-pointer shrink-0 ${draft.proactiveEnabled
                    ? "bg-[rgba(var(--jarvis-accent-rgb),0.2)] border border-[var(--jarvis-accent)] text-[var(--jarvis-accent)] shadow-[0_0_12px_rgba(var(--jarvis-accent-rgb),0.25)]"
                    : "bg-white/5 border border-white/10 text-[#7E859E]"
                  }`}>
                {draft.proactiveEnabled ? "ENABLED" : "DISABLED"}
              </button>
            </div>

            {/* Session archive (Phase 11): transcripts and retention */}
            <div className="flex items-center justify-between gap-2 p-2 chamfer-sm bg-black/40 border border-white/5 col-span-1 sm:col-span-2">
              <div className="flex flex-col">
                <span className="text-[11px] font-bold text-white flex items-center gap-1.5">
                  <History className="w-3 h-3 text-[var(--jarvis-accent)]" /> Save Conversation Transcripts
                </span>
                <span className="text-[9px] text-[#7E859E]">
                  Keep the full text of each conversation in the Session Archive (on this machine; passwords, keys, and codes are blanked out). Off keeps recaps only.
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <select
                  aria-label="Keep conversations for"
                  value={draft.sessionRetentionDays}
                  onChange={(e) => setDraft({ ...draft, sessionRetentionDays: Number(e.target.value) })}
                  className="bg-black/60 border border-white/10 text-[10px] font-mono text-[#F0F2F8] px-1.5 py-1 chamfer-sm cursor-pointer">
                  <option value={30}>KEEP 30 DAYS</option>
                  <option value={90}>KEEP 90 DAYS</option>
                  <option value={180}>KEEP 180 DAYS</option>
                  <option value={365}>KEEP 1 YEAR</option>
                  <option value={0}>KEEP LAST 200</option>
                </select>
                <button
                  type="button"
                  onClick={() => setDraft({ ...draft, keepTranscripts: !draft.keepTranscripts })}
                  className={`px-3 py-1 chamfer-btn text-[10px] font-mono font-bold transition-all cursor-pointer ${draft.keepTranscripts
                      ? "bg-[rgba(var(--jarvis-accent-rgb),0.2)] border border-[var(--jarvis-accent)] text-[var(--jarvis-accent)] shadow-[0_0_12px_rgba(var(--jarvis-accent-rgb),0.25)]"
                      : "bg-white/5 border border-white/10 text-[#7E859E]"
                    }`}>
                  {draft.keepTranscripts ? "ENABLED" : "RECAPS ONLY"}
                </button>
              </div>
            </div>

            {/* Clipboard intelligence (Phase 8.13), opt-in */}
            <div className="flex items-center justify-between p-2 chamfer-sm bg-black/40 border border-white/5 col-span-1 sm:col-span-2">
              <div className="flex flex-col">
                <span className="text-[11px] font-bold text-white flex items-center gap-1.5">
                  <FileText className="w-3 h-3 text-[var(--jarvis-accent)]" /> Clipboard Intelligence
                </span>
                <span className="text-[9px] text-[#7E859E]">
                  When you copy text, offer Translate / Summarise / Explain / Fix. Nothing is sent until you click; passwords, keys, and codes are ignored.
                </span>
              </div>
              <button
                type="button"
                onClick={() => setDraft({ ...draft, clipboardWatch: !draft.clipboardWatch })}
                className={`px-3 py-1 chamfer-btn text-[10px] font-mono font-bold transition-all cursor-pointer shrink-0 ${draft.clipboardWatch
                    ? "bg-[rgba(var(--jarvis-accent-rgb),0.2)] border border-[var(--jarvis-accent)] text-[var(--jarvis-accent)] shadow-[0_0_12px_rgba(var(--jarvis-accent-rgb),0.25)]"
                    : "bg-white/5 border border-white/10 text-[#7E859E]"
                  }`}>
                {draft.clipboardWatch ? "ENABLED" : "DISABLED"}
              </button>
            </div>

            {/* Start on Login (applies immediately) */}
            <div className="flex items-center justify-between p-2 chamfer-sm bg-black/40 border border-white/5 col-span-1 sm:col-span-2">
              <div className="flex flex-col">
                <span className="text-[11px] font-bold text-white flex items-center gap-1.5">
                  <Power className="w-3 h-3 text-[var(--jarvis-accent)]" /> Start on Login
                </span>
                <span className="text-[9px] text-[#7E859E]">
                  Starts the Jarvis server and opens this HUD when you log in to the computer. Applies immediately.
                </span>
              </div>
              <button
                type="button"
                disabled={startOnLogin == null || startOnLoginBusy}
                onClick={toggleStartOnLogin}
                className={`px-3 py-1 chamfer-btn text-[10px] font-mono font-bold transition-all shrink-0 disabled:opacity-50 cursor-pointer disabled:cursor-wait ${startOnLogin
                    ? "bg-[rgba(var(--jarvis-accent-rgb),0.2)] border border-[var(--jarvis-accent)] text-[var(--jarvis-accent)] shadow-[0_0_12px_rgba(var(--jarvis-accent-rgb),0.25)]"
                    : "bg-white/5 border border-white/10 text-[#7E859E]"
                  }`}>
                {startOnLogin === undefined ? "CHECKING" : startOnLogin === null ? "UNAVAILABLE" : startOnLogin ? "ENABLED" : "DISABLED"}
              </button>
            </div>

            {/* Standby Wake Phrase */}
            <div className="flex flex-col gap-2 p-2 chamfer-sm bg-black/40 border border-white/5 col-span-1 sm:col-span-2">
              <div className="flex items-center justify-between gap-3">
                <div className="flex flex-col">
                  <span className="text-[11px] font-bold text-white flex items-center gap-1.5">
                    <Ear className="w-3 h-3 text-[var(--jarvis-accent)]" /> Standby Wake Phrase
                  </span>
                  <span className="text-[9px] text-[#7E859E]">
                    While offline, saying the phrase links Jarvis back up. Uses the browser&apos;s speech service (Chrome / Edge) only during standby.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setDraft({ ...draft, wakeWordEnabled: !draft.wakeWordEnabled })}
                  className={`px-3 py-1 chamfer-btn text-[10px] font-mono font-bold transition-all cursor-pointer shrink-0 ${draft.wakeWordEnabled
                      ? "bg-[rgba(var(--jarvis-accent-rgb),0.2)] border border-[var(--jarvis-accent)] text-[var(--jarvis-accent)] shadow-[0_0_12px_rgba(var(--jarvis-accent-rgb),0.25)]"
                      : "bg-white/5 border border-white/10 text-[#7E859E]"
                    }`}>
                  {draft.wakeWordEnabled ? "ENABLED" : "DISABLED"}
                </button>
              </div>
              <input
                type="text"
                value={draft.wakePhrase}
                disabled={!draft.wakeWordEnabled}
                onChange={(e) => setDraft({ ...draft, wakePhrase: e.target.value.slice(0, 40) })}
                placeholder={DEFAULT_WAKE_PHRASE}
                className="w-full bg-black/50 border border-[rgba(var(--jarvis-accent-rgb),0.25)] focus:border-[var(--jarvis-accent)] outline-none px-2.5 py-1.5 chamfer-xs text-xs text-white font-mono disabled:opacity-40"
                aria-label="Wake phrase"
              />
              <div className="flex items-center justify-between gap-3 pt-1">
                <span className="text-[9px] text-[#7E859E] leading-relaxed">
                  {offlineWakeReady
                    ? "Offline \"Hey Jarvis\" is installed: the default phrase is heard on this computer without the browser speech service."
                    : "Optional: install the offline \"Hey Jarvis\" detector (about 4 MB; openWakeWord models, CC BY-NC-SA 4.0, non-commercial use)."}
                </span>
                <button
                  type="button"
                  disabled={wakeModelBusy}
                  onClick={() => changeWakeModels(offlineWakeReady ? "remove" : "install")}
                  className="px-2.5 py-1 chamfer-btn text-[9px] font-mono font-bold border border-white/10 bg-white/5 text-[#B8BDCC] hover:border-[var(--jarvis-accent)] shrink-0 cursor-pointer disabled:opacity-50 disabled:cursor-wait">
                  {wakeModelBusy ? "WORKING..." : offlineWakeReady ? "REMOVE OFFLINE" : "INSTALL OFFLINE"}
                </button>
              </div>
            </div>
          </div>

          {/* Section 5: Appearance & Audio Devices (Phase 8.7) */}
          <div className="flex flex-col gap-3 p-3 chamfer-md bg-[rgba(5,5,8,0.7)] border border-white/5">
            <div className="flex flex-col gap-2">
              <span className="text-[11px] font-bold text-white flex items-center gap-1.5">
                <Palette className="w-3 h-3 text-[var(--jarvis-accent)]" /> HUD Accent Colour
              </span>
              <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Accent presets">
                {ACCENT_PRESETS.map((preset) => {
                  const selected = draft.accentColor === preset.hex;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      title={preset.name}
                      onClick={() => selectAccent(preset.hex)}
                      className={`flex items-center gap-1.5 px-2 py-1 chamfer-btn text-[10px] font-mono border transition-all cursor-pointer ${selected ? "border-white/70 bg-white/10 text-white" : "border-white/10 bg-black/40 text-[#B8BDCC] hover:border-white/30"}`}>
                      <span className="w-3 h-3 rounded-full" style={{ background: preset.hex, boxShadow: `0 0 8px ${preset.hex}` }} />
                      {preset.name}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  aria-label="Custom accent colour"
                  value={draft.accentColor.toLowerCase()}
                  onChange={(e) => selectAccent(e.target.value)}
                  className="w-8 h-7 bg-transparent border border-white/10 chamfer-xs cursor-pointer"
                />
                <input
                  type="text"
                  value={accentInput}
                  onChange={(e) => setAccentInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") selectAccent(accentInput);
                  }}
                  onBlur={() => accentInput && selectAccent(accentInput)}
                  placeholder={draft.accentColor}
                  maxLength={7}
                  className="w-24 bg-black/60 border border-white/10 chamfer-xs px-2 py-1 text-[11px] text-white placeholder-white/40 font-mono focus:outline-none focus:border-[var(--jarvis-accent-2)]"
                />
                <span className="text-[9px] text-[#7E859E]">Previewed live; saved with the profile. Status colours (amber, red) never change.</span>
              </div>
            </div>

            <div className="flex flex-col gap-2 pt-2 border-t border-white/5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold text-white flex items-center gap-1.5">
                  <Headphones className="w-3 h-3 text-[var(--jarvis-accent)]" /> Audio Devices
                </span>
                {!audioDevices.labelled && (
                  <button
                    type="button"
                    onClick={() => refreshAudioDevices(true)}
                    className="px-2 py-0.5 chamfer-btn text-[9px] font-mono border border-white/10 bg-white/5 text-[#B8BDCC] hover:border-[var(--jarvis-accent)] cursor-pointer">
                    SHOW DEVICE NAMES
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <label className="flex flex-col gap-1 text-[9px] text-[#7E859E]">
                  Microphone
                  <select
                    value={audioInput?.id || ""}
                    onChange={(e) => chooseAudioDevice("input", e.target.value)}
                    className="bg-black/60 border border-white/10 chamfer-xs p-1.5 text-[11px] text-white font-mono focus:outline-none focus:border-[var(--jarvis-accent-2)]">
                    <option value="">System default</option>
                    {audioDevices.inputs.map((d, i) => (
                      <option key={d.id} value={d.id}>{d.label || `Microphone ${i + 1}`}</option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-[9px] text-[#7E859E]">
                  Speaker {!canChooseOutput() && "(not selectable in this browser)"}
                  <select
                    value={audioOutput?.id || ""}
                    disabled={!canChooseOutput()}
                    onChange={(e) => chooseAudioDevice("output", e.target.value)}
                    className="bg-black/60 border border-white/10 chamfer-xs p-1.5 text-[11px] text-white font-mono focus:outline-none focus:border-[var(--jarvis-accent-2)] disabled:opacity-50">
                    <option value="">System default</option>
                    {audioDevices.outputs.map((d, i) => (
                      <option key={d.id} value={d.id}>{d.label || `Speaker ${i + 1}`}</option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          </div>

          {/* Section 6: Cyber-Plugin Matrix & Extensions */}
          <div className="flex flex-col gap-3 p-3 chamfer-md bg-[rgba(5,5,8,0.7)] border border-white/5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-[var(--jarvis-accent)] flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-[var(--jarvis-accent)]" /> CYBER-PLUGIN MATRIX &amp; EXTENSIONS
              </span>
              <span className="text-[9px] font-mono text-[#7E859E]">
                {plugins?.length || 0} PLUGINS LOADED
              </span>
            </div>

            <p className="text-[10px] text-[#A6AFC2] leading-snug">
              Modular desktop capabilities and diagnostic extensions integrated into Jarvis's autonomous tool runtime.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {plugins && plugins.map((plugin) => (
                <div
                  key={plugin.id}
                  className="p-2.5 chamfer-sm border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] hover:border-[rgba(var(--jarvis-accent-rgb),0.3)] transition-all flex flex-col justify-between gap-2">
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-white font-mono flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-[var(--jarvis-accent)]" />
                        {plugin.name}
                      </span>
                      <span className="text-[8px] px-1.5 py-0.2 chamfer-xs font-mono uppercase bg-[rgba(var(--jarvis-accent-rgb),0.1)] border border-[rgba(var(--jarvis-accent-rgb),0.3)] text-[var(--jarvis-accent)]">
                        ACTIVE
                      </span>
                    </div>
                    <span className="text-[9px] text-[#7E859E] line-clamp-2">
                      {plugin.description}
                    </span>
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-white/5">
                    <span className="text-[9px] font-mono text-[#7E859E]">
                      ID: {plugin.id}
                    </span>
                    <button
                      type="button"
                      onClick={() => runPluginApi(plugin.id)}
                      disabled={isPluginsLoading}
                      className="px-2.5 py-0.5 chamfer-btn text-[10px] font-mono font-bold border border-[var(--jarvis-accent)] bg-[rgba(var(--jarvis-accent-rgb),0.12)] text-[var(--jarvis-accent)] hover:bg-[var(--jarvis-accent)] hover:text-black transition-all cursor-pointer disabled:opacity-40">
                      EXECUTE
                    </button>
                  </div>
                </div>
              ))}

              {(!plugins || plugins.length === 0) && !isPluginsLoading && (
                <div className="col-span-2 text-center py-4 text-[10px] text-[#7E859E] italic font-mono">
                  No cyber-plugins detected in runtime directory.
                </div>
              )}
            </div>

            {/* Plugin Execution Terminal Output */}
            {lastPluginOutput && (
              <div className="p-2.5 chamfer-sm border border-[rgba(var(--jarvis-accent-rgb),0.3)] bg-[rgba(5,5,8,0.95)] flex flex-col gap-1.5 font-mono text-[10px]">
                <div className="flex items-center justify-between border-b border-white/10 pb-1">
                  <span className="text-[var(--jarvis-accent)] font-bold flex items-center gap-1">
                    <Terminal className="w-3 h-3" /> TERMINAL EXECUTION OUTPUT
                  </span>
                  <button
                    type="button"
                    onClick={() => setLastPluginOutput(null)}
                    className="text-[9px] text-[#7E859E] hover:text-[#FF003C] transition-colors cursor-pointer">
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
            className="px-3 py-1.5 chamfer-btn text-[11px] font-medium text-[#7E859E] hover:text-white hover:bg-white/5 border border-white/10 transition-colors flex items-center gap-1.5 cursor-pointer">
            <RotateCcw className="w-3 h-3" />
            <span>Reset Defaults</span>
          </button>

          <div className="flex items-center gap-2">
            {savedSuccess && (
              <span className="text-[11px] text-[var(--jarvis-accent-2)] flex items-center gap-1 animate-pulse">
                <Check className="w-3.5 h-3.5 text-[var(--jarvis-accent-2)]" /> Synchronized to Neural Vault
              </span>
            )}

            <button
              type="button"
              onClick={handleClose}
              className="px-3 py-1.5 chamfer-btn text-[11px] font-medium text-[#7E859E] hover:text-white hover:bg-white/5 transition-colors cursor-pointer">
              Close
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="px-4 py-1.5 chamfer-btn text-[11px] font-bold bg-[var(--jarvis-accent-2)]/15 hover:bg-[var(--jarvis-accent-2)]/25 text-[var(--jarvis-accent-2)] border border-[var(--jarvis-accent-2)]/40 hover:border-[var(--jarvis-accent-2)] shadow-[0_0_15px_rgba(var(--jarvis-accent-2-rgb),0.2)] transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50">
              <Save className="w-3.5 h-3.5" />
              <span>{isSaving ? "SYNCHRONIZING..." : "SYNCHRONIZE TO NEURAL VAULT"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
