import { postJson } from '@/lib/tools/http';

/**
 * Live tool `memory_vault` (Phase 10.3): curate long-term memory by voice — forget, correct, pin,
 * find, and summarise. Memories are named by meaning; when several could match, the candidates
 * come back so Jarvis can ask. Forgetting and edits are undoable ("undo").
 */
export default {
  declaration: {
    name: 'memory_vault',
    description:
      'Manages long-term memory: forget a memory ("forget that I like tea"), correct one ("my sister is now in Pune, not Delhi"), pin one so it is always in your context ("always remember my wife\'s birthday"), unpin, find memories with their ids, or status (how many memories, how many in context, what is pinned). Use store_memory for brand-new facts and recall_memory to answer questions.',
    parameters: {
      type: 'OBJECT',
      properties: {
        action: {
          type: 'STRING',
          description: 'What to do.',
          enum: ['forget', 'update', 'pin', 'unpin', 'find', 'status'],
        },
        query: {
          type: 'STRING',
          description: 'forget / update / pin / unpin / find: a description of the memory in natural language (e.g. "favourite drink").',
        },
        id: {
          type: 'STRING',
          description: 'The exact memory id, when an earlier call returned candidates and the operator picked one.',
        },
        content: {
          type: 'STRING',
          description: 'update: the corrected memory, as one complete declarative sentence.',
        },
        category: {
          type: 'STRING',
          description: 'update (optional): tactical, preference, mission, or profile.',
          enum: ['tactical', 'preference', 'mission', 'profile'],
        },
        importance: {
          type: 'STRING',
          description: 'update (optional): low, medium, high, or critical.',
          enum: ['low', 'medium', 'high', 'critical'],
        },
      },
      required: ['action'],
    },
  },

  async run(args, ctx) {
    const { action, ...rest } = args;
    let result = { success: false, message: 'The memory vault could not be reached.' };
    try {
      const key = ctx.apiKey();
      result = await postJson('/api/memory', { action: 'voice', op: action, ...rest }, key ? { 'x-gemini-api-key': key } : {});
    } catch (err) {
      console.error('[tools/memory_vault] Vault error:', err);
    }
    ctx.log(`[DEEP MEMORY] ${(action || '').toUpperCase()}: ${result.message}`);
    if (result.success && ['forget', 'update', 'pin', 'unpin'].includes(action)) {
      ctx.store.getState().loadMemories();
      // Re-link after this turn so the context Jarvis carries matches the vault
      ctx.requestRelink();
    }
    return result;
  },
};
