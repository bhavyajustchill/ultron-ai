// Keyboard helper for Jarvis on Wayland (Phase 9.1), run with `gjs -m bin/portal-keyboard.js`.
// Wayland gives other programs no way to send keystrokes, so this drives the desktop's
// RemoteDesktop portal (org.freedesktop.portal.RemoteDesktop), which asks the operator once and
// can remember the answer (restore token). A portal session lives as long as the D-Bus connection
// that created it, so the helper stays running and lib/remoteDesktopPortal.js talks to it with one
// JSON object per line over stdin / stdout:
//   { id, cmd: 'start', restore_token? }  -> { id, ok, restore_token?, devices }
//   { id, cmd: 'type', keysyms: [...] }    press and release each keysym in turn
//   { id, cmd: 'chord', keysyms: [...] }   press all in order, release in reverse (ctrl+c)
//   { id, cmd: 'stop' }                    close the session and exit
// It exits on its own after an idle spell, or when stdin closes.

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import GioUnix from 'gi://GioUnix';

const BUS_NAME = GLib.getenv('JARVIS_PORTAL_BUS_NAME') || 'org.freedesktop.portal.Desktop';
const PORTAL_PATH = '/org/freedesktop/portal/desktop';
const REMOTE_DESKTOP = 'org.freedesktop.portal.RemoteDesktop';
const DEVICE_KEYBOARD = 1;
const PERSIST_UNTIL_REVOKED = 2;
const IDLE_EXIT_MS = Number(GLib.getenv('JARVIS_PORTAL_IDLE_MS')) || 3 * 60 * 1000;
const KEY_GAP_MS = 6;

const loop = new GLib.MainLoop(null, false);
const bus = Gio.DBus.session;
const sender = bus.get_unique_name().slice(1).replace(/\./g, '_');
let tokenCount = 0;
let session = null; // { handle, restoreToken, devices }
let starting = null;
let idleTimer = 0;

const send = (message) => print(JSON.stringify(message));
const sleep = (ms) => new Promise((resolve) => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => (resolve(), GLib.SOURCE_REMOVE)));
const vardict = (entries) => Object.fromEntries(Object.entries(entries).map(([key, [type, value]]) => [key, new GLib.Variant(type, value)]));

function call(method, params, iface = REMOTE_DESKTOP, path = PORTAL_PATH) {
  return new Promise((resolve, reject) => {
    bus.call(BUS_NAME, path, iface, method, params, null, Gio.DBusCallFlags.NONE, -1, null, (conn, res) => {
      try {
        resolve(conn.call_finish(res));
      } catch (err) {
        reject(err);
      }
    });
  });
}

// Portal methods answer through a Request object's Response signal; subscribe before calling so
// a fast reply is not missed
function request(method, buildParams) {
  const token = `jarvis${GLib.random_int_range(0, 1e6)}_${++tokenCount}`;
  const requestPath = `${PORTAL_PATH}/request/${sender}/${token}`;
  return new Promise((resolve, reject) => {
    const subscription = bus.signal_subscribe(null, 'org.freedesktop.portal.Request', 'Response', requestPath, null, Gio.DBusSignalFlags.NONE, (_c, _s, _p, _i, _n, params) => {
      bus.signal_unsubscribe(subscription);
      const [code, results] = params.recursiveUnpack();
      if (code === 0) resolve(results);
      else reject(Object.assign(new Error(code === 1 ? 'The operator declined the keyboard permission.' : 'The keyboard permission request was interrupted.'), { denied: code === 1 }));
    });
    call(method, buildParams(token)).catch((err) => {
      bus.signal_unsubscribe(subscription);
      reject(err);
    });
  });
}

