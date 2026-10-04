import { useEffect, useMemo } from 'react';
import { useJarvisStore } from '@/lib/store';
import { DEFAULT_ACCENT, accentCssVars, makeTint, normalizeHex } from '@/lib/accentTheme';

/**
 * HUD accent theme (Phase 8.7): the Settings preview, else the saved profile accent, else the
 * cached one from the last visit (until the vault profile loads, so the theme does not flash).
 */

const CACHE_KEY = 'jarvis_accent';
const VARS_CACHE_KEY = 'jarvis_accent_vars'; // read by the inline script in app/layout.jsx

function cachedAccent() {
  try {
    return normalizeHex(localStorage.getItem(CACHE_KEY));
  } catch {
    return null;
  }
}

export function useAccentHex() {
  return useJarvisStore((state) => {
    if (state.accentPreview) return normalizeHex(state.accentPreview) || DEFAULT_ACCENT;
    if (!state.profileLoaded) return (typeof window !== 'undefined' && cachedAccent()) || DEFAULT_ACCENT;
    return normalizeHex(state.operatorProfile?.accentColor) || DEFAULT_ACCENT;
  });
}

/**
 * tint(hex) for Three.js / canvas colours designed around the default cyan.
 */
export function useAccentTint() {
  const accent = useAccentHex();
  return useMemo(() => makeTint(accent), [accent]);
}

/**
 * Mount once: keeps the CSS accent variables on :root in step with the theme.
 */
export function useApplyAccentTheme() {
  const accent = useAccentHex();
  const profileLoaded = useJarvisStore((state) => state.profileLoaded);
  const previewing = useJarvisStore((state) => Boolean(state.accentPreview));
  useEffect(() => {
    const vars = accentCssVars(accent);
    for (const [name, value] of Object.entries(vars)) document.documentElement.style.setProperty(name, value);
    // Cache only the saved theme, never an unsaved preview
    if (!profileLoaded || previewing) return;
    try {
      localStorage.setItem(CACHE_KEY, accent);
      localStorage.setItem(VARS_CACHE_KEY, JSON.stringify(vars));
    } catch {
      // Storage blocked: the theme still applies for this visit
    }
  }, [accent, profileLoaded, previewing]);
}
