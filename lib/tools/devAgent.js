import { postJson } from '@/lib/tools/http';

/**
 * Live tool `dev_agent` (Phase 8.11): writes, runs, and self-heals a small project in the background.
 */
export default {
  declaration: {
    name: 'dev_agent',
    description: 'Builds a small working program from a description: writes a multi-file Python or Node.js project in ~/Desktop/JarvisProjects, installs its packages inside the project, and, after the operator authorizes running it on the HUD card, runs it and fixes errors on its own (up to 5 attempts). It works in the background: confirm you have started, and you will get a [DEV AGENT] update when it finishes. For scaffolding a standard app skeleton (React, Next.js, Express, Flutter) use create_project instead.',
    parameters: {
      type: 'OBJECT',
      properties: {
        task: { type: 'STRING', description: 'What the program should do, with any specifics the operator gave (inputs, outputs, format).' },
        language: { type: 'STRING', description: 'python (default) or node.', enum: ['python', 'node'] },
      },
      required: ['task'],
    },
  },

  async run(args, ctx) {
    ctx.log(`[DEV AGENT] Starting (${args.language || 'python'}): "${String(args.task || '').slice(0, 140)}"`);
    let result = { success: false, message: 'Failed to contact the dev agent.' };
    try {
      result = await postJson('/api/dev-agent', { action: 'start', ...args }, { 'x-gemini-api-key': ctx.apiKey() });
    } catch (err) {
      console.error('[tools/dev_agent] Error:', err);
    }
    if (result.success) ctx.watchDevJob(result.job.id);
    else ctx.log(`[DEV AGENT] ${result.message}`);
    return result;
  },
};
