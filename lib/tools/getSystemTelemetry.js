import { getJson } from '@/lib/tools/http';

/**
 * Live tool `get_system_telemetry`: Live host metrics (CPU, memory, GPU, network, uptime) for spoken reports.
 */
export default {
  declaration: {
    name: 'get_system_telemetry',
    description: 'Retrieves real-time host operating system resource metrics, including current CPU percentage, RAM memory usage and limits, active processes, uptime, network throughput, and GPU load.',
    parameters: {
      type: 'OBJECT',
      properties: {},
    },
  },

  async run(args, ctx) {
    let stats = ctx.store.getState().systemTelemetry;
    try {
      stats = await getJson('/api/system-telemetry');
      ctx.store.getState().setSystemTelemetry(stats);
    } catch (err) {
      console.warn('[tools/get_system_telemetry] Using cached telemetry:', err);
    }
    ctx.log(
      `[SYS TELEMETRY] Live host metrics relayed to J.A.R.V.I.S: CPU ${stats.cpu}%, MEM ${stats.mem}%, GPU ${stats.gpu}%, UPTIME ${stats.uptime}.`
    );
    return {
      cpu_usage_percent: stats.cpu,
      memory_usage_percent: stats.mem,
      memory_used_gb: stats.memUsedGb,
      memory_total_gb: stats.memTotalGb,
      gpu_usage_percent: stats.gpu,
      network_speed: stats.net,
      active_processes: stats.proc,
      system_uptime: stats.uptime,
      operating_system: stats.os,
      platform_info: stats.platform,
    };
  },
};
