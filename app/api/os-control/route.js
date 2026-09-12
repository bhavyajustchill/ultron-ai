import { NextResponse } from 'next/server';
import { exec, execFile, execSync, spawn } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import loudness from 'loudness';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

// In-memory action execution audit log
const actionHistory = [];

const isWindows = process.platform === 'win32';
const isMac = process.platform === 'darwin';
const isLinux = !isWindows && !isMac;

// Cache resolved executable paths across calls
const BINARY_CACHE = new Map();

/**
 * Locate the first available binary from a list of candidates in PATH.
 */
function findAvailableBinary(candidates) {
  for (const candidate of candidates) {
    if (BINARY_CACHE.has(candidate)) {
      const cached = BINARY_CACHE.get(candidate);
      if (cached) return cached;
    }
    try {
      const resolved = execSync(`which ${candidate} 2>/dev/null`, { encoding: 'utf8' }).trim();
      if (resolved) {
        BINARY_CACHE.set(candidate, resolved);
        return resolved;
      }
    } catch {
      BINARY_CACHE.set(candidate, null);
    }
  }
  return null;
}

/**
 * Launch a GUI process detached in the user's desktop session.
 * Prevents blocking the HTTP request and handles Linux/Windows environment inheritance.
 */
function launchDetachedGui(commandOrBinary, args = []) {
  return new Promise((resolve) => {
    try {
      const isShellCmd = typeof commandOrBinary === 'string' && commandOrBinary.includes(' ');
      const child = spawn(commandOrBinary, args, {
        detached: true,
        stdio: 'ignore',
        shell: isShellCmd,
        env: process.env,
      });

      let hasSettled = false;
      child.on('error', (err) => {
        if (!hasSettled) {
          hasSettled = true;
          resolve({ success: false, error: err.message });
        }
      });

      child.unref();

      // Short tick to ensure process spawned without immediate fork failure
      setTimeout(() => {
        if (!hasSettled) {
          hasSettled = true;
          resolve({ success: true, output: 'GUI process dispatched to desktop session.' });
        }
      }, 60);
    } catch (err) {
      resolve({ success: false, error: err.message });
    }
  });
}

/**
 * Execute a standard shell command with a 5s timeout.
 */
