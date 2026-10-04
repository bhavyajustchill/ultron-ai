import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import { pathToFileURL } from 'url';
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * Desktop system settings for Jarvis (Phase 8.3): dark mode, WiFi, screen brightness, wallpaper,
 * process listing / termination, and power actions. Linux targets GNOME (gsettings, NetworkManager,
 * systemd-logind); Windows and macOS use their built-in tools. Every "set" returns the previous
 * state so callers can record an undo. Commands run through execFile, never a shell.
 *
 * Test overrides: JARVIS_BACKLIGHT_DIR (sysfs backlight root), JARVIS_WALLPAPER_DIR (downloads),
 * JARVIS_POWER_DELAY_MS, and JARVIS_SYSTEM_DRY_RUN=1 (power actions are logged, never executed).
 */

const execFileAsync = promisify(execFile);
const isWindows = process.platform === 'win32';
const isMac = process.platform === 'darwin';
const isLinux = !isWindows && !isMac;

export class SettingsError extends Error {}

async function run(cmd, args, timeout = 8000) {
  try {
    const { stdout } = await execFileAsync(cmd, args, { timeout, windowsHide: true });
    return stdout.trim();
  } catch (err) {
    if (err.code === 'ENOENT') throw new SettingsError(`${cmd} is not available on this system.`);
    const detail = (err.stderr || err.message || '').toString().trim().split('\n')[0];
    throw new SettingsError(`${cmd} failed: ${detail.slice(0, 200)}`);
  }
}

const powershell = (script) => run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], 15000);
const osascript = (script) => run('osascript', ['-e', script]);
const quoteAppleScript = (text) => `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
const quotePowerShell = (text) => `'${text.replace(/'/g, "''")}'`;

async function gsettingsGet(schema, key) {
  return (await run('gsettings', ['get', schema, key])).replace(/^'(.*)'$/, '$1');
}
const gsettingsSet = (schema, key, value) => run('gsettings', ['set', schema, key, value]);

// ── Dark mode ────────────────────────────────────────────────────────────────

const GNOME_INTERFACE = 'org.gnome.desktop.interface';
const WINDOWS_PERSONALIZE = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize';
const THEME_DIRS = ['/usr/share/themes', path.join(os.homedir(), '.themes'), path.join(os.homedir(), '.local', 'share', 'themes')];

/**
 * Legacy GTK3 apps follow the theme name, not color-scheme: switch "Yaru-blue" <-> "Yaru-blue-dark"
 * when the matching variant is installed.
 */
function gtkThemeVariant(theme, dark) {
  if (!theme) return null;
  const base = theme.replace(/-dark$/i, '');
  const wanted = dark ? `${base}-dark` : base;
  if (wanted === theme) return null;
  return THEME_DIRS.some((dir) => fs.existsSync(path.join(/*turbopackIgnore: true*/ dir, wanted))) ? wanted : null;
}

export async function getDarkMode() {
  if (isWindows) {
    const out = await run('reg', ['query', WINDOWS_PERSONALIZE, '/v', 'AppsUseLightTheme']);
    return { dark: /0x0\s*$/m.test(out) };
  }
  if (isMac) {
    return { dark: (await osascript('tell application "System Events" to tell appearance preferences to get dark mode')) === 'true' };
  }
  const scheme = await gsettingsGet(GNOME_INTERFACE, 'color-scheme');
  const gtkTheme = await gsettingsGet(GNOME_INTERFACE, 'gtk-theme').catch(() => null);
  return { dark: scheme === 'prefer-dark', scheme, gtkTheme };
}

/**
 * Switches dark mode on or off; returns the previous state for undo.
 */
