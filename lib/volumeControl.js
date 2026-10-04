import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import loudness from 'loudness';

/**
 * Master-volume state helpers shared by /api/os-control and the undo stack (Phase 8.3):
 * read the current level / mute state before a change and put it back on undo.
 */

const execFileAsync = promisify(execFile);
const isWindows = process.platform === 'win32';
const isLinux = !isWindows && process.platform !== 'darwin';

/**
 * Direct Windows Core Audio driver via the bundled loudness C++ helper.
 * Resolves physical disk path to avoid Turbopack virtual __dirname ENOENT.
 */
function getWindowsAudioBinaryPath() {
  const candidates = [
    path.join(process.cwd(), 'bin', 'adjust_get_current_system_volume_vista_plus.exe'),
    path.join(process.cwd(), 'node_modules', 'loudness', 'impl', 'windows', 'adjust_get_current_system_volume_vista_plus.exe'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(/*turbopackIgnore: true*/ p)) return p;
  }
  return null;
}

export async function runWindowsAudioBinary(...args) {
  const binPath = getWindowsAudioBinaryPath();
  if (!binPath) throw new Error('Windows Core Audio helper binary not found.');
  const { stdout } = await execFileAsync(binPath, args);
  return (stdout || '').trim();
}

export async function getWindowsAudioVolumeInfo() {
  const data = await runWindowsAudioBinary();
  const parts = data.split(' ');
  return { volume: parseInt(parts[0], 10), muted: Boolean(parseInt(parts[1], 10)) };
}

// PipeWire reports "Volume: 0.45 [MUTED]"
async function getWpctlState() {
  const { stdout } = await execFileAsync('wpctl', ['get-volume', '@DEFAULT_AUDIO_SINK@'], { timeout: 4000 });
  const match = stdout.match(/Volume:\s*([\d.]+)/);
  if (!match) throw new Error(`Unexpected wpctl output: ${stdout.trim()}`);
  return { volume: Math.round(parseFloat(match[1]) * 100), muted: /MUTED/.test(stdout) };
}

/**
 * Returns { volume: 0-100, muted } or null when no mixer can be read.
 */
export async function getVolumeState() {
  try {
    if (isWindows) return await getWindowsAudioVolumeInfo();
    return { volume: await loudness.getVolume(), muted: await loudness.getMuted() };
  } catch {
    if (isLinux) {
      try {
        return await getWpctlState();
      } catch {
        // No readable mixer
      }
    }
    return null;
  }
}

/**
 * Puts a previously read { volume, muted } state back.
 */
export async function restoreVolumeState({ volume, muted }) {
  const level = Math.max(0, Math.min(100, Math.round(volume)));
  if (isWindows) {
    await runWindowsAudioBinary(String(level));
    await runWindowsAudioBinary(muted ? 'mute' : 'unmute');
    return;
  }
  try {
    await loudness.setVolume(level);
    await loudness.setMuted(Boolean(muted));
  } catch (err) {
    if (!isLinux) throw err;
    await execFileAsync('wpctl', ['set-volume', '@DEFAULT_AUDIO_SINK@', (level / 100).toFixed(2)], { timeout: 4000 });
    await execFileAsync('wpctl', ['set-mute', '@DEFAULT_AUDIO_SINK@', muted ? '1' : '0'], { timeout: 4000 });
  }
}