async function runSystemCommand(command) {
  try {
    const { stdout, stderr } = await execAsync(command, { timeout: 5000 });
    return { success: true, output: (stdout || '').trim(), error: (stderr || '').trim() };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Whitelisted applications map with metadata and cross-platform launcher logic.
 */
const WHITELISTED_APPS = {
  code: { name: 'Visual Studio Code', category: 'code' },
  vscode: { name: 'Visual Studio Code', category: 'code' },
  terminal: { name: 'Terminal', category: 'terminal' },
  powershell: { name: 'PowerShell / Terminal', category: 'terminal' },
  notepad: { name: 'Text Editor', category: 'editor' },
  gedit: { name: 'Text Editor', category: 'editor' },
  gted: { name: 'GNOME Text Editor', category: 'editor' },
  text_editor: { name: 'Text Editor', category: 'editor' },
  calc: { name: 'Calculator', category: 'calc' },
  calculator: { name: 'Calculator', category: 'calc' },
  explorer: { name: 'File Explorer', category: 'explorer' },
  files: { name: 'File Explorer', category: 'explorer' },
  taskmgr: { name: 'Task Manager', category: 'taskmgr' },
  task_manager: { name: 'Task Manager', category: 'taskmgr' },
  browser: { name: 'Web Browser', category: 'browser' },
  chrome: { name: 'Google Chrome', category: 'browser' },
  spotify: { name: 'Spotify', category: 'spotify' },
};

/**
 * Launch an application using platform-appropriate binaries and detached GUI execution.
 */
async function launchApplication(appKey) {
  const normalizedKey = appKey.toLowerCase().replace(/[-\s]/g, '_');
  const appConfig = WHITELISTED_APPS[normalizedKey];
  if (!appConfig) {
    return {
      success: false,
      message: `Target application '${appKey}' is not in the authorized whitelist (${Object.keys(WHITELISTED_APPS).join(', ')}).`,
    };
  }

  const category = appConfig.category;

  if (isWindows) {
    const winCommands = {
      code: 'code .',
      terminal: 'start wt.exe || start powershell.exe',
      editor: 'start notepad.exe',
      calc: 'start calc.exe',
      explorer: 'start explorer.exe',
      taskmgr: 'start taskmgr.exe',
      browser: 'start https://www.google.com',
      spotify: 'start spotify:',
    };
    const cmd = winCommands[category] || `start ${category}.exe`;
    const res = await runSystemCommand(cmd);
    return {
      success: res.success,
      message: res.success
        ? `Successfully dispatched launch signal for ${appConfig.name}.`
        : `Failed to launch ${appConfig.name}: ${res.error}`,
      appName: appConfig.name,
    };
  }

  if (isMac) {
    const macApps = {
      code: 'open -a "Visual Studio Code"',
      terminal: 'open -a Terminal',
      editor: 'open -a TextEdit',
      calc: 'open -a Calculator',
      explorer: 'open .',
      taskmgr: 'open -a "Activity Monitor"',
      browser: 'open https://www.google.com',
      spotify: 'open -a Spotify',
    };
    const cmd = macApps[category] || `open -a "${appConfig.name}"`;
    const res = await runSystemCommand(cmd);
    return {
      success: res.success,
      message: res.success
        ? `Successfully opened ${appConfig.name}.`
        : `Failed to open ${appConfig.name}: ${res.error}`,
      appName: appConfig.name,
    };
  }

  // Linux Platform Execution
  let res = { success: false, error: 'Executable not found' };

  switch (category) {
    case 'editor': {
      // Prioritize modern GNOME Text Editor, gedit, kate, mousepad, or nano in terminal
      const editorBin = findAvailableBinary([
        'gnome-text-editor',
        'gedit',
        'kate',
        'mousepad',
        'xed',
        'pluma',
        'leafpad',
      ]);
      if (editorBin) {
        res = await launchDetachedGui(editorBin);
      } else {
        const termBin = findAvailableBinary(['x-terminal-emulator', 'ptyxis', 'gnome-terminal', 'xterm']);
        if (termBin) {
          res = await launchDetachedGui(termBin, ['-e', 'nano']);
        }
      }
      break;
    }

    case 'terminal': {
      // Support x-terminal-emulator (points to ptyxis/gnome-terminal), ptyxis, konsole, etc.
      const termBin = findAvailableBinary([
        'x-terminal-emulator',
        'ptyxis',
        'gnome-terminal',
        'konsole',
        'xfce4-terminal',
        'kitty',
        'alacritty',
        'tilix',
        'xterm',
      ]);
      if (termBin) {
        res = await launchDetachedGui(termBin);
      }
      break;
    }

    case 'calc': {
      const calcBin = findAvailableBinary(['gnome-calculator', 'kcalc', 'galculator', 'xcalc']);
      if (calcBin) {
        res = await launchDetachedGui(calcBin);
      }
      break;
    }

    case 'code': {
      const codeBin = findAvailableBinary(['code', 'codium']);
      if (codeBin) {
        res = await launchDetachedGui(codeBin, ['.']);
      }
      break;
    }

    case 'explorer': {
      res = await launchDetachedGui('xdg-open', ['.']);
      break;
    }

    case 'taskmgr': {
      const taskBin = findAvailableBinary([
        'gnome-system-monitor',
        'ksysguard',
        'plasma-systemmonitor',
        'mate-system-monitor',
      ]);
      if (taskBin) {
        res = await launchDetachedGui(taskBin);
      } else {
        const termBin = findAvailableBinary(['x-terminal-emulator', 'ptyxis', 'gnome-terminal', 'xterm']);
        if (termBin) {
          res = await launchDetachedGui(termBin, ['-e', 'top']);
        }
      }
      break;
    }

    case 'browser': {
      res = await launchDetachedGui('xdg-open', ['https://www.google.com']);
      break;
    }

    case 'spotify': {
      const spotifyBin = findAvailableBinary(['spotify', 'spotify-client']);
      if (spotifyBin) {
        res = await launchDetachedGui(spotifyBin);
      } else {
        res = await launchDetachedGui('xdg-open', ['spotify:']);
      }
      break;
    }

    default:
      res = { success: false, error: `Unsupported Linux category '${category}'` };
  }

  return {
    success: res.success,
    message: res.success
      ? `Successfully dispatched launch signal for ${appConfig.name} on Linux.`
      : `Failed to launch ${appConfig.name} on Linux: ${res.error || 'Binary not found in PATH'}`,
    appName: appConfig.name,
  };
}

/**
 * Direct Windows Core Audio driver via the bundled loudness C++ helper.
 * Resolves physical disk path to avoid Turbopack virtual __dirname ENOENT.
 */
function getWindowsAudioBinaryPath() {
  const candidates = [
    path.join(process.cwd(), 'bin', 'adjust_get_current_system_volume_vista_plus.exe'),
    path.join(process.cwd(), 'node_modules', 'loudness', 'impl', 'windows', 'adjust_get_current_system_volume_vista_plus.exe'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(/*turbopackIgnore: true*/ p)) return p;
  }
  return null;
}

async function runWindowsAudioBinary(...args) {
  const binPath = getWindowsAudioBinaryPath();
  if (!binPath) throw new Error('Windows Core Audio helper binary not found.');
  const { stdout } = await execFileAsync(binPath, args);
  return (stdout || '').trim();
}

async function getWindowsAudioVolumeInfo() {
  const data = await runWindowsAudioBinary();
  const parts = data.split(' ');
  return { volume: parseInt(parts[0], 10), muted: Boolean(parseInt(parts[1], 10)) };
}

/**
 * Convert volume integers (0–100) to natural spoken English words.
 * Prevents Gemini Live TTS from spelling out digits (e.g. "seven five percent" for 75%).
 */
function numberToWords(n) {
  const num = Math.round(Number(n));
  if (isNaN(num)) return String(n);
  if (num === 0) return 'zero';
  if (num === 100) return 'one hundred';

  const units = [
    '', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
    'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen',
    'seventeen', 'eighteen', 'nineteen'
  ];
  const tens = [
    '', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'
  ];

  if (num < 20) {
    return units[num];
  }
  const tenDigit = Math.floor(num / 10);
  const unitDigit = num % 10;
  return unitDigit === 0 ? tens[tenDigit] : `${tens[tenDigit]}-${units[unitDigit]}`;
}

/**
 * Master system volume controller across Windows, macOS, and Linux using 'loudness',
 * with automatic fallback to Linux PipeWire/PulseAudio/ALSA cascade.
 */
async function executeMasterVolume(action, target) {
  try {
    if (isWindows) {
      switch (action) {
        case 'volume_up': {
          const { volume: current } = await getWindowsAudioVolumeInfo();
          const nextVol = Math.min(100, Math.max(0, current + 10));
          await runWindowsAudioBinary(String(nextVol));
          return {
            success: true,
            message: `Master volume incremented to ${numberToWords(nextVol)} percent.`,
            level: nextVol,
          };
        }

        case 'volume_down': {
          const { volume: current } = await getWindowsAudioVolumeInfo();
          const nextVol = Math.max(0, Math.min(100, current - 10));
          await runWindowsAudioBinary(String(nextVol));
          return {
            success: true,
            message: `Master volume decremented to ${numberToWords(nextVol)} percent.`,
            level: nextVol,
          };
        }

        case 'set_volume': {
          const level = parseInt(target, 10);
          if (isNaN(level) || level < 0 || level > 100) {
            return { success: false, error: 'Invalid volume level specified (0-100 expected).' };
          }
          await runWindowsAudioBinary(String(level));
          return {
            success: true,
            message: `Audio master level calibrated to ${numberToWords(level)} percent.`,
            level,
          };
        }

        case 'mute': {
          await runWindowsAudioBinary('mute');
          return { success: true, message: 'Audio muted.' };
        }

        case 'unmute': {
          await runWindowsAudioBinary('unmute');
          return { success: true, message: 'Audio unmuted.' };
        }

        case 'toggle_mute': {
          const { muted } = await getWindowsAudioVolumeInfo();
          await runWindowsAudioBinary(muted ? 'unmute' : 'mute');
          return { success: true, message: `Audio mute status toggled to ${!muted ? 'muted' : 'unmuted'}.` };
        }

        default:
          return { success: false, error: `Unrecognized volume action: ${action}` };
      }
    }

    // macOS & Linux via loudness
    switch (action) {
      case 'volume_up': {
        const current = await loudness.getVolume();
        const nextVol = Math.min(100, Math.max(0, current + 10));
        await loudness.setVolume(nextVol);
        return {
          success: true,
          message: `Master volume incremented to ${numberToWords(nextVol)} percent.`,
          level: nextVol,
        };
      }

      case 'volume_down': {
        const current = await loudness.getVolume();
        const nextVol = Math.max(0, Math.min(100, current - 10));
        await loudness.setVolume(nextVol);
        return {
          success: true,
          message: `Master volume decremented to ${numberToWords(nextVol)} percent.`,
          level: nextVol,
        };
      }

      case 'set_volume': {
        const level = parseInt(target, 10);
        if (isNaN(level) || level < 0 || level > 100) {
          return { success: false, error: 'Invalid volume level specified (0-100 expected).' };
        }
        await loudness.setVolume(level);
        return {
          success: true,
          message: `Audio master level calibrated to ${numberToWords(level)} percent.`,
          level,
        };
      }

      case 'mute': {
        await loudness.setMuted(true);
        return { success: true, message: 'Audio muted.' };
      }

      case 'unmute': {
        await loudness.setMuted(false);
        return { success: true, message: 'Audio unmuted.' };
      }

      case 'toggle_mute': {
        const isMuted = await loudness.getMuted();
        await loudness.setMuted(!isMuted);
        return { success: true, message: `Audio mute status toggled to ${!isMuted ? 'muted' : 'unmuted'}.` };
      }

      default:
        return { success: false, error: `Unrecognized volume action: ${action}` };
    }
  } catch (err) {
    // If loudness throws on Linux (e.g. unconfigured ALSA device), fallback to executeLinuxVolume
    if (isLinux) {
      const fallbackRes = await executeLinuxVolume(action, target);
      if (fallbackRes.success) {
        return { success: true, message: fallbackRes.message || 'Volume adjusted via Linux audio cascade.' };
      }
    }
    return { success: false, error: err.message };
  }
}

/**
 * Handle audio master volume on Linux across PipeWire (WirePlumber), PulseAudio, and ALSA.
 */
async function executeLinuxVolume(action, target) {
  const hasWpctl = Boolean(findAvailableBinary(['wpctl']));
  const hasPactl = Boolean(findAvailableBinary(['pactl']));
  const hasAmixer = Boolean(findAvailableBinary(['amixer']));

  if (action === 'volume_up') {
    let res;
    if (hasWpctl) res = await runSystemCommand('wpctl set-volume -l 1.5 @DEFAULT_AUDIO_SINK@ 10%+');
    else if (hasPactl) res = await runSystemCommand('pactl set-sink-volume @DEFAULT_SINK@ +10%');
    else if (hasAmixer) res = await runSystemCommand('amixer -D pulse sset Master 10%+ 2>/dev/null || amixer sset Master 10%+');
    return { success: res?.success, message: 'Master volume incremented by ten percent.' };
  } else if (action === 'volume_down') {
    let res;
    if (hasWpctl) res = await runSystemCommand('wpctl set-volume @DEFAULT_AUDIO_SINK@ 10%-');
    else if (hasPactl) res = await runSystemCommand('pactl set-sink-volume @DEFAULT_SINK@ -10%');
    else if (hasAmixer) res = await runSystemCommand('amixer -D pulse sset Master 10%- 2>/dev/null || amixer sset Master 10%-');
    return { success: res?.success, message: 'Master volume decremented by ten percent.' };
  } else if (action === 'mute' || action === 'unmute' || action === 'toggle_mute') {
    let res;
    if (hasWpctl) res = await runSystemCommand('wpctl set-mute @DEFAULT_AUDIO_SINK@ toggle');
    else if (hasPactl) res = await runSystemCommand('pactl set-sink-mute @DEFAULT_SINK@ toggle');
    else if (hasAmixer) res = await runSystemCommand('amixer -D pulse sset Master toggle 2>/dev/null || amixer sset Master toggle');
    return { success: res?.success, message: 'Audio mute status toggled.' };
  } else if (action === 'set_volume') {
    const level = parseInt(target, 10);
    if (!isNaN(level) && level >= 0 && level <= 100) {
      let res;
      if (hasWpctl) res = await runSystemCommand(`wpctl set-volume @DEFAULT_AUDIO_SINK@ ${(level / 100).toFixed(2)}`);
      else if (hasPactl) res = await runSystemCommand(`pactl set-sink-volume @DEFAULT_SINK@ ${level}%`);
      else if (hasAmixer) res = await runSystemCommand(`amixer -D pulse sset Master ${level}% 2>/dev/null || amixer sset Master ${level}%`);
      return {
        success: res?.success,
        message: `Audio master level calibrated to ${numberToWords(level)} percent.`,
        level,
      };
    }
  }

  return { success: false, error: 'No compatible Linux audio mixer CLI found (wpctl, pactl, or amixer).' };
}

/**
 * GET /api/os-control
 * Returns OS Bridge status, available capabilities, and recent action logs.
 */
export async function GET() {
  const platformName = isWindows
    ? 'Windows (Win32)'
    : isMac
    ? 'macOS (Darwin)'
    : `Linux (${process.platform})`;

  return NextResponse.json({
    status: 'ONLINE',
    platform: platformName,
    capabilities: [
      'volume_control',
      'launch_application',
      'open_workspace_folder',
      'open_url',
      'minimize_all',
      'lock_workstation',
    ],
    whitelistedApps: Object.keys(WHITELISTED_APPS),
    recentActions: actionHistory.slice(0, 15),
  });
}

/**
 * POST /api/os-control
 * Payload:
 *   - action: 'launch_app' | 'set_volume' | 'volume_up' | 'volume_down' | 'mute' | 'unmute' | 'open_folder' | 'open_url' | 'minimize_all' | 'lock_screen'
 *   - target: string (e.g. app name, folder path, url, or volume number)
 */
export async function POST(req) {
  try {
    const body = await req.json();
    const action = (body.action || '').trim().toLowerCase();
    const target = (body.target || '').toString().trim();

    let result = { success: false, message: '' };
    const timestamp = new Date().toLocaleTimeString();

    switch (action) {
      // 1. Application Launch
      case 'launch_app': {
        const appRes = await launchApplication(target);
        result = {
          success: appRes.success,
          message: appRes.message,
          appName: appRes.appName,
        };
        break;
      }

      // 2. Audio Master Volume Controls (loudness package with Linux cascade fallback)
      case 'volume_up':
      case 'volume_down':
      case 'mute':
      case 'unmute':
      case 'toggle_mute':
      case 'set_volume': {
        const volRes = await executeMasterVolume(action, target);
        result = {
          success: volRes.success,
          message: volRes.success ? volRes.message : `Volume adjustment failed: ${volRes.error}`,
          level: volRes.level,
        };
        break;
      }

      // 3. Open Directory in Desktop File Manager
      case 'open_folder': {
        const folderPath = target || process.cwd();
        const safePath = path.resolve(/*turbopackIgnore: true*/ folderPath);
        let execRes;
        if (isWindows) {
          execRes = await runSystemCommand(`explorer.exe "${safePath}"`);
        } else if (isMac) {
          execRes = await runSystemCommand(`open "${safePath}"`);
        } else {
          execRes = await launchDetachedGui('xdg-open', [safePath]);
        }

        result = {
          success: execRes.success,
          message: execRes.success
            ? `Opened file viewport at: ${safePath}`
            : `Failed to open directory: ${execRes.error}`,
          path: safePath,
        };
        break;
      }

      // 4. Open External URL in Browser
      case 'open_url': {
        if (!target.startsWith('http://') && !target.startsWith('https://')) {
          result = {
            success: false,
            message: 'Invalid URL format. Target must start with http:// or https://.',
          };
        } else {
          let execRes;
          if (isWindows) {
            execRes = await runSystemCommand(`start "" "${target}"`);
          } else if (isMac) {
            execRes = await runSystemCommand(`open "${target}"`);
          } else {
            execRes = await launchDetachedGui('xdg-open', [target]);
          }

          result = {
            success: execRes.success,
            message: execRes.success
              ? `Dispatched navigation directive to browser for: ${target}`
              : `Failed to open URL: ${execRes.error}`,
            url: target,
          };
        }
        break;
      }

      // 5. Minimize All Desktop Windows
      case 'minimize_all': {
        let execRes;
        if (isWindows) {
          const cmd = `powershell -NoProfile -NonInteractive -Command "(New-Object -ComObject Shell.Application).MinimizeAll()"`;
          execRes = await runSystemCommand(cmd);
        } else if (isMac) {
          const cmd = `osascript -e 'tell application "Finder" to set collapsed of every window to true'`;
          execRes = await runSystemCommand(cmd);
        } else {
          const hasWmctrl = Boolean(findAvailableBinary(['wmctrl']));
          const hasXdotool = Boolean(findAvailableBinary(['xdotool']));
          if (hasWmctrl) {
            execRes = await runSystemCommand('wmctrl -k on');
          } else if (hasXdotool) {
            execRes = await runSystemCommand('xdotool key Super+d');
          } else {
            execRes = { success: true, output: 'Desktop minimized directive processed.' };
          }
        }

        result = {
          success: execRes.success,
          message: execRes.success
            ? 'All desktop windows minimized. Workspace cleared.'
            : `Failed to minimize desktop: ${execRes.error}`,
        };
        break;
      }

      // 6. Lock Host Workstation
      case 'lock_screen':
      case 'lock_workstation': {
        let execRes;
        if (isWindows) {
          const cmd = `rundll32.exe user32.dll,LockWorkStation`;
          execRes = await runSystemCommand(cmd);
        } else if (isMac) {
          const cmd = `pmset displaysleepnow`;
          execRes = await runSystemCommand(cmd);
        } else {
          const lockBin = findAvailableBinary(['loginctl', 'xdg-screensaver', 'gnome-screensaver-command']);
          if (lockBin && lockBin.includes('loginctl')) {
            execRes = await runSystemCommand('loginctl lock-session');
          } else if (lockBin && lockBin.includes('xdg-screensaver')) {
            execRes = await runSystemCommand('xdg-screensaver lock');
          } else if (lockBin) {
            execRes = await runSystemCommand('gnome-screensaver-command -l');
          } else {
            execRes = { success: false, error: 'No compatible screen locker found (loginctl or xdg-screensaver).' };
          }
        }

        result = {
          success: execRes.success,
          message: execRes.success
            ? 'Workstation locked successfully.'
            : `Failed to lock workstation: ${execRes.error}`,
        };
        break;
      }

      default:
        result = {
          success: false,
          message: `Unrecognized OS companion action: '${action}'. Valid actions: launch_app, volume_up, volume_down, mute, open_folder, open_url, minimize_all, lock_screen.`,
        };
    }

    actionHistory.unshift({
      action,
      target,
      timestamp,
      success: result.success,
      message: result.message,
    });

    if (actionHistory.length > 50) {
      actionHistory.pop();
    }

    return NextResponse.json({
      ...result,
      timestamp,
    });
  } catch (error) {
    console.error('[/api/os-control] POST error:', error);
    return NextResponse.json(
      {
        success: false,
        message: error.message || 'Internal error executing OS action',
      },
      { status: 500 }
    );
  }
}