export async function setDarkMode(dark) {
  const before = await getDarkMode();
  if (isWindows) {
    for (const key of ['AppsUseLightTheme', 'SystemUsesLightTheme']) {
      await run('reg', ['add', WINDOWS_PERSONALIZE, '/v', key, '/t', 'REG_DWORD', '/d', dark ? '0' : '1', '/f']);
    }
  } else if (isMac) {
    await osascript(`tell application "System Events" to tell appearance preferences to set dark mode to ${dark}`);
  } else {
    await gsettingsSet(GNOME_INTERFACE, 'color-scheme', dark ? 'prefer-dark' : 'default');
    const variant = gtkThemeVariant(before.gtkTheme, dark);
    if (variant) await gsettingsSet(GNOME_INTERFACE, 'gtk-theme', variant);
  }
  return before;
}

export async function restoreDarkMode(before) {
  if (!isLinux) return void (await setDarkMode(before.dark));
  await gsettingsSet(GNOME_INTERFACE, 'color-scheme', before.scheme);
  if (before.gtkTheme) await gsettingsSet(GNOME_INTERFACE, 'gtk-theme', before.gtkTheme);
}

// ── WiFi ─────────────────────────────────────────────────────────────────────

async function macWifiInterface() {
  const ports = await run('networksetup', ['-listallhardwareports']);
  return ports.match(/Hardware Port: (?:Wi-Fi|AirPort)\s*\nDevice: (\S+)/)?.[1] || 'en0';
}

export async function getWifi() {
  if (isWindows) {
    const out = await run('netsh', ['interface', 'show', 'interface', 'name=Wi-Fi']);
    return { enabled: /Administrative state:\s*Enabled/i.test(out) };
  }
  if (isMac) {
    return { enabled: /:\s*On\s*$/i.test(await run('networksetup', ['-getairportpower', await macWifiInterface()])) };
  }
  return { enabled: (await run('nmcli', ['radio', 'wifi'])) === 'enabled' };
}

export async function setWifi(enabled) {
  if (isWindows) {
    // Needs an elevated server process; the error says so when it is not
    await run('netsh', ['interface', 'set', 'interface', 'name=Wi-Fi', `admin=${enabled ? 'enabled' : 'disabled'}`]);
  } else if (isMac) {
    await run('networksetup', ['-setairportpower', await macWifiInterface(), enabled ? 'on' : 'off']);
  } else {
    await run('nmcli', ['radio', 'wifi', enabled ? 'on' : 'off']);
  }
}

// ── Brightness ───────────────────────────────────────────────────────────────

const BACKLIGHT_DIR = process.env.JARVIS_BACKLIGHT_DIR || '/sys/class/backlight';
// Same preference order as GNOME's backlight helper
const BACKLIGHT_TYPE_RANK = { firmware: 0, platform: 1, raw: 2 };

function readNumber(file) {
  return Number(fs.readFileSync(file, 'utf-8').trim());
}

function linuxBacklight() {
  let names = [];
  try {
    names = fs.readdirSync(/*turbopackIgnore: true*/ BACKLIGHT_DIR);
  } catch {
    return null;
  }
  const devices = names
    .map((name) => {
      const dir = path.join(/*turbopackIgnore: true*/ BACKLIGHT_DIR, name);
      try {
        const type = fs.existsSync(path.join(dir, 'type')) ? fs.readFileSync(path.join(dir, 'type'), 'utf-8').trim() : 'raw';
        return { name, type, raw: readNumber(path.join(dir, 'brightness')), max: readNumber(path.join(dir, 'max_brightness')) };
      } catch {
        return null;
      }
    })
    .filter((device) => device && device.max > 0)
    .sort((a, b) => (BACKLIGHT_TYPE_RANK[a.type] ?? 3) - (BACKLIGHT_TYPE_RANK[b.type] ?? 3));
  return devices[0] || null;
}

export async function getBrightness() {
  if (isWindows) {
    const out = await powershell('(Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness | Select-Object -First 1).CurrentBrightness');
    if (!/^\d+$/.test(out)) throw new SettingsError('This display does not report brightness (external monitors usually do not).');
    return { percent: Number(out) };
  }
  if (isMac) {
    const out = await run('brightness', ['-l']).catch(() => {
      throw new SettingsError('Brightness control on macOS needs the "brightness" command-line tool (brew install brightness).');
    });
    const level = out.match(/brightness ([\d.]+)/)?.[1];
    if (!level) throw new SettingsError('No built-in display brightness was reported.');
    return { percent: Math.round(Number(level) * 100) };
  }
  const device = linuxBacklight();
  if (!device) throw new SettingsError('No adjustable backlight was found (desktop monitors need DDC/CI tools such as ddcutil).');
  return { percent: Math.round((device.raw / device.max) * 100), device: device.name };
}

