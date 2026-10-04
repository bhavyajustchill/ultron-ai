import { execFile } from 'child_process';
import { promisify } from 'util';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * OS-native reminders for Jarvis (Phase 8.4). Each reminder is a desktop notification scheduled
 * with the operating system's own timer service, so it fires even when Jarvis is closed:
 * a systemd user timer on Linux (transient: kept until it fires or the computer restarts),
 * a Task Scheduler task on Windows, and a launchd agent on macOS. A registry in
 * data/reminders.json keeps the details for listing, cancelling, and spoken announcements
 * while the HUD is linked.
 *
 * Test overrides: JARVIS_REMINDERS_FILE (registry), JARVIS_NOTIFY_BIN (notification command).
 */

const execFileAsync = promisify(execFile);
const isWindows = process.platform === 'win32';
const isMac = process.platform === 'darwin';

const REGISTRY_FILE = path.resolve(/*turbopackIgnore: true*/ process.env.JARVIS_REMINDERS_FILE || path.join(process.cwd(), 'data', 'reminders.json'));
const UNIT_PREFIX = 'jarvis-reminder-';
const MIN_LEAD_MS = 5 * 1000;
const MAX_LEAD_MS = 366 * 24 * 60 * 60 * 1000;
const MAX_MESSAGE_CHARS = 200;
// Spoken announcements only for reminders that came due recently (not a backlog after a long break)
const ANNOUNCE_WINDOW_MS = 15 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export const REPEATS = ['none', 'daily', 'weekdays', 'weekly'];
const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export class ReminderError extends Error {}

async function run(cmd, args) {
  try {
    const { stdout } = await execFileAsync(cmd, args, { timeout: 15000, windowsHide: true });
    return stdout.trim();
  } catch (err) {
    if (err.code === 'ENOENT') throw new ReminderError(`${cmd} is not available on this system.`);
    throw new ReminderError(`${cmd} failed: ${(err.stderr || err.message || '').toString().trim().split('\n')[0].slice(0, 200)}`);
  }
}

function readRegistry() {
  try {
    const entries = JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf-8'));
    return Array.isArray(entries) ? entries : [];
  } catch {
    return [];
  }
}

function writeRegistry(entries) {
  fs.mkdirSync(path.dirname(REGISTRY_FILE), { recursive: true });
  const tmp = `${REGISTRY_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(entries, null, 2), 'utf-8');
  fs.renameSync(tmp, REGISTRY_FILE);
}

const pad = (n) => String(n).padStart(2, '0');
const localStamp = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

/**
 * Human phrasing for speech and lists: "today at 18:30", "tomorrow at 09:00", "Mon 12 Oct at 07:15".
 */
export function describeWhen(date, repeat = 'none', now = new Date()) {
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  if (repeat === 'daily') return `every day at ${time}`;
  if (repeat === 'weekdays') return `every weekday at ${time}`;
  if (repeat === 'weekly') return `every ${WEEKDAY_NAMES[date.getDay()]} at ${time}`;
  const dayDiff = Math.round((new Date(date).setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) / DAY_MS);
  if (dayDiff === 0) return `today at ${time}`;
  if (dayDiff === 1) return `tomorrow at ${time}`;
  return `${date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} at ${time}`;
}

/**
 * Resolves { at, in_minutes } to a Date. `at` is local wall-clock time ("2026-10-04T18:30" or
 * "18:30" for the next such time).
 */
export function resolveWhen({ at, in_minutes: inMinutes }, now = new Date()) {
  let when;
  if (inMinutes !== undefined && inMinutes !== null && inMinutes !== '') {
    const minutes = Number(inMinutes);
    if (!Number.isFinite(minutes)) throw new ReminderError('"in_minutes" must be a number.');
    when = new Date(now.getTime() + minutes * 60 * 1000);
  } else if (typeof at === 'string' && /^\d{1,2}:\d{2}$/.test(at.trim())) {
    const [h, m] = at.trim().split(':').map(Number);
    when = new Date(now);
    when.setHours(h, m, 0, 0);
    if (when <= now) when = new Date(when.getTime() + DAY_MS);
  } else if (typeof at === 'string' && at.trim()) {
    // A bare ISO date-time is parsed as local time; strip any zone so it is too. A date alone
    // would parse as UTC midnight, so it means 09:00 local instead.
    const text = at.trim().replace(/(Z|[+-]\d{2}:?\d{2})$/, '');
    when = new Date(/^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T09:00` : text);
    if (Number.isNaN(when.getTime())) throw new ReminderError(`Could not understand the time "${at}". Use local time like 2026-10-04T18:30.`);
  } else {
    throw new ReminderError('Give either "at" (local time) or "in_minutes".');
  }
  when.setMilliseconds(0);
  const lead = when.getTime() - now.getTime();
  if (lead < MIN_LEAD_MS) throw new ReminderError(`${localStamp(when)} is in the past.`);
  if (lead > MAX_LEAD_MS) throw new ReminderError('Reminders can be at most a year ahead.');
  return when;
}

