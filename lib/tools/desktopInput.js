import { postJson } from '@/lib/tools/http';

/**
 * Live tool `desktop_input`: Keyboard, mouse, and window control.
 */
export default {
  declaration: {
    name: 'desktop_input',
    description: 'Controls the keyboard, mouse, and windows: type_text, press_keys (e.g. "ctrl+c", "alt+tab", "enter"), click (optionally at x, y; right / middle / double), move_mouse (x, y), scroll (up / down), list_windows, focus_window, minimize_window, maximize_window, and status (what is available and the setup steps if something is missing).',
    parameters: {
      type: 'OBJECT',
      properties: {
        action: {
          type: 'STRING',
          description: 'Desktop action.',
          enum: [
            'status',
            'type_text',
            'press_keys',
            'click',
            'move_mouse',
            'scroll',
            'list_windows',
            'focus_window',
            'minimize_window',
            'maximize_window',
          ],
        },
        text: {
          type: 'STRING',
          description: 'type_text: the text to type into the focused window.',
        },
        keys: {
          type: 'STRING',
          description: 'press_keys: key combination such as "ctrl+shift+t" or "enter".',
        },
        button: {
          type: 'STRING',
          description: 'click: left (default), right, or middle.',
          enum: ['left', 'right', 'middle'],
        },
        double: {
          type: 'BOOLEAN',
          description: 'click: double-click.',
        },
        x: {
          type: 'NUMBER',
          description: 'click / move_mouse: screen x coordinate in pixels.',
        },
        y: {
          type: 'NUMBER',
          description: 'click / move_mouse: screen y coordinate in pixels.',
        },
        direction: {
          type: 'STRING',
          description: 'scroll: up or down.',
          enum: ['up', 'down'],
        },
        amount: {
          type: 'NUMBER',
          description: 'scroll: number of wheel steps (default 3).',
        },
        window: {
          type: 'STRING',
          description: 'focus / minimize / maximize: window title, app name, or id from list_windows.',
        },
      },
      required: ['action'],
    },
  },

  async run(args, ctx) {
    const { action, ...params } = args;
    let result = { success: false, message: 'Failed to contact the desktop control bridge.' };
    try {
      result = await postJson('/api/input', { action, ...params });
    } catch (err) {
      console.error('[tools/desktop_input] Desktop input error:', err);
    }
    ctx.log(`[DESKTOP] ${(action || '').toUpperCase()}: ${result.message}`);
    return result;
  },
};
