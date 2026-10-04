import { postJson } from '@/lib/tools/http';

/**
 * Shared handler for the file tools (file_operations, create_document, organize_folder),
 * which all go through the sandboxed /api/fs-ops route.
 */
export async function runFileAction(action, args, label, ctx) {
  ctx.log(`[FILE OPS] ${label}${args.path ? ` ("${args.path}")` : ''}...`);
  let result = { success: false, message: 'Failed to contact the local file operations bridge.' };
  try {
    result = await postJson('/api/fs-ops', { ...args, action });
  } catch (err) {
    console.error('[tools/fileActions] File operation error:', err);
  }
  ctx.log(`[FILE OPS] ${result.success ? 'Done' : 'Failed'}: ${result.message}`);
  return result;
}
