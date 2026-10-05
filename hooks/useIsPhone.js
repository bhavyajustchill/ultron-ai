'use client';

import { useSyncExternalStore } from 'react';

// Narrower than Tailwind's `sm` breakpoint (40rem = 640px): the width where the HUD switches to its
// phone layout (Phase 13): full-width panels and the orb further back. Keep in step with the
// `max-sm:` classes in app/page.jsx.
export const PHONE_MEDIA_QUERY = '(max-width: 639.98px)';

// Narrower than Tailwind's `lg` breakpoint (64rem = 1024px): the compact layout (Phase 15), where the
// top controls sit in a row above the title, the dock has two rows, and Systems / Comms Log / Task List
// open one at a time. Keep in step with the `max-lg:` classes in app/page.jsx.
export const COMPACT_MEDIA_QUERY = '(max-width: 1023.98px)';

const subscriber = (query) => (onChange) => {
  const media = window.matchMedia(query);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
};

const subscribePhone = subscriber(PHONE_MEDIA_QUERY);
const subscribeCompact = subscriber(COMPACT_MEDIA_QUERY);

const getServerSnapshot = () => false;

/**
 * True while the viewport is phone-sized; re-renders when it crosses the breakpoint (for example
 * when a phone rotates). Always false while rendering on the server.
 */
export function useIsPhone() {
  return useSyncExternalStore(subscribePhone, () => window.matchMedia(PHONE_MEDIA_QUERY).matches, getServerSnapshot);
}

/** True below 1024px, where the HUD uses its compact layout. Always false while rendering on the server. */
export function useIsCompact() {
  return useSyncExternalStore(subscribeCompact, () => window.matchMedia(COMPACT_MEDIA_QUERY).matches, getServerSnapshot);
}