/**
 * Sets brightness (1-100 %, never fully dark); returns the previous { percent }.
 */
export async function setBrightness(percent) {
  const target = Math.max(1, Math.min(100, Math.round(percent)));
  const before = await getBrightness();
  if (isWindows) {
    await powershell(
      `Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightnessMethods | Invoke-CimMethod -MethodName WmiSetBrightness -Arguments @{ Timeout = 1; Brightness = ${target} } | Out-Null`
    );
  } else if (isMac) {
    await run('brightness', [(target / 100).toFixed(2)]);
  } else {
    const device = linuxBacklight();
    const value = Math.max(1, Math.round((target / 100) * device.max));
    try {
      // systemd-logind lets the session owner set the backlight without root
      await run('gdbus', [
        'call', '--system', '--dest', 'org.freedesktop.login1',
        '--object-path', '/org/freedesktop/login1/session/auto',
        '--method', 'org.freedesktop.login1.Session.SetBrightness',
        'backlight', device.name, String(value),
      ]);
    } catch (logindError) {
      try {
        await run('brightnessctl', ['--device', device.name, 'set', String(value)]);
      } catch {
        throw new SettingsError(`Could not set the brightness: ${logindError.message}`);
      }
    }
  }
  return { percent: before.percent };
}

// ── Wallpaper ────────────────────────────────────────────────────────────────

const GNOME_BACKGROUND = 'org.gnome.desktop.background';
const WALLPAPER_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif', '.tif', '.tiff', '.heic']);
const MAX_WALLPAPER_BYTES = 25 * 1024 * 1024;
const IMAGE_SIGNATURES = [
  { ext: '.png', test: (b) => b[0] === 0x89 && b.toString('ascii', 1, 4) === 'PNG' },
  { ext: '.jpg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: '.webp', test: (b) => b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP' },
  { ext: '.gif', test: (b) => b.toString('ascii', 0, 3) === 'GIF' },
  { ext: '.bmp', test: (b) => b.toString('ascii', 0, 2) === 'BM' },
];

