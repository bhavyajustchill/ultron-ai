import systemDiagnostic from '@/plugins/systemDiagnostic';
import cyberCrypto from '@/plugins/cyberCrypto';
import networkPing from '@/plugins/networkPing';
import workspaceNavigator from '@/plugins/workspaceNavigator';

// Registry of active Cyber Plugins
const PLUGINS = [
  systemDiagnostic,
  cyberCrypto,
  networkPing,
  workspaceNavigator,
];

const pluginMap = new Map(PLUGINS.map((p) => [p.id, p]));

/**
 * Returns summary list of all available plugins.
 */
export function getAllPlugins() {
  return PLUGINS.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    parameters: p.parameters || { type: 'OBJECT', properties: {} },
  }));
}

/**
 * Get plugin instance by ID.
 */
export function getPlugin(id) {
  return pluginMap.get(id);
}

/**
 * Execute plugin by ID with arguments and error containment.
 */
export async function executePlugin(id, args = {}) {
  const plugin = pluginMap.get(id);
  if (!plugin) {
    throw new Error(
      `Plugin '${id}' not found. Available plugins: ${Array.from(pluginMap.keys()).join(', ')}`
    );
  }

  const startTime = performance.now();
  try {
    const result = await plugin.execute(args);
    const executionDurationMs = Math.round(performance.now() - startTime);

    return {
      success: true,
      pluginId: id,
      pluginName: plugin.name,
      executionDurationMs,
      output: result,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    const executionDurationMs = Math.round(performance.now() - startTime);
    return {
      success: false,
      pluginId: id,
      pluginName: plugin.name,
      executionDurationMs,
      error: error.message || 'Unknown error during plugin execution',
      timestamp: new Date().toISOString(),
    };
  }
}

