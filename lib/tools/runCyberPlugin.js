import { postJson } from '@/lib/tools/http';

/**
 * Live tool `run_cyber_plugin`: Runs a drop-in cyber plugin from plugins/.
 */
export default {
  declaration: {
    name: 'run_cyber_plugin',
    description: 'Executes a specialized cyber plugin from the Project ULTRON plugin matrix: "system_diagnostic" (deep hardware/network diagnostic), "cyber_crypto" (SHA-256/MD5 hashing or Base64 cipher), "network_ping" (DNS resolution and latency check), or "workspace_navigator" (codebase stats, git branch, file metrics).',
    parameters: {
      type: 'OBJECT',
      properties: {
        plugin_id: {
          type: 'STRING',
          description: 'The unique identifier of the plugin: system_diagnostic, cyber_crypto, network_ping, or workspace_navigator.',
          enum: ['system_diagnostic', 'cyber_crypto', 'network_ping', 'workspace_navigator'],
        },
        args: {
          type: 'OBJECT',
          description: 'Optional arguments object passed to the plugin (e.g. { host: "github.com" }, { operation: "hash", data: "secret" }, or { include_network: true }).',
        },
      },
      required: ['plugin_id'],
    },
  },

  async run(args, ctx) {
    const pluginId = args.plugin_id || '';
    ctx.log(`[CYBER PLUGIN] Dispatching execution signal to plugin: "${pluginId}"...`);

    let result = { success: false, message: 'Failed to execute cyber plugin.' };
    try {
      result = await postJson('/api/plugins', { pluginId, args: args.args || {} });
      ctx.store.getState().setLastPluginOutput?.(result);
    } catch (err) {
      console.error('[tools/run_cyber_plugin] Plugin execution error:', err);
    }
    ctx.log(`[CYBER PLUGIN] Execution complete for "${pluginId}" (${result.executionDurationMs || 0}ms). Output indexed into HUD.`);
    return {
      plugin_id: pluginId,
      success: result.success,
      duration_ms: result.executionDurationMs,
      output: result.output || result.error,
    };
  },
};
