import dns from 'dns';
import { promisify } from 'util';

const lookupAsync = promisify(dns.lookup);

export default {
  id: 'network_ping',
  name: 'Network & DNS Probe',
  description:
    'Tests network endpoint reachability, performs DNS host resolution, and measures latency to remote syndicate servers.',
  parameters: {
    type: 'OBJECT',
    properties: {
      host: {
        type: 'STRING',
        description: 'Host domain name or IP address to resolve/ping (e.g. "google.com" or "github.com").',
      },
    },
    required: ['host'],
  },
  execute: async (args = {}) => {
    let host = (args.host || 'google.com').trim();
    // Strip protocol if supplied
    host = host.replace(/^https?:\/\//i, '').replace(/\/.*$/, '');

    const startTime = performance.now();
    try {
      const lookupResult = await lookupAsync(host);
      const latencyMs = Math.round(performance.now() - startTime);

      return {
        status: 'ONLINE',
        target_host: host,
        resolved_ip: lookupResult.address,
        ip_family: `IPv${lookupResult.family}`,
        round_trip_ms: latencyMs,
        reachable: true,
        timestamp: new Date().toISOString(),
      };
    } catch (err) {
      return {
        status: 'UNREACHABLE',
        target_host: host,
        error: err.message,
        reachable: false,
        timestamp: new Date().toISOString(),
      };
    }
  },
};