async function startSession(restoreToken) {
  const created = await request('CreateSession', (token) =>
    new GLib.Variant('(a{sv})', [vardict({ handle_token: ['s', token], session_handle_token: ['s', `${token}_session`] })])
  );
  const handle = created.session_handle;
  bus.signal_subscribe(null, 'org.freedesktop.portal.Session', 'Closed', handle, null, Gio.DBusSignalFlags.NONE, () => {
    // Revoked from the desktop's sharing indicator
    if (session?.handle === handle) session = null;
  });
  await request('SelectDevices', (token) =>
    new GLib.Variant('(oa{sv})', [
      handle,
      vardict({
        handle_token: ['s', token],
        types: ['u', DEVICE_KEYBOARD],
        persist_mode: ['u', PERSIST_UNTIL_REVOKED],
        ...(restoreToken ? { restore_token: ['s', restoreToken] } : {}),
      }),
    ])
  );
  const started = await request('Start', (token) => new GLib.Variant('(osa{sv})', [handle, '', vardict({ handle_token: ['s', token] })]));
  if (!((started.devices ?? DEVICE_KEYBOARD) & DEVICE_KEYBOARD)) throw new Error('The keyboard was not shared.');
  return { handle, restoreToken: started.restore_token || null, devices: started.devices ?? DEVICE_KEYBOARD };
}

async function ensureSession(restoreToken) {
  if (session) return session;
  starting ??= startSession(restoreToken).finally(() => (starting = null));
  session = await starting;
  return session;
}

function key(keysym, pressed) {
  if (!session) throw new Error('The keyboard session has ended.');
  return call('NotifyKeyboardKeysym', new GLib.Variant('(oa{sv}iu)', [session.handle, {}, keysym, pressed ? 1 : 0]));
}

const COMMANDS = {
  async start({ restore_token: restoreToken }) {
    const { restoreToken: token, devices } = await ensureSession(restoreToken);
    return { restore_token: token, devices };
  },
  async type({ keysyms }) {
    for (const keysym of keysyms) {
      await key(keysym, true);
      await key(keysym, false);
      await sleep(KEY_GAP_MS);
    }
    return { count: keysyms.length };
  },
  async chord({ keysyms }) {
    for (const keysym of keysyms) await key(keysym, true);
    await sleep(KEY_GAP_MS);
    for (const keysym of [...keysyms].reverse()) await key(keysym, false);
    return { count: keysyms.length };
  },
  async stop() {
    quitSoon();
    return {};
  },
};

function closeSession() {
  if (!session) return;
  try {
    bus.call_sync(BUS_NAME, session.handle, 'org.freedesktop.portal.Session', 'Close', null, null, Gio.DBusCallFlags.NONE, 2000, null);
  } catch {
    // Already closed
  }
  session = null;
}

function quitSoon() {
  GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
    closeSession();
    loop.quit();
    return GLib.SOURCE_REMOVE;
  });
}

function touchIdleTimer() {
  if (idleTimer) GLib.source_remove(idleTimer);
  idleTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, IDLE_EXIT_MS, () => {
    idleTimer = 0;
    quitSoon();
    return GLib.SOURCE_REMOVE;
  });
}

// One command at a time, in arrival order, so keystrokes never interleave
let queue = Promise.resolve();
function handleLine(line) {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return;
  }
  touchIdleTimer();
  queue = queue.then(async () => {
    const handler = COMMANDS[message.cmd];
    try {
      if (!handler) throw new Error(`Unknown command "${message.cmd}".`);
      send({ id: message.id, ok: true, ...(await handler(message)) });
    } catch (err) {
      send({ id: message.id, ok: false, error: err.message, denied: Boolean(err.denied) });
    }
  });
}

const stdin = new Gio.DataInputStream({ base_stream: new GioUnix.InputStream({ fd: 0, close_fd: false }) });
function readNext() {
  stdin.read_line_async(GLib.PRIORITY_DEFAULT, null, (stream, res) => {
    let line = null;
    try {
      [line] = stream.read_line_finish_utf8(res);
    } catch {
      // Treated as end of input
    }
    if (line === null) {
      quitSoon(); // The server went away
      return;
    }
    if (line.trim()) handleLine(line);
    readNext();
  });
}

touchIdleTimer();
readNext();
send({ ready: true });
loop.run();