export function isWallpaperFile(filePath) {
  return WALLPAPER_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

export async function getWallpaper() {
  if (isWindows) {
    const out = await run('reg', ['query', 'HKCU\\Control Panel\\Desktop', '/v', 'WallPaper']);
    return { path: out.match(/WallPaper\s+REG_SZ\s+(.*)$/m)?.[1]?.trim() || '' };
  }
  if (isMac) {
    return { path: await osascript('tell application "System Events" to get picture of current desktop') };
  }
  return {
    uri: await gsettingsGet(GNOME_BACKGROUND, 'picture-uri'),
    uriDark: await gsettingsGet(GNOME_BACKGROUND, 'picture-uri-dark').catch(() => null),
  };
}

async function applyWallpaper(filePath) {
  if (isWindows) {
    await powershell(
      `Add-Type -TypeDefinition 'using System.Runtime.InteropServices; public class JarvisWallpaper { [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int SystemParametersInfo(int a, int b, string c, int d); }'; [void][JarvisWallpaper]::SystemParametersInfo(20, 0, ${quotePowerShell(filePath)}, 3)`
    );
  } else if (isMac) {
    await osascript(`tell application "System Events" to tell every desktop to set picture to POSIX file ${quoteAppleScript(filePath)}`);
  } else {
    const uri = pathToFileURL(filePath).href;
    await gsettingsSet(GNOME_BACKGROUND, 'picture-uri', uri);
    await gsettingsSet(GNOME_BACKGROUND, 'picture-uri-dark', uri).catch(() => {}); // key absent before GNOME 42
  }
}

/**
 * Sets the desktop wallpaper to an image file; returns the previous wallpaper for undo.
 */
export async function setWallpaper(filePath) {
  const before = await getWallpaper();
  await applyWallpaper(filePath);
  return before;
}

export async function restoreWallpaper(before) {
  if (!isLinux) return applyWallpaper(before.path);
  await gsettingsSet(GNOME_BACKGROUND, 'picture-uri', before.uri);
  if (before.uriDark) await gsettingsSet(GNOME_BACKGROUND, 'picture-uri-dark', before.uriDark);
}

/**
 * Downloads an image URL into the Jarvis wallpaper folder and returns the saved path.
 * The content must really be an image (checked by its first bytes, not just the header).
 */
export async function downloadWallpaper(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new SettingsError(`"${url}" is not a valid URL.`);
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new SettingsError('Wallpaper URLs must be http or https.');

  const res = await fetch(parsed, { signal: AbortSignal.timeout(20000), headers: { 'User-Agent': 'Mozilla/5.0 (J.A.R.V.I.S wallpaper fetch)' } });
  if (!res.ok) throw new SettingsError(`The image could not be downloaded (HTTP ${res.status}).`);
  if (Number(res.headers.get('content-length') || 0) > MAX_WALLPAPER_BYTES) throw new SettingsError('The image is larger than 25 MB.');
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length > MAX_WALLPAPER_BYTES) throw new SettingsError('The image is larger than 25 MB.');
  const signature = IMAGE_SIGNATURES.find((sig) => sig.test(buffer));
  if (!signature) throw new SettingsError('That URL did not return an image Jarvis can use as a wallpaper (PNG, JPEG, WebP, GIF, or BMP).');

  const dir = process.env.JARVIS_WALLPAPER_DIR || path.join(os.homedir(), 'Pictures', 'Jarvis Wallpapers');
  fs.mkdirSync(dir, { recursive: true });
  const stem = path.basename(parsed.pathname).replace(/\.[^.]*$/, '').replace(/[^\w-]+/g, '-').slice(0, 40) || 'wallpaper';
  const file = path.join(/*turbopackIgnore: true*/ dir, `${stem}-${Date.now()}${signature.ext}`);
  fs.writeFileSync(file, buffer);
  return file;
}

// ── Processes ────────────────────────────────────────────────────────────────

// Session-critical processes Jarvis never offers to end
const PROTECTED_PROCESSES = new Set(
  [
    'systemd', 'init', 'gnome-shell', 'xwayland', 'xorg', 'gnome-session-binary', 'gnome-session-service',
    'gdm', 'gdm-wayland-session', 'gdm-x-session', 'dbus-daemon', 'dbus-broker', 'pipewire', 'pipewire-pulse',
    'wireplumber', 'sshd', 'ssh-agent', 'kwin_wayland', 'kwin_x11', 'plasmashell', 'ksmserver', 'polkitd',
    'networkmanager', 'gnome-keyring-daemon', 'explorer', 'winlogon', 'csrss', 'dwm', 'lsass', 'services',
    'svchost', 'smss', 'wininit', 'loginwindow', 'windowserver', 'launchd', 'finder', 'dock',
  ].map((name) => name.toLowerCase())
);

const INTERPRETERS = /^(python[\d.]*|node|nodejs|bash|sh|zsh|ruby|perl|php|deno|bun)$/;

