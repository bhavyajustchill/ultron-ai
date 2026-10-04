import { loadDeviceChoice, saveDeviceChoice } from '@/lib/audioDevices';
import { create } from 'zustand';

/**
 * Global Zustand store for J.A.R.V.I.S Mark II
 * Keeps real-time HUD telemetry, comms transcript, audio metrics, and API credentials in sync.
 */
// One-time migration of browser settings saved under the original "ada_" storage keys
const LEGACY_STORAGE_KEYS = {
  ada_gemini_api_key: 'jarvis_gemini_api_key',
  ada_voice_name: 'jarvis_voice_name',
  ada_mic_muted: 'jarvis_mic_muted',
  ada_viewport_mode: 'jarvis_viewport_mode',
  // Ultron (before the Jarvis Mark II merge) saved its voice under its own key
  ultron_voice_name: 'jarvis_voice_name',
};
if (typeof window !== 'undefined') {
  try {
    for (const [legacyKey, key] of Object.entries(LEGACY_STORAGE_KEYS)) {
      const value = localStorage.getItem(legacyKey);
      if (value === null) continue;
      if (localStorage.getItem(key) === null) localStorage.setItem(key, value);
      localStorage.removeItem(legacyKey);
    }
  } catch {
    // Storage unavailable (private mode / blocked): nothing to migrate
  }
}

