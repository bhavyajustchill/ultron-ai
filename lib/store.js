import { create } from 'zustand';

/**
 * Global Zustand store for Project A.D.A
 * Keeps real-time HUD telemetry, comms transcript, audio metrics, and API credentials in sync.
 */
export const useAdaStore = create((set, get) => ({
  // Live session status
  status: 'DISCONNECTED', // DISCONNECTED | CONNECTING | CONNECTED | LISTENING | THINKING | SPEAKING
  setStatus: (status) => set({ status }),

  // Audio stream state
  isMuted: false,
  setIsMuted: (isMuted) =>
    set((state) => {
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem('ada_mic_muted', String(isMuted));
        } catch (e) {
          console.warn('[useAdaStore] Failed to save mic mute state to localStorage:', e);
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
          localStorage.setItem('ada_mic_muted', String(nextMuted));
        } catch (e) {
          console.warn('[useAdaStore] Failed to save mic mute state to localStorage:', e);
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
        const stored = localStorage.getItem('ada_mic_muted');
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
        console.warn('[useAdaStore] Failed to load mic mute state from localStorage:', e);
      }
    }
    return false;
  },

  // Vocal Core LocalStorage Persistence & Dynamic Session Reconnect Trigger
  reconnectSession: null,
  setReconnectSession: (reconnectSession) => set({ reconnectSession }),
  loadStoredVoiceName: () => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('jarvis_voice_name') || localStorage.getItem('ada_voice_name');
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
        console.warn('[useAdaStore] Failed to load voice from localStorage:', e);
      }
    }
    return 'Charon';
  },
  saveStoredVoiceName: (voiceName) => {
    if (typeof window !== 'undefined' && voiceName) {
      try {
        localStorage.setItem('jarvis_voice_name', voiceName);
        localStorage.setItem('ada_voice_name', voiceName);
      } catch (e) {
        console.warn('[useAdaStore] Failed to save voice to localStorage:', e);
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
        localStorage.setItem('ada_viewport_mode', viewportMode);
      } catch { }
    }
    set({ viewportMode });
  },
  loadStoredViewportMode: () => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('ada_viewport_mode');
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
      text: 'J.A.R.V.I.S Core initialized. Ready for live link.',
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
  addIntelResult: (result) =>
    set((state) => ({
      intelSearchResults: [
        {
          id: `intel-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          time: new Date().toLocaleTimeString(),
          ...result,
        },
        ...state.intelSearchResults,
      ],
      isIntelOpen: true,
      isDrawerOpen: true,
      activeDrawerTab: 'intel',
    })),
  clearIntelResults: () => set({ intelSearchResults: [] }),

  // Deep Long-Term Memory & Operator Profile
  operatorProfile: {
    callsign: 'Bhavya Sir',
    assistantName: 'Jarvis',
    voiceName: 'Charon',
    autoBriefing: true,
    enableHumor: true,
    clearance: 'Class-9 Operative',
    role: 'Lead Systems Architect',
    preferences:
      'Prefers concise, authoritative tactical briefings, high-speed execution, dry British wit, and playful daily humor.',
  },
  memories: [],
  isMemoryLoading: false,
  selectedMemoryModal: null,
  setSelectedMemoryModal: (selectedMemoryModal) => set({ selectedMemoryModal }),
  isSettingsModalOpen: false,
  setIsSettingsModalOpen: (isSettingsModalOpen) => set({ isSettingsModalOpen }),
  isMemoryVaultOpen: false,
  setIsMemoryVaultOpen: (isMemoryVaultOpen) => set({ isMemoryVaultOpen }),
  isCommsLogOpen: false,
  setIsCommsLogOpen: (isCommsLogOpen) => set({ isCommsLogOpen }),
  isTelemetryOpen: false,
  setIsTelemetryOpen: (isTelemetryOpen) => set({ isTelemetryOpen }),
  setOperatorProfile: (profile) =>
    set((state) => {
      if (typeof window !== 'undefined' && profile?.voiceName) {
        try {
          localStorage.setItem('ada_voice_name', profile.voiceName);
        } catch (e) {
          console.warn('[useAdaStore] Failed to persist voiceName to localStorage:', e);
        }
      }
      return {
        operatorProfile: {
          ...state.operatorProfile,
          ...profile,
        },
      };
    }),
  setMemories: (memories) => set({ memories }),
  addMemory: (memory) =>
    set((state) => ({
      memories: [memory, ...state.memories.filter((m) => m.id !== memory.id)],
    })),
  updateMemory: (memory) =>
    set((state) => ({
      memories: state.memories.map((m) => (m.id === memory.id ? { ...m, ...memory } : m)),
      selectedMemoryModal:
        state.selectedMemoryModal?.id === memory.id
          ? { ...state.selectedMemoryModal, ...memory }
          : state.selectedMemoryModal,
    })),
  removeMemory: (id) =>
    set((state) => ({
      memories: state.memories.filter((m) => m.id !== id),
      selectedMemoryModal:
        state.selectedMemoryModal?.id === id ? null : state.selectedMemoryModal,
    })),
  loadMemories: async () => {
    set({ isMemoryLoading: true });
    try {
      const res = await fetch('/api/memory');
      if (res.ok) {
        const data = await res.json();
        if (data.profile) set({ operatorProfile: data.profile });
        if (data.memories) set({ memories: data.memories });
      }
    } catch (err) {
      console.error('[useAdaStore] Failed to load memories:', err);
    } finally {
      set({ isMemoryLoading: false });
    }
  },
  saveMemoryApi: async ({ content, category = 'tactical', importance = 'medium' }) => {
    try {
      const res = await fetch('/api/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, category, importance }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.memory) {
          get().addMemory(data.memory);
          return data.memory;
        }
      }
    } catch (err) {
      console.error('[useAdaStore] Failed to save memory:', err);
    }
    return null;
  },
  updateMemoryApi: async ({ id, content, category, importance }) => {
    try {
      const res = await fetch('/api/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_memory', id, content, category, importance }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.memory) {
          get().updateMemory(data.memory);
          return data.memory;
        }
      }
    } catch (err) {
      console.error('[useAdaStore] Failed to update memory:', err);
    }
    return null;
  },
  deleteMemoryApi: async (id) => {
    try {
      const res = await fetch(`/api/memory?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        get().removeMemory(id);
        return true;
      }
    } catch (err) {
      console.error('[useAdaStore] Failed to delete memory:', err);
    }
    return false;
  },
  updateProfileApi: async (profileUpdates) => {
    if (typeof window !== 'undefined' && profileUpdates?.voiceName) {
      try {
        localStorage.setItem('ada_voice_name', profileUpdates.voiceName);
      } catch (e) {
        console.warn('[useAdaStore] Failed to save voiceName to localStorage:', e);
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
      console.error('[useAdaStore] Failed to update profile:', err);
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
      console.error('[useAdaStore] Failed to load plugins:', err);
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
      console.error('[useAdaStore] Failed to run plugin:', err);
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
      console.error('[useAdaStore] Failed to execute OS action:', err);
      return { success: false, message: err.message };
    }
  },

  // User-provided API Key (stored in browser localStorage)
  userApiKey: '',
  setUserApiKey: (key) => {
    const trimmed = (key || '').trim();
    if (typeof window !== 'undefined') {
      if (trimmed) {
        localStorage.setItem('ada_gemini_api_key', trimmed);
      } else {
        localStorage.removeItem('ada_gemini_api_key');
      }
    }
    set({ userApiKey: trimmed });
  },
  loadStoredApiKey: () => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('ada_gemini_api_key') || '';
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
      console.error('[useAdaStore] Failed to fetch mobile pairing info:', err);
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

export const useJarvisStore = useAdaStore;

if (typeof window !== 'undefined') {
  window.__useAdaStore = useAdaStore;
  window.__useJarvisStore = useAdaStore;
}