function linuxProcesses() {
  const uid = process.getuid();
  return fs
    .readdirSync('/proc')
    .filter((name) => /^\d+$/.test(name))
    .map((pid) => {
      try {
        const status = fs.readFileSync(/*turbopackIgnore: true*/ `/proc/${pid}/status`, 'utf-8');
        if (Number(status.match(/^Uid:\s+(\d+)/m)?.[1]) !== uid) return null;
        const argv = fs.readFileSync(/*turbopackIgnore: true*/ `/proc/${pid}/cmdline`, 'utf-8').split('\0').filter(Boolean);
        const exe = argv[0] ? path.basename(argv[0]) : '';
        // For "python3 backup.py" the program the operator names is the script
        const script = INTERPRETERS.test(exe) ? argv.slice(1).find((arg) => !arg.startsWith('-')) : null;
        return {
          pid: Number(pid),
          ppid: Number(status.match(/^PPid:\s+(\d+)/m)?.[1]),
          name: fs.readFileSync(/*turbopackIgnore: true*/ `/proc/${pid}/comm`, 'utf-8').trim(),
          exe,
          script: script ? path.basename(script) : '',
          command: argv.join(' ').slice(0, 160),
        };
      } catch {
        return null; // exited while listing
      }
    })
    .filter(Boolean);
}

async function windowsProcesses() {
  const out = await run('tasklist', ['/FO', 'CSV', '/NH', '/FI', `USERNAME eq ${os.userInfo().username}`]);
  return out
    .split(/\r?\n/)
    .map((line) => line.match(/^"([^"]+)","(\d+)"/))
    .filter(Boolean)
    .map(([, image, pid]) => ({ pid: Number(pid), ppid: 0, name: image, exe: image, command: image }));
}

async function macProcesses() {
  const out = await run('ps', ['-U', String(process.getuid()), '-o', 'pid=,ppid=,comm=']);
  return out
    .split('\n')
    .map((line) => line.match(/^\s*(\d+)\s+(\d+)\s+(.+)$/))
    .filter(Boolean)
    .map(([, pid, ppid, comm]) => ({ pid: Number(pid), ppid: Number(ppid), name: path.basename(comm), exe: path.basename(comm), command: comm }));
}

const baseName = (name) => (name || '').toLowerCase().replace(/\.exe$/, '');
const stripExtension = (name) => name.replace(/\.[a-z0-9]+$/, '');

/**
 * The operator's own processes matching `query` (exact name first, else substring), excluding
 * protected session processes and Jarvis's own server and its parents.
 */
export async function findProcesses(query) {
  const all = isLinux ? linuxProcesses() : isWindows ? await windowsProcesses() : await macProcesses();
  const byPid = new Map(all.map((p) => [p.pid, p]));
  const own = new Set([process.pid, process.ppid, 1]);
  for (let p = byPid.get(process.ppid); p && !own.has(p.ppid); p = byPid.get(p.ppid)) own.add(p.ppid);

  const allowed = (p) => !own.has(p.pid) && !PROTECTED_PROCESSES.has(baseName(p.name)) && !PROTECTED_PROCESSES.has(baseName(p.exe));
  const wanted = baseName(String(query || '').trim());
  if (!wanted) return [];
  if (/^\d+$/.test(wanted)) return all.filter((p) => p.pid === Number(wanted) && allowed(p));

  // Linux truncates process names to 15 characters ("gnome-text-editor" runs as "gnome-text-edit")
  const nameMatches = (name) => name === wanted || (name.length === 15 && wanted.startsWith(name));
  const script = (p) => baseName(p.script);
  const exact = all.filter(
    (p) => nameMatches(baseName(p.name)) || baseName(p.exe) === wanted || (p.script && (script(p) === wanted || stripExtension(script(p)) === wanted))
  );
  // When the exact program exists but is protected, never fall back to similarly named ones
  if (exact.length) return exact.filter(allowed);
  return all.filter(
    (p) => allowed(p) && (baseName(p.name).includes(wanted) || baseName(p.exe).includes(wanted) || (p.script && script(p).includes(wanted)))
  );
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
}

/**
 * Asks processes to exit (SIGTERM, so apps can save) or forces them (SIGKILL); reports survivors.
 */
export async function terminateProcesses(pids, force = false) {
  for (const pid of pids) {
    try {
      if (isWindows) await run('taskkill', ['/PID', String(pid), ...(force ? ['/F'] : [])]);
      else process.kill(pid, force ? 'SIGKILL' : 'SIGTERM');
    } catch {
      // Already gone or not ours: reported below
    }
  }
  const deadline = Date.now() + 3000;
  let alive = pids.filter(isAlive);
  while (alive.length && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    alive = alive.filter(isAlive);
  }
  return { ended: pids.filter((pid) => !alive.includes(pid)), survivors: alive };
}