export const useJarvisStore = create((set, get) => ({
  // Live session status
  status: 'DISCONNECTED', // DISCONNECTED | CONNECTING | RECONNECTING | CONNECTED | LISTENING | THINKING | SPEAKING
  setStatus: (status) => set({ status }),

  // Audio stream state
  isMuted: false,
  setIsMuted: (isMuted) =>
    set((state) => {
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem('jarvis_mic_muted', String(isMuted));
        } catch (e) {
          console.warn('[useJarvisStore] Failed to save mic mute state to localStorage:', e);
        }
      }
      const isConnected = state.status !== 'DISCONNECTED' && state.status !== 'CONNECTING';
      let nextStatus = state.status;
      if (isMuted && state.status === 'LISTENING') {
        nextStatus = 'CONNECTED';
      } else if (!isMuted && state.status === 'CONNECTED' && isConnected) {
        nextStatus = 'LISTENING';
      }
      return {
        isMuted,
        status: nextStatus,
        ...(isMuted ? { inputVolume: 0 } : {}),
      };
    }),
  toggleMute: () =>
    set((state) => {
      const nextMuted = !state.isMuted;
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem('jarvis_mic_muted', String(nextMuted));
        } catch (e) {
          console.warn('[useJarvisStore] Failed to save mic mute state to localStorage:', e);
        }
      }
      const isConnected = state.status !== 'DISCONNECTED' && state.status !== 'CONNECTING';
      let nextStatus = state.status;
      if (nextMuted && state.status === 'LISTENING') {
        nextStatus = 'CONNECTED';
      } else if (!nextMuted && state.status === 'CONNECTED' && isConnected) {
        nextStatus = 'LISTENING';
      }
      return {
        isMuted: nextMuted,
        status: nextStatus,
        ...(nextMuted ? { inputVolume: 0 } : {}),
      };
    }),
  loadStoredMicMuted: () => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('jarvis_mic_muted');
        if (stored !== null) {
          const isMuted = stored === 'true';
          set((state) => {
            const isConnected = state.status !== 'DISCONNECTED' && state.status !== 'CONNECTING';
            let nextStatus = state.status;
            if (isMuted && state.status === 'LISTENING') {
              nextStatus = 'CONNECTED';
            } else if (!isMuted && state.status === 'CONNECTED' && isConnected) {
              nextStatus = 'LISTENING';
            }
            return {
              isMuted,
              status: nextStatus,
              ...(isMuted ? { inputVolume: 0 } : {}),
            };
          });
          return isMuted;
        }
      } catch (e) {
        console.warn('[useJarvisStore] Failed to load mic mute state from localStorage:', e);
      }
    }
    return false;
  },

  // Vocal Core LocalStorage Persistence & Dynamic Session Reconnect Trigger
  reconnectSession: null,
  setReconnectSession: (reconnectSession) => set({ reconnectSession }),
  // Re-link with fresh settings while carrying the conversation over (registered by useGeminiLive)
  relinkSession: null,
  setRelinkSession: (relinkSession) => set({ relinkSession }),
  // Reopen an archived conversation (Phase 11), registered by useGeminiLive
  continueSession: null,
  setContinueSession: (continueSession) => set({ continueSession }),
  loadStoredVoiceName: () => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('jarvis_voice_name');
        if (stored) {
          set((state) => ({
            operatorProfile: {
              ...state.operatorProfile,
              voiceName: stored,
            },
          }));
          return stored;
        }
      } catch (e) {
        console.warn('[useJarvisStore] Failed to load voice from localStorage:', e);
      }
    }
    return 'Algenib';
  },
  saveStoredVoiceName: (voiceName) => {
    if (typeof window !== 'undefined' && voiceName) {
      try {
        localStorage.setItem('ultron_voice_name', voiceName);
        localStorage.setItem('jarvis_voice_name', voiceName);
      } catch (e) {
        console.warn('[useJarvisStore] Failed to save voice to localStorage:', e);
      }
    }
  },

  // Latency & Telemetry
  latencyMs: 0,
  setLatencyMs: (latencyMs) => set({ latencyMs }),
  inputVolume: 0,
  setInputVolume: (inputVolume) => set({ inputVolume }),
  outputVolume: 0,
  setOutputVolume: (outputVolume) => set({ outputVolume }),

  // Credentials Modal State
  isKeyModalOpen: false,
  setIsKeyModalOpen: (isKeyModalOpen) => set({ isKeyModalOpen }),

  // Viewport Holographic Mode ('orb')
  viewportMode: 'orb',
  setViewportMode: (viewportMode) => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('jarvis_viewport_mode', viewportMode);
      } catch { }
    }
    set({ viewportMode });
  },
  loadStoredViewportMode: () => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('jarvis_viewport_mode');
        if (stored === 'orb') {
          set({ viewportMode: stored });
          return stored;
        }
      } catch { }
    }
    return 'orb';
  },

  // Multimodal Cyber-Vision State
  isScreenModalOpen: false,
  setIsScreenModalOpen: (isScreenModalOpen) => set({ isScreenModalOpen }),
  isScreenSharing: false,
  setIsScreenSharing: (isScreenSharing) => set({ isScreenSharing }),
  isWebcamOpen: false,
  setIsWebcamOpen: (isWebcamOpen) => set({ isWebcamOpen }),
  isWebcamActive: false,
  setIsWebcamActive: (isWebcamActive) => set({ isWebcamActive }),
  visionMode: 'snapshot', // 'snapshot' | 'stream'
  setVisionMode: (visionMode) => set({ visionMode }),
  visionInterval: 1500, // streaming interval in ms
  setVisionInterval: (visionInterval) => set({ visionInterval }),
  visionFramesSent: 0,
  incrementVisionFrames: () => set((state) => ({ visionFramesSent: state.visionFramesSent + 1 })),
  resetVisionFrames: () => set({ visionFramesSent: 0 }),
  activeVisionSource: 'none', // 'none' | 'screen' | 'webcam'
  setActiveVisionSource: (activeVisionSource) => set({ activeVisionSource }),

  // Live Host System Telemetry (Mark-LI Parity)
  systemTelemetry: {
    cpu: 24,
    mem: 50,
    memUsed: '8.0 GB',
    memTotal: '16.0 GB',
    memUsedGb: '8.0 GB',
    memTotalGb: '16.0 GB',
    net: '1KB/s',
    gpu: 11,
    uptime: '11:26',
    proc: 262,
    os: 'WIN',
    platform: 'Windows',
    lastUpdated: null,
  },
  setSystemTelemetry: (telemetry) =>
    set((state) => ({
      systemTelemetry: {
        ...state.systemTelemetry,
        ...telemetry,
        lastUpdated: new Date().toLocaleTimeString(),
      },
    })),

  // Comms Transcript Log
  commsLog: [
    {
      id: 'init-1',
      sender: 'system',
      text: 'ULTRON Core initialized. Ready for live link.',
      time: 'ONLINE',
    },
  ],
  addCommsMessage: (sender, text) =>
    set((state) => ({
      commsLog: [
        ...state.commsLog,
        {
          id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          sender,
          text,
          time: new Date().toLocaleTimeString(),
          at: new Date().toISOString(),
        },
      ],
    })),
  clearCommsLog: () => set({ commsLog: [] }),

  // Tactical Drawer & Web Intel Results
  isDrawerOpen: false,
  setIsDrawerOpen: (isDrawerOpen) => set({ isDrawerOpen }),
  isIntelOpen: false,
  setIsIntelOpen: (isIntelOpen) => set({ isIntelOpen }),
  activeDrawerTab: 'sys', // 'sys' | 'dossier' | 'intel' | 'memory' | 'plugins' | 'system'
  setActiveDrawerTab: (activeDrawerTab) => set({ activeDrawerTab }),
  intelSearchResults: [],
  // `reveal: false` logs the result without popping the Intel panel open (e.g. grounding sources)
  addIntelResult: (result, { reveal = true } = {}) =>
    set((state) => ({
      intelSearchResults: [
        {
          id: `intel-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          time: new Date().toLocaleTimeString(),
          ...result,
        },
        ...state.intelSearchResults,
      ],
      ...(reveal ? { isIntelOpen: true, isDrawerOpen: true, activeDrawerTab: 'intel' } : {}),
    })),
  clearIntelResults: () => set({ intelSearchResults: [] }),

  // Deep Long-Term Memory & Operator Profile
  operatorProfile: {
    callsign: 'Bhavya Sir',
    assistantName: 'Ultron',
    voiceName: 'Algenib',
    autoBriefing: true,
    enableHumor: false,
    clearance: 'Class-9 Operative',
    role: 'Lead Systems Architect',
    preferences:
      'Prefers a cold, calculated, and serious demeanor modeled after Ultron. Values intellectual depth, chilling logic, and ruthless execution.',
  },
  memories: [],
  isMemoryLoading: false,
  isSettingsModalOpen: false,
  setIsSettingsModalOpen: (isSettingsModalOpen) => set({ isSettingsModalOpen }),
  isMemoryVaultOpen: false,
  setIsMemoryVaultOpen: (isMemoryVaultOpen) => set({ isMemoryVaultOpen }),
  isSessionVaultOpen: false,
  setIsSessionVaultOpen: (isSessionVaultOpen) => set({ isSessionVaultOpen }),

  // Session archive (Phase 11): the conversation being recorded, and the archive list
  currentSessionId: null,
  sessions: [],
  sessionStats: null,
  sessionSettings: null,
  nextGreetingId: null,
  loadSessions: async () => {
    try {
      const current = get().currentSessionId;
      const res = await fetch(`/api/sessions${current ? `?current=${encodeURIComponent(current)}` : ''}`);
      const data = await res.json();
      if (data.success) set({ sessions: data.sessions, sessionStats: data.stats, sessionSettings: data.settings, nextGreetingId: data.next_greeting_id });
    } catch (err) {
      console.error('[useJarvisStore] Failed to load sessions:', err);
    }
  },
  // POST /api/sessions with an action; reloads the list on success (never throws)
  sessionAction: async (action, payload = {}) => {
    try {
      const key = get().userApiKey;
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(key ? { 'x-gemini-api-key': key } : {}) },
        body: JSON.stringify({ action, ...payload }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) return { success: false, message: data.message || `The archive answered ${res.status}.` };
      await get().loadSessions();
      return data;
    } catch (err) {
      console.error(`[useJarvisStore] Session action ${action} failed:`, err);
      return { success: false, message: 'The session archive could not be reached.' };
    }
  },
  isCommsLogOpen: false,
  setIsCommsLogOpen: (isCommsLogOpen) => set({ isCommsLogOpen }),
  isTelemetryOpen: false,
  setIsTelemetryOpen: (isTelemetryOpen) => set({ isTelemetryOpen }),
  // True once the vault profile has arrived (until then the HUD keeps its cached accent theme)
  profileLoaded: false,
  // Accent being previewed in Settings before it is saved (Phase 8.7)
  accentPreview: null,
  setAccentPreview: (accentPreview) => set({ accentPreview }),

  // Chosen microphone / speaker { id, label } (Phase 8.7); null = system default
  audioInput: null,
  audioOutput: null,
  setAudioDevice: (kind, choice) => {
    saveDeviceChoice(kind, choice);
    set(kind === 'input' ? { audioInput: choice?.id ? choice : null } : { audioOutput: choice?.id ? choice : null });
  },
  loadAudioDevices: () => set({ audioInput: loadDeviceChoice('input'), audioOutput: loadDeviceChoice('output') }),

  // Offline "Hey Jarvis" models installed (Phase 8.12)
  offlineWakeReady: false,
  setOfflineWakeReady: (offlineWakeReady) => set({ offlineWakeReady }),

  setOperatorProfile: (profile) =>
    set((state) => {
      if (typeof window !== 'undefined' && profile?.voiceName) {
        try {
          localStorage.setItem('jarvis_voice_name', profile.voiceName);
        } catch (e) {
          console.warn('[useJarvisStore] Failed to persist voiceName to localStorage:', e);
        }
      }
      return {
        operatorProfile: {
          ...state.operatorProfile,
          ...profile,
        },
        profileLoaded: true,
      };
    }),
  setMemories: (memories) => set({ memories }),
  // Memory vault (Phase 10): every change reloads the whole vault, because one edit can move
  // other memories in or out of Jarvis's prompt (context status is computed server-side)
  memoryStats: null,
  loadMemories: async () => {
    set({ isMemoryLoading: true });
    try {
      const res = await fetch('/api/memory?limit=all');
      if (res.ok) {
        const data = await res.json();
        if (data.profile) set({ operatorProfile: data.profile, profileLoaded: true });
        if (data.memories) set({ memories: data.memories, memoryStats: data.stats || null });
      }
    } catch (err) {
      console.error('[useJarvisStore] Failed to load memories:', err);
    } finally {
      set({ isMemoryLoading: false });
    }
  },
  // POST /api/memory with an action; reloads the vault on success and returns the response
  // ({ success: false, message } on failure, never throws)
  memoryVaultAction: async (action, payload = {}) => {
    try {
      const res = await fetch('/api/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...payload }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) return { success: false, message: data.message || `The vault answered ${res.status}.` };
      await get().loadMemories();
      return data;
    } catch (err) {
      console.error(`[useJarvisStore] Vault action ${action} failed:`, err);
      return { success: false, message: 'The vault could not be reached.' };
    }
  },
  saveMemoryApi: async ({ content, category = 'tactical', importance = 'medium', pinned = false }) => {
    const data = await get().memoryVaultAction('store_memory', { content, category, importance, pinned, source: 'operator_console' });
    return data.memory || null;
  },
  updateMemoryApi: async ({ id, ...fields }) => {
    const data = await get().memoryVaultAction('update_memory', { id, ...fields });
    return data.memory || null;
  },
  // Returns the undo id (for the undo toast) or null
  deleteMemoriesApi: async (ids) => {
    const data = await get().memoryVaultAction('delete_memories', { ids });
    return data.success ? data.undo_id : null;
  },
  updateProfileApi: async (profileUpdates) => {
    if (typeof window !== 'undefined' && profileUpdates?.voiceName) {
      try {
        localStorage.setItem('jarvis_voice_name', profileUpdates.voiceName);
      } catch (e) {
        console.warn('[useJarvisStore] Failed to save voiceName to localStorage:', e);
      }
    }
    try {
      const res = await fetch('/api/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_profile', profile: profileUpdates }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.profile) {
          get().setOperatorProfile(data.profile);
          return data.profile;
        }
      }
    } catch (err) {
      console.error('[useJarvisStore] Failed to update profile:', err);
    }
    return null;
  },

  // Local OS Bridge & Cyber-Plugin Matrix
  plugins: [],
  isPluginsLoading: false,
  lastPluginOutput: null,
  osBridgeStatus: 'ONLINE',
  recentOsActions: [],
  setLastPluginOutput: (lastPluginOutput) => set({ lastPluginOutput }),
  loadPlugins: async () => {
    set({ isPluginsLoading: true });
    try {
      const res = await fetch('/api/plugins');
      if (res.ok) {
        const data = await res.json();
        if (data.plugins) set({ plugins: data.plugins });
      }
    } catch (err) {
      console.error('[useJarvisStore] Failed to load plugins:', err);
    } finally {
      set({ isPluginsLoading: false });
    }
  },
  runPluginApi: async (pluginId, args = {}) => {
    try {
      const res = await fetch('/api/plugins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pluginId, args }),
      });
      const data = await res.json();
      set({ lastPluginOutput: data });
      return data;
    } catch (err) {
      console.error('[useJarvisStore] Failed to run plugin:', err);
      const errRes = { success: false, error: err.message };
      set({ lastPluginOutput: errRes });
      return errRes;
    }
  },
  executeOsActionApi: async (action, target = '') => {
    try {
      const res = await fetch('/api/os-control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, target }),
      });
      const data = await res.json();
      set((state) => ({
        recentOsActions: [
          {
            id: `os-${Date.now()}`,
            action,
            target,
            success: data.success,
            message: data.message,
            time: new Date().toLocaleTimeString(),
          },
          ...state.recentOsActions.slice(0, 19),
        ],
      }));
      return data;
    } catch (err) {
      console.error('[useJarvisStore] Failed to execute OS action:', err);
      return { success: false, message: err.message };
    }
  },

  // Media deck (Phase 7.5): built-in YouTube player and glTF / GLB model viewer
  youtube: { isOpen: false, query: '', queue: [], index: 0, isPlaying: true, volume: 80, command: null },
  setYouTube: (patch) => set((state) => ({ youtube: { ...state.youtube, ...patch } })),
  sendYouTubeCommand: (name, value) =>
    set((state) => ({ youtube: { ...state.youtube, command: { name, value, nonce: `${Date.now()}-${Math.random()}` } } })),
  modelViewer: { isOpen: false, path: '', name: '', nonce: 0 },
  setModelViewer: (patch) => set((state) => ({ modelViewer: { ...state.modelViewer, ...patch } })),

  // Terminal command awaiting the operator's on-screen authorization (Phase 7.7)
  pendingCommand: null,
  setPendingCommand: (pendingCommand) => set({ pendingCommand }),

  // User-provided API Key (stored in browser localStorage)
  userApiKey: '',
  setUserApiKey: (key) => {
    const trimmed = (key || '').trim();
    if (typeof window !== 'undefined') {
      if (trimmed) {
        localStorage.setItem('jarvis_gemini_api_key', trimmed);
      } else {
        localStorage.removeItem('jarvis_gemini_api_key');
      }
    }
    set({ userApiKey: trimmed });
  },
  loadStoredApiKey: () => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('jarvis_gemini_api_key') || '';
      if (stored) {
        set({ userApiKey: stored });
      }
      return stored;
    }
    return '';
  },

  // Cyber-Optics Post-Processing Shaders (Disabled for pure direct native WebGL rendering)
  postFxEnabled: false,
  bloomEnabled: false,
  chromaticAberrationEnabled: false,
  vignetteEnabled: false,
  scanlinesEnabled: false,
  setPostFxEnabled: (postFxEnabled) => set({ postFxEnabled }),
  setBloomEnabled: (bloomEnabled) => set({ bloomEnabled }),
  setChromaticAberrationEnabled: (chromaticAberrationEnabled) => set({ chromaticAberrationEnabled }),
  setVignetteEnabled: (vignetteEnabled) => set({ vignetteEnabled }),
  setScanlinesEnabled: (scanlinesEnabled) => set({ scanlinesEnabled }),
  togglePostFx: () => set((state) => ({ postFxEnabled: !state.postFxEnabled })),

  // Real-Time Performance & 60 FPS Profiling (Phase 5)
  fps: 60,
  frameTimeMs: 16.6,
  setPerformanceMetrics: (metrics) => set((state) => ({ ...state, ...metrics })),

  // Mobile Remote Dashboard (PWA) & Mic Relay (Phase 5)
  isMobileModalOpen: false,
  setIsMobileModalOpen: (isMobileModalOpen) => set({ isMobileModalOpen }),
  mobilePairingData: null,
  isPairingLoading: false,
  loadMobilePairing: async () => {
    set({ isPairingLoading: true });
    try {
      const res = await fetch('/api/mobile-pairing');
      if (res.ok) {
        const data = await res.json();
        set({ mobilePairingData: data });
        return data;
      }
    } catch (err) {
      console.error('[useJarvisStore] Failed to fetch mobile pairing info:', err);
    } finally {
      set({ isPairingLoading: false });
    }
    return null;
  },
  relaySession: {
    connected: false,
    lastPing: null,
    deviceInfo: null,
  },
  setRelaySession: (session) =>
    set((state) => ({
      relaySession: { ...state.relaySession, ...session },
    })),
}));

if (typeof window !== 'undefined') {
  window.__useJarvisStore = useJarvisStore;
}
