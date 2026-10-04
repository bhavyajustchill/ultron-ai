import { postJson } from '@/lib/tools/http';

/**
 * Live tool `compose_message` (Phase 8.8): opens WhatsApp / Telegram / email with a message
 * written; the operator presses Send.
 */
export default {
  declaration: {
    name: 'compose_message',
    description: 'Opens WhatsApp, Telegram, or the email client with a message already written for the operator to review and send. It never sends anything itself: always say the message is ready and that they press Send. WhatsApp needs a phone number with country code; Telegram takes a @username (the operator picks the chat); email takes addresses. For people mentioned by name, call recall_memory first to find their number or address; never invent one. Read the message back if the operator asks before opening.',
    parameters: {
      type: 'OBJECT',
      properties: {
        app: {
          type: 'STRING',
          description: 'whatsapp, telegram, or email.',
          enum: ['whatsapp', 'telegram', 'email'],
        },
        to: {
          type: 'STRING',
          description: 'Phone number with country code (WhatsApp), @username (Telegram), or email address(es), comma-separated. Leave empty to let the app ask.',
        },
        text: {
          type: 'STRING',
          description: 'The message (email body), written as the operator would send it.',
        },
        subject: {
          type: 'STRING',
          description: 'Email subject line.',
        },
        client: {
          type: 'STRING',
          description: 'Email only: default (the system mail app) or gmail (Gmail in the browser).',
          enum: ['default', 'gmail'],
        },
      },
      required: ['app', 'text'],
    },
  },

  async run(args, ctx) {
    ctx.log(`[MESSAGE] Composing ${args.app}${args.to ? ` to ${args.to}` : ''}: "${String(args.text || '').slice(0, 120)}"`);
    let result = { success: false, message: 'Failed to contact the message composer.' };
    try {
      result = await postJson('/api/messages', args);
    } catch (err) {
      console.error('[tools/compose_message] Error:', err);
    }
    ctx.log(`[MESSAGE] ${result.message}`);
    return result;
  },
};
