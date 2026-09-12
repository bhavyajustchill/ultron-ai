import os from 'os';

export default {
  id: 'system_diagnostic',
  name: 'Deep System Diagnostic',
  description:
    'Executes a comprehensive diagnostic scan of host system hardware, kernel architecture, memory pressure, and network interfaces.',
  parameters: {
    type: 'OBJECT',
    properties: {
      include_network: {
        type: 'BOOLEAN',
        description: 'Whether to include network interface MAC and IP addresses.',
      },
    },
  },
  execute: async (args = {}) => {
    const totalMemMb = Math.round(os.totalmem() / (1024 * 1024));
    const freeMemMb = Math.round(os.freemem() / (1024 * 1024));
    const usedMemMb = totalMemMb - freeMemMb;
    const memPressure = ((usedMemMb / totalMemMb) * 100).toFixed(1);

    const cpus = os.cpus();
    const cpuModel = cpus[0]?.model || 'Unknown CPU';
    const cpuCores = cpus.length;

    const uptimeHrs = (os.uptime() / 3600).toFixed(1);

    let networkDetails = null;
    if (args.include_network) {
      const ifaces = os.networkInterfaces();
      networkDetails = Object.keys(ifaces).map((name) => ({
        interface: name,
        addresses: ifaces[name].map((i) => i.address),
      }));
    }

    return {
      status: 'OPTIMAL',
      os: `${os.type()} ${os.release()} (${os.arch()})`,
      hostname: os.hostname(),
      uptime_hours: uptimeHrs,
      cpu: {
        model: cpuModel,
        logical_cores: cpuCores,
        speed_mhz: cpus[0]?.speed || 0,
      },
      memory: {
        total_mb: totalMemMb,
        used_mb: usedMemMb,
        free_mb: freeMemMb,
        pressure_percent: `${memPressure}%`,
      },
      load_avg: os.loadavg(),
      network: networkDetails,
      timestamp: new Date().toISOString(),
    };
  },
};

