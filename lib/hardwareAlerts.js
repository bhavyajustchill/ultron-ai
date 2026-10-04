import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * Hardware voice alerts (Phase 8.6): real sensor readings (not the HUD's display telemetry) checked
 * against thresholds, with per-kind cooldowns and short streaks so one spike does not raise an
 * alarm. CPU temperature and battery come from Linux sysfs; RAM and CPU load work everywhere.
 *
 * Test overrides: JARVIS_SYSFS_ROOT (stands in for /sys), JARVIS_PROC_ROOT (for /proc).
 */

const SYS = process.env.JARVIS_SYSFS_ROOT || '/sys';
const PROC = process.env.JARVIS_PROC_ROOT || '/proc';

export const THRESHOLDS = { tempC: 85, ramPercent: 92, cpuPercent: 90, batteryPercent: 15 };
const STREAK_NEEDED = { temp: 2, cpu: 3, ram: 1, battery: 1 };
const COOLDOWN_MS = Number(process.env.JARVIS_ALERT_COOLDOWN_MS ?? 10 * 60 * 1000);
const CPU_SENSOR_NAMES = ['coretemp', 'k10temp', 'zenpower', 'cpu_thermal', 'cpu-thermal'];
const CPU_ZONE_TYPES = ['x86_pkg_temp', 'TCPU', 'cpu-thermal', 'cpu_thermal', 'soc_thermal'];

// Route handlers are bundled separately; keep streaks / cooldowns / CPU samples shared
const state = globalThis.__jarvisHardwareAlerts || (globalThis.__jarvisHardwareAlerts = { streak: {}, lastAlert: {}, cpuSample: null });

const sysPath = (...parts) => path.join(/*turbopackIgnore: true*/ SYS, ...parts);

function readText(file) {
  try {
    return fs.readFileSync(/*turbopackIgnore: true*/ file, 'utf-8').trim();
  } catch {
    return null;
  }
}

/**
 * CPU package temperature in °C, or null when no sensor is exposed (e.g. Windows / macOS).
 */
export function readCpuTempC() {
  const hwmonRoot = sysPath('class', 'hwmon');
  let hwmons = [];
  try {
    hwmons = fs.readdirSync(/*turbopackIgnore: true*/ hwmonRoot);
  } catch {
    // No hwmon tree
  }
  for (const hwmon of hwmons) {
    const dir = path.join(/*turbopackIgnore: true*/ hwmonRoot, hwmon);
    if (!CPU_SENSOR_NAMES.includes(readText(path.join(dir, 'name')))) continue;
    const inputs = fs.readdirSync(/*turbopackIgnore: true*/ dir).filter((f) => /^temp\d+_input$/.test(f));
    // Prefer the package / Tctl reading; otherwise the hottest core
    const labelled = inputs.find((f) => /package|tctl|tdie/i.test(readText(path.join(dir, f.replace('_input', '_label'))) || ''));
    const values = (labelled ? [labelled] : inputs).map((f) => Number(readText(path.join(dir, f)))).filter(Number.isFinite);
    if (values.length) return Math.max(...values) / 1000;
  }
  const zoneRoot = sysPath('class', 'thermal');
  let zones = [];
  try {
    zones = fs.readdirSync(/*turbopackIgnore: true*/ zoneRoot).filter((z) => z.startsWith('thermal_zone'));
  } catch {
    // No thermal zones
  }
  for (const zone of zones) {
    if (!CPU_ZONE_TYPES.includes(readText(path.join(zoneRoot, zone, 'type')))) continue;
    const value = Number(readText(path.join(zoneRoot, zone, 'temp')));
    if (Number.isFinite(value) && value > 0) return value / 1000;
  }
  return null;
}

/**
 * RAM in use as a percentage, counting reclaimable page cache as free (MemAvailable).
 */
export function readRamPercent() {
  const meminfo = readText(path.join(/*turbopackIgnore: true*/ PROC, 'meminfo'));
  const total = Number(meminfo?.match(/^MemTotal:\s+(\d+)/m)?.[1]);
  const available = Number(meminfo?.match(/^MemAvailable:\s+(\d+)/m)?.[1]);
  if (total > 0 && Number.isFinite(available)) return Math.round(((total - available) / total) * 100);
  return Math.round(((os.totalmem() - os.freemem()) / os.totalmem()) * 100);
}

/**
 * CPU load since the previous call (null on the first call).
 */
export function readCpuPercent() {
  const totals = os.cpus().reduce(
    (acc, cpu) => {
      const t = cpu.times;
      acc.idle += t.idle;
      acc.total += t.user + t.nice + t.sys + t.idle + t.irq;
      return acc;
    },
    { idle: 0, total: 0 }
  );
  const previous = state.cpuSample;
  state.cpuSample = totals;
  if (!previous || totals.total <= previous.total) return null;
  return Math.round((1 - (totals.idle - previous.idle) / (totals.total - previous.total)) * 100);
}

/**
 * First battery's { percent, discharging }, or null on machines without one.
 */
export function readBattery() {
  const root = sysPath('class', 'power_supply');
  let supplies = [];
  try {
    supplies = fs.readdirSync(/*turbopackIgnore: true*/ root);
  } catch {
    return null;
  }
  for (const supply of supplies) {
    if (readText(path.join(root, supply, 'type')) !== 'Battery') continue;
    const percent = Number(readText(path.join(root, supply, 'capacity')));
    if (!Number.isFinite(percent)) continue;
    return { percent, discharging: readText(path.join(root, supply, 'status')) === 'Discharging' };
  }
  return null;
}

function evaluate(kind, breached, message, now) {
  state.streak[kind] = breached ? (state.streak[kind] || 0) + 1 : 0;
  if (!breached || state.streak[kind] < STREAK_NEEDED[kind]) return null;
  if (now - (state.lastAlert[kind] || 0) < COOLDOWN_MS) return null;
  state.lastAlert[kind] = now;
  return { kind, message };
}

/**
 * Reads every sensor once and returns { status, alerts }.
 */
export function checkHardware(now = Date.now()) {
  const tempC = readCpuTempC();
  const ramPercent = readRamPercent();
  const cpuPercent = readCpuPercent();
  const battery = readBattery();

  const alerts = [
    evaluate('temp', tempC !== null && tempC >= THRESHOLDS.tempC, `CPU temperature is ${Math.round(tempC)} degrees Celsius, above the ${THRESHOLDS.tempC} degree safe limit.`, now),
    evaluate('ram', ramPercent >= THRESHOLDS.ramPercent, `Memory is ${ramPercent} percent full.`, now),
    evaluate('cpu', cpuPercent !== null && cpuPercent >= THRESHOLDS.cpuPercent, `CPU load has stayed at ${cpuPercent} percent for the last minute.`, now),
    evaluate('battery', Boolean(battery?.discharging) && battery.percent <= THRESHOLDS.batteryPercent, `Battery is down to ${battery?.percent} percent and discharging.`, now),
  ].filter(Boolean);

  return { status: { tempC: tempC === null ? null : Math.round(tempC), ramPercent, cpuPercent, battery }, alerts };
}
