'use client';

/**
 * PostFX — Disabled to enforce pure direct WebGL rendering.
 * Prevents any full-screen shader passes, chromatic aberration distortion, or GPU fill-rate lag.
 */
export function PostFX() {
  return null;
}

export default PostFX;
