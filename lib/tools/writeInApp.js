import { finishWithApproval } from '@/lib/tools/desktopApproval';
import { postJson } from '@/lib/tools/http';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// How long the launched app gets to take focus from the HUD before typing is called off
const FOCUS_WAIT_MS = 6000;
// Settle time after focus moves, so the app's text field is ready for keys
const SETTLE_MS = 700;

/**
 * Linux without window control only: types into the app the server just launched once it has taken
 * focus from the HUD; if the HUD still has focus, the keystrokes would land here, so nothing is typed.
 */
async function typeWhenInFront(launch, text, hudHadFocus) {
  await sleep(launch.wait_ms ?? 1500);
  if (hudHadFocus) {
    const deadline = Date.now() + FOCUS_WAIT_MS;
    while (document.hasFocus() && Date.now() < deadline) await sleep(250);
    if (document.hasFocus()) {
      return {
        ...launch,
        success: false,
        message: `${launch.app} opened but did not come to the front, so nothing was typed. Click into it and ask again, or have it saved as a note instead.`,
      };
    }
    await sleep(SETTLE_MS);
  }
  const typed = await postJson('/api/input', { action: 'type_text', text });
  return {
    ...launch,
    success: Boolean(typed.success),
    message: typed.success
      ? `Opened ${launch.app} and typed ${text.length} characters${launch.path ? ` into a new note (${launch.path}; unsaved until Ctrl+S)` : ''}.`
      : `Opened ${launch.app}, but typing failed: ${typed.message}`,
  };
}

/**
 * Live tool `write_in_app` (Phase 9.1, typing-first since Phase 15): "open notepad and type hello
 * world", "now in Notepad type hello".
 */
export default {
  declaration: {
    name: 'write_in_app',
    description:
      'Types text into an application on Windows or Linux, e.g. "open notepad and type hello world", "now in Notepad type hello", "type my address in the calculator", "write this in VS Code". If the app is already open its window is used, otherwise it is opened; the window is brought to the front if needed and checked before typing (never the HUD, a password box, or a terminal without the operator\'s click). "Notepad" and "text editor" mean the default text editor. Use method "document" only when the operator wants it saved as a note. For Word, Excel, and PowerPoint prefer the office tool. Use this instead of launch_app plus desktop_input.',
    parameters: {
      type: 'OBJECT',
      properties: {
        app: {
          type: 'STRING',
          description: 'The app as the operator named it: "notepad", "text editor", "calculator", "VS Code", "Chrome"...',
        },
        text: {
          type: 'STRING',
          description: 'Exactly the text to write, worded as the operator dictated it. Use \\n only for new lines or list items they asked for.',
        },
        title: {
          type: 'STRING',
          description: 'Optional short name for a saved note, e.g. "shopping list".',
        },
        method: {
          type: 'STRING',
          description: 'auto (default): type it into the app (a saved note only when typing is impossible in a text editor). type: always keystrokes. document: save it as a note and open it in the text editor.',
          enum: ['auto', 'type', 'document'],
        },
      },
      required: ['app', 'text'],
    },
  },

  async run(args, ctx) {
    const hudHadFocus = document.hasFocus();
    let result = { success: false, message: 'Failed to contact the desktop control bridge.' };
    try {
      result = await postJson('/api/input', { action: 'write_in_app', ...args, hud_title: document.title });
      if (result.needs_confirmation) {
        result = await finishWithApproval(result, ctx, 'WRITE');
      } else if (result.success && result.mode === 'type' && result.wait_ms && !result.dry_run) {
        ctx.log(`[WRITE] ${result.message}`);
        result = await typeWhenInFront(result, args.text, hudHadFocus);
      }
    } catch (err) {
      console.error('[tools/write_in_app] Write error:', err);
    }
    ctx.log(`[WRITE] ${result.message}`);
    return result;
  },
};