function onCalendar(when, repeat) {
  const time = `${pad(when.getHours())}:${pad(when.getMinutes())}:${pad(when.getSeconds())}`;
  if (repeat === 'daily') return `*-*-* ${time}`;
  if (repeat === 'weekdays') return `Mon..Fri *-*-* ${time}`;
  if (repeat === 'weekly') return `${WEEKDAY_NAMES[when.getDay()]} *-*-* ${time}`;
  return localStamp(when);
}

async function notifyBinary() {
  if (process.env.JARVIS_NOTIFY_BIN) return process.env.JARVIS_NOTIFY_BIN;
  try {
    return await run('which', ['notify-send']);
  } catch {
    throw new ReminderError('notify-send is not installed (package libnotify-bin), so reminders cannot be shown.');
  }
}

async function scheduleLinux(id, when, repeat, message) {
  const notify = await notifyBinary();
  await run('systemd-run', [
    '--user',
    `--unit=${UNIT_PREFIX}${id}`,
    `--description=J.A.R.V.I.S reminder: ${message.slice(0, 60)}`,
    `--on-calendar=${onCalendar(when, repeat)}`,
    '--timer-property=AccuracySec=1s',
    ...(repeat === 'none' ? ['--collect'] : []),
    ...(process.env.DBUS_SESSION_BUS_ADDRESS ? [`--setenv=DBUS_SESSION_BUS_ADDRESS=${process.env.DBUS_SESSION_BUS_ADDRESS}`] : []),
    '--',
    notify,
    '--app-name=J.A.R.V.I.S',
    '--urgency=critical',
    '--icon=alarm-symbolic',
    '--hint=string:sound-name:alarm-clock-elapsed',
    'J.A.R.V.I.S Reminder',
    message,
  ]);
}

const psQuote = (text) => `'${text.replace(/'/g, "''")}'`;

async function scheduleWindows(id, when, repeat, message) {
  const popup = `Add-Type -AssemblyName PresentationFramework; [void][System.Windows.MessageBox]::Show(${psQuote(message)}, 'J.A.R.V.I.S Reminder')`;
  const encoded = Buffer.from(popup, 'utf16le').toString('base64');
  const iso = `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}T${pad(when.getHours())}:${pad(when.getMinutes())}:00`;
  const trigger =
    repeat === 'daily' ? `New-ScheduledTaskTrigger -Daily -At ([datetime]'${iso}')`
      : repeat === 'weekdays' ? `New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday,Tuesday,Wednesday,Thursday,Friday -At ([datetime]'${iso}')`
        : repeat === 'weekly' ? `New-ScheduledTaskTrigger -Weekly -DaysOfWeek ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][when.getDay()]} -At ([datetime]'${iso}')`
          : `New-ScheduledTaskTrigger -Once -At ([datetime]'${iso}')`;
  await run('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-Command',
    `Register-ScheduledTask -TaskPath '\\Jarvis\\' -TaskName '${UNIT_PREFIX}${id}' -Trigger (${trigger}) -Action (New-ScheduledTaskAction -Execute 'powershell.exe' -Argument '-NoProfile -WindowStyle Hidden -EncodedCommand ${encoded}') -Force | Out-Null`,
  ]);
}

