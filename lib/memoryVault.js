import fs from 'fs';
import path from 'path';

/**
 * Shared access to the knowledge vault file (data/memories.json) for server code outside the
 * memory route. JARVIS_MEMORY_FILE relocates it (used by automated checks).
 */

export const MEMORY_FILE_PATH = path.resolve(
  /*turbopackIgnore: true*/ process.env.JARVIS_MEMORY_FILE || path.join(process.cwd(), 'data', 'memories.json')
);

export function readVault() {
  try {
    return JSON.parse(fs.readFileSync(MEMORY_FILE_PATH, 'utf-8'));
  } catch {
    return { profile: {}, memories: [] };
  }
}

/**
 * Merges fields into the operator profile and saves the vault.
 */
export function updateVaultProfile(fields) {
  const data = readVault();
  data.profile = { ...(data.profile || {}), ...fields };
  fs.mkdirSync(path.dirname(MEMORY_FILE_PATH), { recursive: true });
  fs.writeFileSync(MEMORY_FILE_PATH, JSON.stringify(data, null, 2), 'utf-8');
  return data.profile;
}
