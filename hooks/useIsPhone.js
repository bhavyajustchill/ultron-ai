'use client';

import { useSyncExternalStore } from 'react';

// Narrower than Tailwind's `sm` breakpoint (40rem = 640px): the width where the HUD switches to its
// phone layout (Phase 13). Keep in step with the `max-sm:` classes in app/page.jsx.
export const PHONE_MEDIA_QUERY = '(max-width: 639.98px)';

const subscribe = (onChange) => {
  const media = window.matchMedia(PHONE_MEDIA_QUERY);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
};

const getSnapshot = () => window.matchMedia(PHONE_MEDIA_QUERY).matches;

const getServerSnapshot = () => false;

/**
 * True while the viewport is phone-sized; re-renders when it crosses the breakpoint (for example
 * when a phone rotates). Always false while rendering on the server.
 */
export function useIsPhone() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
