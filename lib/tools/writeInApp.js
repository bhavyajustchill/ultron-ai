import { postJson } from '@/lib/tools/http';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// How long the launched app gets to take focus from the HUD before typing is called off
const FOCUS_WAIT_MS = 6000;
// Settle time after focus moves, so the app's text field is ready for keys
const SETTLE_MS = 700;

/**
 * Types into the app the server just launched, but only once it has taken focus from the HUD:
 * if the HUD still has focus, the keystrokes would land here (or nowhere), so nothing is typed.
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
 * Live tool `write_in_app` (Phase 9.1): "open notepad and type hello world".
 */
export default {
  declaration: {
    name: 'write_in_app',
    description:
      'Opens an application and writes text into it, e.g. "open notepad and type hello world", "write this down in a text editor", "open calculator and type 12*7". "Notepad" and "text editor" mean the default text editor. Text editors get the text as a new note (saved in Documents/Jarvis Notes and opened in the editor, undoable); other apps are opened and typed into with real keystrokes once they are in front. Use this instead of launching the app and calling desktop_input.',
    parameters: {
      type: 'OBJECT',
      properties: {
        app: {
          type: 'STRING',
          description: 'The app as the operator named it: "notepad", "text editor", "gedit", "calculator", "VS Code"...',
        },
        text: {
          type: 'STRING',
          description: 'Exactly the text to write, worded as the operator dictated it. Use \\n only for new lines or list items they asked for.',
        },
        title: {
          type: 'STRING',
          description: 'Optional short name for the saved note (text editors), e.g. "shopping list".',
        },
        method: {
          type: 'STRING',
          description: 'auto (default): a note for text editors, keystrokes for other apps. type: real keystrokes even in an editor (when the operator insists on watching it typed). document: always a saved note.',
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
      result = await postJson('/api/input', { action: 'write_in_app', ...args });
      if (result.success && result.mode === 'type' && !result.dry_run) {
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