function macPlistPath(id) {
  return path.join(/*turbopackIgnore: true*/ os.homedir(), 'Library', 'LaunchAgents', `com.jarvis.${UNIT_PREFIX}${id}.plist`);
}

const xmlEscape = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function scheduleMac(id, when, repeat, message) {
  const script = `display notification ${JSON.stringify(message)} with title "J.A.R.V.I.S Reminder" sound name "Glass"`;
  const interval = { Hour: when.getHours(), Minute: when.getMinutes() };
  if (repeat === 'none') Object.assign(interval, { Month: when.getMonth() + 1, Day: when.getDate() });
  if (repeat === 'weekly') interval.Weekday = when.getDay();
  const intervals = repeat === 'weekdays' ? [1, 2, 3, 4, 5].map((Weekday) => ({ ...interval, Weekday })) : [interval];
  const dict = (o) => `<dict>${Object.entries(o).map(([k, v]) => `<key>${k}</key><integer>${v}</integer>`).join('')}</dict>`;
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>com.jarvis.${UNIT_PREFIX}${id}</string>
<key>ProgramArguments</key><array><string>osascript</string><string>-e</string><string>${xmlEscape(script)}</string></array>
<key>StartCalendarInterval</key><array>${intervals.map(dict).join('')}</array>
</dict></plist>`;
  fs.mkdirSync(path.dirname(macPlistPath(id)), { recursive: true });
  fs.writeFileSync(macPlistPath(id), plist, 'utf-8');
  await run('launchctl', ['load', macPlistPath(id)]);
}

async function unscheduleOs(id) {
  if (isWindows) {
    await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `Unregister-ScheduledTask -TaskPath '\\Jarvis\\' -TaskName '${UNIT_PREFIX}${id}' -Confirm:$false`]).catch(() => {});
  } else if (isMac) {
    await run('launchctl', ['unload', macPlistPath(id)]).catch(() => {});
    fs.rmSync(macPlistPath(id), { force: true });
  } else {
    await run('systemctl', ['--user', 'stop', `${UNIT_PREFIX}${id}.timer`]).catch(() => {});
  }
}

/**
 * Whether the OS still holds the reminder's timer (Linux; elsewhere assumed while not past due).
 */
async function osTimerExists(id) {
  if (isWindows || isMac) return true;
  try {
    return (await run('systemctl', ['--user', 'show', `${UNIT_PREFIX}${id}.timer`, '-p', 'LoadState', '--value'])) === 'loaded';
  } catch {
    return false;
  }
}

/**
 * The latest occurrence at or before `now` (null when none yet).
 */
function lastOccurrence(reminder, now) {
  const first = new Date(reminder.at);
  if (first > now) return null;
  if (reminder.repeat === 'none') return first;
  const candidate = new Date(now);
  candidate.setHours(first.getHours(), first.getMinutes(), first.getSeconds(), 0);
  for (let i = 0; i < 8; i++) {
    const ok =
      candidate <= now &&
      candidate >= first &&
      (reminder.repeat === 'daily' ||
        (reminder.repeat === 'weekdays' && candidate.getDay() >= 1 && candidate.getDay() <= 5) ||
        (reminder.repeat === 'weekly' && candidate.getDay() === first.getDay()));
    if (ok) return candidate;
    candidate.setDate(candidate.getDate() - 1);
  }
  return null;
}

/**
 * The next occurrence after `now` (null for a one-off that has passed).
 */
function nextOccurrence(reminder, now) {
  const first = new Date(reminder.at);
  if (first > now) return first;
  if (reminder.repeat === 'none') return null;
  const candidate = new Date(now);
  candidate.setHours(first.getHours(), first.getMinutes(), first.getSeconds(), 0);
  for (let i = 0; i < 9; i++) {
    const ok =
      candidate > now &&
      (reminder.repeat === 'daily' ||
        (reminder.repeat === 'weekdays' && candidate.getDay() >= 1 && candidate.getDay() <= 5) ||
        (reminder.repeat === 'weekly' && candidate.getDay() === first.getDay()));
    if (ok) return candidate;
    candidate.setDate(candidate.getDate() + 1);
  }
  return null;
}

/**
 * Schedules a reminder with the OS and records it. Returns the stored reminder.
 */
export async function createReminder({ message, at, in_minutes: inMinutes, repeat = 'none' }) {
  const text = String(message || '').replace(/\s+/g, ' ').trim().slice(0, MAX_MESSAGE_CHARS);
  if (!text) throw new ReminderError('A reminder needs a message.');
  if (!REPEATS.includes(repeat)) throw new ReminderError(`"repeat" must be one of: ${REPEATS.join(', ')}.`);
  const when = resolveWhen({ at, in_minutes: inMinutes });
  const id = `${Date.now().toString(36)}${crypto.randomBytes(2).toString('hex')}`;

  if (isWindows) await scheduleWindows(id, when, repeat, text);
  else if (isMac) await scheduleMac(id, when, repeat, text);
  else await scheduleLinux(id, when, repeat, text);

  const reminder = { id, message: text, at: when.toISOString(), repeat, createdAt: new Date().toISOString(), announcedAt: null };
  writeRegistry([...readRegistry(), reminder]);
  return { ...reminder, when: describeWhen(when, repeat) };
}

/**
 * Upcoming reminders, soonest first. One-off reminders that already fired (or whose timer the OS
 * no longer holds, e.g. after a restart) are pruned from the registry.
 */
export async function listReminders(now = new Date()) {
  const entries = readRegistry();
  const kept = [];
  const upcoming = [];
  for (const reminder of entries) {
    const next = nextOccurrence(reminder, now);
    const alive = await osTimerExists(reminder.id);
    if (!next || !alive) {
      // Keep fired one-offs briefly so a linked HUD can still announce them
      if (now - new Date(reminder.at) < ANNOUNCE_WINDOW_MS && !reminder.announcedAt) kept.push(reminder);
      continue;
    }
    kept.push(reminder);
    upcoming.push({ id: reminder.id, message: reminder.message, repeat: reminder.repeat, next: next.toISOString(), when: describeWhen(next, reminder.repeat, now) });
  }
  if (kept.length !== entries.length) writeRegistry(kept);
  return upcoming.sort((a, b) => new Date(a.next) - new Date(b.next));
}

/**
 * Cancels by id, or by the first reminder whose message contains `match`.
 */
export async function cancelReminder({ id, match }) {
  const entries = readRegistry();
  const wanted = String(match || '').toLowerCase().trim();
  const target = entries.find((r) => (id && r.id === id) || (!id && wanted && r.message.toLowerCase().includes(wanted)));
  if (!target) throw new ReminderError(id ? `No reminder has the id "${id}".` : `No reminder mentions "${match}".`);
  await unscheduleOs(target.id);
  writeRegistry(entries.filter((r) => r.id !== target.id));
  return target;
}

/**
 * Reminders that came due within the announce window and have not been spoken yet; marks them
 * announced so each occurrence is spoken once.
 */
export function takeDueReminders(now = new Date()) {
  const entries = readRegistry();
  const due = [];
  for (const reminder of entries) {
    const occurrence = lastOccurrence(reminder, now);
    if (!occurrence || now - occurrence > ANNOUNCE_WINDOW_MS) continue;
    if (reminder.announcedAt && new Date(reminder.announcedAt) >= occurrence) continue;
    reminder.announcedAt = now.toISOString();
    due.push({ id: reminder.id, message: reminder.message, at: occurrence.toISOString() });
  }
  if (due.length) writeRegistry(entries);
  return due;
}

/**
 * Runs `argv` once at `when` through the OS timer service (used for scheduled Steam downloads).
 * `name` must be a short [a-z0-9-] id; it becomes the timer / task name.
 */
export async function scheduleOneShotCommand({ name, when, argv, description }) {
  if (!/^[a-z0-9-]{3,60}$/.test(name)) throw new ReminderError(`Invalid schedule name "${name}".`);
  if (isWindows) {
    const iso = `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}T${pad(when.getHours())}:${pad(when.getMinutes())}:00`;
    const [command, ...args] = argv;
    await run('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-Command',
      `Register-ScheduledTask -TaskPath '\\Jarvis\\' -TaskName '${name}' -Trigger (New-ScheduledTaskTrigger -Once -At ([datetime]'${iso}')) -Action (New-ScheduledTaskAction -Execute ${psQuote(command)} -Argument ${psQuote(args.join(' '))}) -Force | Out-Null`,
    ]);
    return;
  }
  if (isMac) {
    const plistPath = path.join(/*turbopackIgnore: true*/ os.homedir(), 'Library', 'LaunchAgents', `com.jarvis.${name}.plist`);
    const interval = { Month: when.getMonth() + 1, Day: when.getDate(), Hour: when.getHours(), Minute: when.getMinutes() };
    fs.mkdirSync(path.dirname(plistPath), { recursive: true });
    fs.writeFileSync(plistPath, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>com.jarvis.${name}</string>
<key>ProgramArguments</key><array>${argv.map((a) => `<string>${xmlEscape(a)}</string>`).join('')}</array>
<key>StartCalendarInterval</key><dict>${Object.entries(interval).map(([k, v]) => `<key>${k}</key><integer>${v}</integer>`).join('')}</dict>
</dict></plist>`, 'utf-8');
    await run('launchctl', ['load', plistPath]);
    return;
  }
  await run('systemd-run', [
    '--user',
    `--unit=${name}`,
    `--description=${String(description || name).slice(0, 80)}`,
    `--on-calendar=${onCalendar(when, 'none')}`,
    '--timer-property=AccuracySec=1s',
    '--collect',
    ...['DBUS_SESSION_BUS_ADDRESS', 'WAYLAND_DISPLAY', 'DISPLAY', 'XDG_RUNTIME_DIR'].filter((k) => process.env[k]).map((k) => `--setenv=${k}=${process.env[k]}`),
    '--',
    ...argv,
  ]);
}

/**
 * Names of pending one-shot schedules starting with `prefix` (Linux), for listing / cancelling.
 */
export async function listOneShotCommands(prefix) {
  if (isWindows || isMac) return [];
  try {
    const out = await run('systemctl', ['--user', 'list-timers', '--all', '--no-legend', '--plain', `${prefix}*`]);
    return [...out.matchAll(new RegExp(`(${prefix}[a-z0-9-]+)\\.timer`, 'g'))].map((m) => m[1]);
  } catch {
    return [];
  }
}

export async function cancelOneShotCommand(name) {
  if (isWindows) {
    await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `Unregister-ScheduledTask -TaskPath '\\Jarvis\\' -TaskName '${name}' -Confirm:$false`]).catch(() => {});
  } else if (isMac) {
    const plistPath = path.join(/*turbopackIgnore: true*/ os.homedir(), 'Library', 'LaunchAgents', `com.jarvis.${name}.plist`);
    await run('launchctl', ['unload', plistPath]).catch(() => {});
    fs.rmSync(plistPath, { force: true });
  } else {
    await run('systemctl', ['--user', 'stop', `${name}.timer`]).catch(() => {});
  }
}