// ── Power ────────────────────────────────────────────────────────────────────

export const POWER_ACTIONS = {
  shutdown: 'shut down',
  restart: 'restart',
  suspend: 'suspend (sleep)',
  logout: 'log out',
};

const POWER_DELAY_MS = Number(process.env.JARVIS_POWER_DELAY_MS ?? 10000);
export const POWER_DELAY_SECONDS = Math.round(POWER_DELAY_MS / 1000);
const powerState = globalThis.__jarvisPowerPlan || (globalThis.__jarvisPowerPlan = { plan: null, history: [] });

function powerCommand(kind) {
  if (isWindows) {
    return {
      shutdown: ['shutdown', ['/s', '/t', '0']],
      restart: ['shutdown', ['/r', '/t', '0']],
      suspend: ['rundll32.exe', ['powrprof.dll,SetSuspendState', '0,1,0']],
      logout: ['shutdown', ['/l']],
    }[kind];
  }
  if (isMac) {
    const verb = { shutdown: 'shut down', restart: 'restart', suspend: 'sleep', logout: 'log out' }[kind];
    return ['osascript', ['-e', `tell application "System Events" to ${verb}`]];
  }
  if (kind === 'logout') {
    const desktop = (process.env.XDG_CURRENT_DESKTOP || '').toLowerCase();
    if (desktop.includes('gnome') || desktop.includes('unity')) return ['gnome-session-quit', ['--logout', '--no-prompt']];
    if (desktop.includes('kde')) return ['qdbus', ['org.kde.Shutdown', '/Shutdown', 'logout']];
    if (process.env.XDG_SESSION_ID) return ['loginctl', ['terminate-session', process.env.XDG_SESSION_ID]];
    throw new SettingsError('Log out is not supported on this desktop session.');
  }
  return ['systemctl', [{ shutdown: 'poweroff', restart: 'reboot', suspend: 'suspend' }[kind]]];
}

/**
 * Schedules a power action after a short grace period (Jarvis says goodbye; "cancel" stops it).
 */
export function schedulePower(kind) {
  if (!POWER_ACTIONS[kind]) throw new SettingsError(`Unknown power action "${kind}".`);
  const [cmd, args] = powerCommand(kind);
  cancelPower();
  const dryRun = process.env.JARVIS_SYSTEM_DRY_RUN === '1';
  const plan = { kind, command: [cmd, ...args].join(' '), at: Date.now() + POWER_DELAY_MS, dryRun };
  plan.timer = setTimeout(() => {
    powerState.plan = null;
    powerState.history.push({ ...plan, timer: undefined, firedAt: Date.now() });
    if (dryRun) {
      console.log(`[systemSettings] DRY RUN power action: ${plan.command}`);
      return;
    }
    spawn(/*turbopackIgnore: true*/ cmd, args, { detached: true, stdio: 'ignore' }).on('error', (err) => console.error('[systemSettings] power action failed:', err)).unref();
  }, POWER_DELAY_MS);
  powerState.plan = plan;
  return { kind, command: plan.command, delaySeconds: POWER_DELAY_SECONDS, dryRun };
}

export function cancelPower() {
  const plan = powerState.plan;
  if (!plan) return null;
  clearTimeout(plan.timer);
  powerState.plan = null;
  return { kind: plan.kind };
}

export function powerStatus() {
  const plan = powerState.plan;
  return {
    pending: plan ? { kind: plan.kind, seconds_left: Math.max(0, Math.round((plan.at - Date.now()) / 1000)) } : null,
    last_fired: powerState.history.at(-1) ? { kind: powerState.history.at(-1).kind, command: powerState.history.at(-1).command, dry_run: powerState.history.at(-1).dryRun } : null,
  };
}
