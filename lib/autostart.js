import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * Start-on-login for Jarvis (Phase 8.4): a launcher that starts the Next.js server (in the mode
 * and port it runs now) when it is not already up, waits for it, and opens the HUD in the default
 * browser; registered with the desktop session's own autostart mechanism:
 * Linux ~/.config/autostart (XDG), Windows the Startup folder, macOS a LaunchAgent.
 *
 * Test overrides: JARVIS_AUTOSTART_DIR (where the login entry goes), JARVIS_LAUNCHER_DIR.
 */

const isWindows = process.platform === 'win32';
const isMac = process.platform === 'darwin';
const ENTRY_NAME = 'jarvis-mark-ii';

function entryPath() {
  if (isWindows) {
    const dir = process.env.JARVIS_AUTOSTART_DIR || path.join(process.env.APPDATA || os.homedir(), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
    return path.join(/*turbopackIgnore: true*/ dir, `${ENTRY_NAME}.cmd`);
  }
  if (isMac) {
    const dir = process.env.JARVIS_AUTOSTART_DIR || path.join(os.homedir(), 'Library', 'LaunchAgents');
    return path.join(/*turbopackIgnore: true*/ dir, 'com.jarvis.mark-ii.plist');
  }
  const dir = process.env.JARVIS_AUTOSTART_DIR || path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'autostart');
  return path.join(/*turbopackIgnore: true*/ dir, `${ENTRY_NAME}.desktop`);
}

function launcherPath() {
  const dir = process.env.JARVIS_LAUNCHER_DIR || path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'), ENTRY_NAME);
  return path.join(/*turbopackIgnore: true*/ dir, 'start-jarvis.sh');
}

const shQuote = (text) => `'${String(text).replace(/'/g, `'\\''`)}'`;

/**
 * POSIX launcher: start the server only if the port is not answering, wait up to a minute, open the HUD.
 */
function posixLauncher({ projectDir, node, port, mode, opener }) {
  const url = `http://localhost:${port}/`;
  const probe = `${shQuote(node)} -e ${shQuote(`fetch(${JSON.stringify(url)}).then(() => process.exit(0), () => process.exit(1))`)}`;
  return `#!/bin/sh
# J.A.R.V.I.S Mark II login launcher. Written by Jarvis (start on login); turn it off in Settings or by voice.
cd ${shQuote(projectDir)} || exit 1
if ! ${probe}; then
  mkdir -p data
  ${shQuote(node)} node_modules/next/dist/bin/next ${mode} -p ${port} >> data/autostart.log 2>&1 &
  i=0
  until ${probe}; do
    i=$((i + 1)); [ "$i" -ge 60 ] && exit 1
    sleep 1
  done
fi
exec ${opener} ${shQuote(url)}
`;
}

function linuxDesktopEntry(launcher) {
  return `[Desktop Entry]
Type=Application
Name=J.A.R.V.I.S Mark II
Comment=Start the Jarvis server and open the HUD on login
Exec=/bin/sh "${launcher.replace(/(["`$\\])/g, '\\$1').replace(/%/g, '%%')}"
Terminal=false
X-GNOME-Autostart-enabled=true
X-GNOME-Autostart-Delay=5
`;
}

function windowsStartupScript({ projectDir, node, port, mode }) {
  return `@echo off
rem J.A.R.V.I.S Mark II login launcher. Written by Jarvis (start on login); turn it off in Settings or by voice.
cd /d "${projectDir}"
powershell -NoProfile -Command "try { Invoke-WebRequest -UseBasicParsing http://localhost:${port}/ | Out-Null; exit 0 } catch { exit 1 }"
if errorlevel 1 (
  start "" /min "${node}" node_modules\\next\\dist\\bin\\next ${mode} -p ${port}
  timeout /t 15 /nobreak >nul
)
start "" http://localhost:${port}/
`;
}

function macLaunchAgent(launcher) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>com.jarvis.mark-ii</string>
<key>ProgramArguments</key><array><string>/bin/sh</string><string>${launcher.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</string></array>
<key>RunAtLoad</key><true/>
</dict></plist>
`;
}

export function getAutostart() {
  const entry = entryPath();
  return { enabled: fs.existsSync(entry), entry };
}

/**
 * Registers the login entry. `port` is the port the HUD is served on now.
 */
export function enableAutostart({ port }) {
  const settings = {
    projectDir: process.cwd(),
    node: process.execPath,
    port: Number(port) || 3000,
    mode: process.env.NODE_ENV === 'development' ? 'dev' : 'start',
  };
  const entry = entryPath();
  fs.mkdirSync(path.dirname(entry), { recursive: true });

  if (isWindows) {
    fs.writeFileSync(entry, windowsStartupScript(settings).replace(/\n/g, '\r\n'), 'utf-8');
    return { enabled: true, entry };
  }

  const launcher = launcherPath();
  fs.mkdirSync(path.dirname(launcher), { recursive: true });
  fs.writeFileSync(launcher, posixLauncher({ ...settings, opener: isMac ? 'open' : 'xdg-open' }), { encoding: 'utf-8', mode: 0o755 });
  fs.writeFileSync(entry, isMac ? macLaunchAgent(launcher) : linuxDesktopEntry(launcher), 'utf-8');
  return { enabled: true, entry, launcher, mode: settings.mode, port: settings.port };
}

export function disableAutostart() {
  const entry = entryPath();
  const existed = fs.existsSync(entry);
  fs.rmSync(entry, { force: true });
  if (!isWindows) fs.rmSync(launcherPath(), { force: true });
  return { enabled: false, existed };
}
