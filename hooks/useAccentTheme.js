import { useEffect, useMemo } from 'react';
import { useJarvisStore } from '@/lib/store';
import { ACCENT_CACHE_KEY, DEFAULT_ACCENT, applyAccentToDocument, makeTint, normalizeHex } from '@/lib/accentTheme';

/**
 * HUD accent theme (Phase 8.7): the Settings preview, else the saved profile accent, else the
 * cached one from the last visit (until the vault profile loads, so the theme does not flash).
 */

function cachedAccent() {
  try {
    return normalizeHex(localStorage.getItem(ACCENT_CACHE_KEY));
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
    // Cache only the saved theme, never an unsaved preview
    applyAccentToDocument(accent, { cache: profileLoaded && !previewing });
  }, [accent, profileLoaded, previewing]);
}
