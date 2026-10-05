import { finishWithApproval } from '@/lib/tools/desktopApproval';
import { postJson } from '@/lib/tools/http';

/**
 * Live tool `desktop_input`: keyboard, mouse, and windows on Windows and Linux (Phase 7.7 / 15).
 */
export default {
  declaration: {
    name: 'desktop_input',
    description:
      'Controls the keyboard, mouse, and windows on Windows and Linux. type_text and press_keys (e.g. "ctrl+s", "alt+tab", "enter") go to the app named in `app`, which is brought to the front first and checked (without `app`: only the app Ultron is working in, the one it last opened, focused, or typed into; otherwise the result asks which app). click (optionally at x, y; right / middle / double), move_mouse, scroll; list_windows, active_window (what is in front and whether the cursor is in a text field), focus_window, minimize_window, maximize_window, restore_window, close_window (the app may ask to save); status (what is available and setup steps).',
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
            'active_window',
            'focus_window',
            'minimize_window',
            'maximize_window',
            'restore_window',
            'close_window',
          ],
        },
        app: {
          type: 'STRING',
          description: 'type_text / press_keys: the app to type into, as the operator named it ("Notepad", "Word", "Chrome"). Brought to the front first if it is not there.',
        },
        text: {
          type: 'STRING',
          description: 'type_text: the text to type.',
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
          description: 'focus / minimize / maximize / restore / close: window title, app name, or id from list_windows.',
        },
      },
      required: ['action'],
    },
  },

  async run(args, ctx) {
    const { action, ...params } = args;
    let result = { success: false, message: 'Failed to contact the desktop control bridge.' };
    try {
      result = await postJson('/api/input', { action, ...params, hud_title: document.title });
      if (result.needs_confirmation) result = await finishWithApproval(result, ctx, 'DESKTOP');
    } catch (err) {
      console.error('[tools/desktop_input] Desktop input error:', err);
    }
    ctx.log(`[DESKTOP] ${(action || '').toUpperCase()}: ${result.message}`);
    return result;
  },
};
