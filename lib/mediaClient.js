import { useJarvisStore } from '@/lib/store';

/**
 * Client-side helpers for the HUD media deck (Phase 7.5), shared by the voice tools,
 * the upload pipeline, and the panels themselves.
 */

/**
 * Path-style URL for a sandbox model file ("~/..." or absolute) so relative buffer and
 * texture references inside a .gltf resolve against the same route.
 */
export function modelFileUrl(filePath) {
  const normalized = String(filePath || '').replace(/\\/g, '/');
  const segments = normalized.replace(/^\/+/, '').split('/').filter(Boolean).map(encodeURIComponent);
  return `/api/model-file/${segments.join('/')}`;
}

export function openModelViewer(filePath, name) {
  const normalized = String(filePath || '').replace(/\\/g, '/');
  useJarvisStore.getState().setModelViewer({
    isOpen: true,
    path: filePath,
    name: name || normalized.split('/').pop(),
    nonce: Date.now(),
  });
}

/**
 * Searches YouTube and starts the first result in the HUD player.
 * Returns { video, queue } or { video: null, message } when nothing playable was found.
 */
export async function playYouTubeQuery(query) {
  const res = await fetch(`/api/youtube?q=${encodeURIComponent(query)}`);
  const data = await res.json();
  if (!data.videos?.length) {
    return { video: null, message: data.message || `No YouTube videos found for "${query}".` };
  }
  useJarvisStore.getState().setYouTube({ isOpen: true, query, queue: data.videos, index: 0, isPlaying: true });
  return { video: data.videos[0], queue: data.videos };
}
