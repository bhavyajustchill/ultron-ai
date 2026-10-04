import { postJson } from '@/lib/tools/http';

/**
 * Live tool `execute_os_action`: Desktop actions: apps, volume, folders, URLs, minimize, lock.
 */
export default {
  declaration: {
    name: 'execute_os_action',
    description: 'Controls host desktop actions across Linux and Windows: adjust system volume (volume_up, volume_down, mute, unmute, set_volume), launch applications (launch_app with the app\'s name: on Linux any installed application such as "Firefox", "Files", "Text Editor", "Blender"; if several match, the result lists candidates so ask the operator which one), search installed apps (list_apps with a name or category like "browser"), open workspace project folders, open target URLs in browser, minimize all desktop windows, or lock the workstation. When confirming volume actions to the user, always vocalize the percentage as a natural whole number phrase in words (e.g. "seventy-five percent", never "seven five percent").',
    parameters: {
      type: 'OBJECT',
      properties: {
        action: {
          type: 'STRING',
          description: 'The desktop action: launch_app, list_apps, volume_up, volume_down, mute, unmute, set_volume, open_folder, open_url, minimize_all, or lock_screen.',
          enum: [
            'launch_app',
            'list_apps',
            'volume_up',
            'volume_down',
            'mute',
            'unmute',
            'set_volume',
            'open_folder',
            'open_url',
            'minimize_all',
            'lock_screen',
          ],
        },
        target: {
          type: 'STRING',
          description: 'Target parameter for the action (e.g. an application name like "Firefox", "VS Code", "Calculator", "Terminal"; an app search term for list_apps; folder path; URL; or volume percentage 0-100).',
        },
      },
      required: ['action'],
    },
  },

  async run(args, ctx) {
    const action = args.action || '';
    const target = args.target || '';
    ctx.log(`[OS COMPANION] Executing desktop action: ${action.toUpperCase()} ${target ? `("${target}")` : ''}...`);

    let result = { success: false, message: 'Failed to contact local OS companion bridge.' };
    try {
      result = await postJson('/api/os-control', { action, target });
    } catch (err) {
      console.error('[tools/execute_os_action] OS control error:', err);
    }
    ctx.log(`[OS COMPANION] ${result.success ? 'Action executed' : 'Action failed'}: ${result.message}`);
    return {
      action,
      target,
      success: result.success,
      result_message: result.message,
      ...(result.candidates ? { candidates: result.candidates } : {}),
      ...(result.apps ? { apps: result.apps } : {}),
    };
  },
};
