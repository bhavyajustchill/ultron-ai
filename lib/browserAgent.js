import fs from 'fs';
import os from 'os';
import path from 'path';
import { chromium } from 'playwright-core';

/**
 * Browser automation for Jarvis (Phase 8.10): a visible browser window that Jarvis drives with
 * Playwright — open pages, search, click, fill forms, read text / links / tables, scroll, tabs,
 * screenshots. It uses an installed Chrome, Edge, or Brave with its OWN persistent profile
 * (logins made there stick), never the operator's everyday profile, so page content Jarvis reads
 * can never reach the operator's real sessions. Only http(s) pages; downloads are off; password
 * fields are left for the operator to type.
 *
 * Test overrides: JARVIS_BROWSER_HEADLESS=1, JARVIS_BROWSER_PROFILE, JARVIS_BROWSER_EXECUTABLE.
 */

const PROFILE_DIR = process.env.JARVIS_BROWSER_PROFILE || path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'), 'ultron', 'browser-profile');
const SCREENSHOT_DIR = process.env.JARVIS_SCREENSHOT_DIR || path.join(os.homedir(), 'Pictures', 'Ultron Screenshots');
const NAV_TIMEOUT_MS = 30000;
const ACTION_TIMEOUT_MS = 10000;
const IDLE_CLOSE_MS = 30 * 60 * 1000;
const MAX_TEXT = 20000;

export class BrowserError extends Error {}

// Route handlers are bundled separately: one shared browser, one action at a time
const state = globalThis.__jarvisBrowser || (globalThis.__jarvisBrowser = { context: null, launching: null, queue: Promise.resolve(), idleTimer: null, browserName: null });

const BROWSERS = [
  { name: 'Chrome', channel: 'chrome', paths: ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/opt/google/chrome/chrome', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'] },
  { name: 'Edge', channel: 'msedge', paths: ['/usr/bin/microsoft-edge', '/usr/bin/microsoft-edge-stable', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'] },
  { name: 'Brave', paths: ['/usr/bin/brave-browser', '/usr/bin/brave', '/snap/bin/brave', 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe', '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'] },
  { name: 'Chromium', paths: ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium'] },
];

export function findBrowser() {
  if (process.env.JARVIS_BROWSER_EXECUTABLE) return { name: 'Custom', executablePath: process.env.JARVIS_BROWSER_EXECUTABLE };
  for (const browser of BROWSERS) {
    const found = browser.paths.find((p) => fs.existsSync(p));
    if (found) return { name: browser.name, executablePath: found };
  }
  return null;
}

function scheduleIdleClose() {
  clearTimeout(state.idleTimer);
  state.idleTimer = setTimeout(() => closeBrowser().catch(() => {}), IDLE_CLOSE_MS);
}

async function getContext() {
  if (state.context) return state.context;
  if (state.launching) return state.launching;
  const browser = findBrowser();
  if (!browser) throw new BrowserError('No Chrome, Edge, Brave, or Chromium is installed for Ultron to drive.');
  fs.mkdirSync(PROFILE_DIR, { recursive: true });
  state.launching = chromium
    .launchPersistentContext(PROFILE_DIR, {
      executablePath: browser.executablePath,
      headless: process.env.JARVIS_BROWSER_HEADLESS === '1',
      // Headless Chrome announces itself, and search engines then serve no results; the visible
      // window (normal use) sends Chrome's own user agent
      ...(process.env.JARVIS_BROWSER_HEADLESS === '1' ? { userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36' } : {}),
      viewport: null,
      acceptDownloads: false,
      args: ['--no-first-run', '--no-default-browser-check'],
    })
    .then((context) => {
      state.context = context;
      state.browserName = browser.name;
      context.setDefaultNavigationTimeout(NAV_TIMEOUT_MS);
      context.setDefaultTimeout(ACTION_TIMEOUT_MS);
      context.on('close', () => {
        state.context = null;
      });
      return context;
    })
    .catch((err) => {
      throw new BrowserError(/ProcessSingleton|profile.*in use|lock/i.test(err.message) ? 'The Ultron browser profile is already open in another window.' : `The browser could not start: ${err.message.split('\n')[0]}`);
    })
    .finally(() => {
      state.launching = null;
    });
  return state.launching;
}

async function activePage() {
  const context = await getContext();
  const pages = context.pages().filter((p) => !p.isClosed());
  return state.activePage && !state.activePage.isClosed() ? state.activePage : pages.at(-1) || (await context.newPage());
}

/**
 * Runs browser actions one at a time (Jarvis may fire tool calls back to back).
 */
function enqueue(fn) {
  const run = state.queue.then(fn, fn);
  state.queue = run.catch(() => {});
  scheduleIdleClose();
  return run;
}

export function normalizeUrl(input) {
  let text = String(input || '').trim();
  if (!text) throw new BrowserError('Give a web address.');
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text) && !/^(javascript|data|file|about|chrome|view-source):/i.test(text)) {
    // Local machines and LAN hosts usually serve plain http (dev servers, routers)
    const host = text.split(/[/?#]/)[0].replace(/:\d+$/, '');
    const local = /^(localhost|127(\.\d+){3}|10(\.\d+){3}|192\.168(\.\d+){2}|172\.(1[6-9]|2\d|3[01])(\.\d+){2}|\[::1\]|.+\.local)$/i.test(host);
    text = `${local ? 'http' : 'https'}://${text}`;
  }
  let url;
  try {
    url = new URL(text);
  } catch {
    throw new BrowserError(`"${input}" is not a web address.`);
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new BrowserError('Ultron only opens http and https pages.');
  return url.href;
}

async function pageSummary(page) {
  const text = await readableText(page);
  return { url: page.url(), title: await page.title(), text_preview: text.slice(0, 1500) };
}

async function readableText(page) {
  return page.evaluate(() => {
    const root = document.querySelector('main, article, [role="main"]') || document.body;
    return (root?.innerText || '').replace(/\n{3,}/g, '\n\n').trim();
  });
}

async function settle(page) {
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 4000 }).catch(() => {});
}

const SEARCH_ENGINES = {
  google: (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}&hl=en`,
  bing: (q) => `https://www.bing.com/search?q=${encodeURIComponent(q)}`,
  duckduckgo: (q) => `https://duckduckgo.com/?q=${encodeURIComponent(q)}`,
};

async function searchResults(page) {
  return page.evaluate(() => {
    const seen = new Set();
    const results = [];
    // Bing wraps results in bing.com/ck/a?...&u=a1<base64url target> redirects
    const unwrap = (href) => {
      try {
        const url = new URL(href);
        if (/bing\.com$/.test(url.hostname) && url.pathname.startsWith('/ck/')) {
          const encoded = (url.searchParams.get('u') || '').replace(/^a1/, '').replace(/-/g, '+').replace(/_/g, '/');
          return atob(encoded + '='.repeat((4 - (encoded.length % 4)) % 4));
        }
      } catch {
        // Not a wrapped link
      }
      return href;
    };
    const add = (anchor, titleEl) => {
      const href = anchor?.href ? unwrap(anchor.href) : null;
      const title = (titleEl?.innerText || anchor?.innerText || '').trim();
      if (!href || !title || seen.has(href) || !/^https?:/.test(href) || /google\.|bing\.com\/(search|ck)|duckduckgo\.com\/(\?|y\.js)/.test(href)) return;
      seen.add(href);
      results.push({ title: title.slice(0, 160), url: href });
    };
    document.querySelectorAll('a h3').forEach((h3) => add(h3.closest('a'), h3)); // Google
    document.querySelectorAll('li.b_algo h2 a').forEach((a) => add(a, a)); // Bing
    document.querySelectorAll('a[data-testid="result-title-a"]').forEach((a) => add(a, a)); // DuckDuckGo
    return results.slice(0, 10);
  });
}

const looksLikeSelector = (text) => /^[#.[]|^[a-z]+[#.[:]|>|^\/\//i.test(String(text).trim());

async function findClickable(page, target) {
  if (looksLikeSelector(target)) return page.locator(target).first();
  for (const role of ['link', 'button', 'menuitem', 'tab', 'checkbox', 'radio']) {
    const byRole = page.getByRole(role, { name: target });
    if (await byRole.count()) return byRole.first();
  }
  const byText = page.getByText(target, { exact: false });
  if (await byText.count()) return byText.first();
  throw new BrowserError(`Nothing clickable matches "${target}" on this page.`);
}

async function findField(page, field) {
  if (looksLikeSelector(field)) return page.locator(field).first();
  const attr = String(field).replace(/["\\]/g, '');
  const candidates = [
    page.getByLabel(field),
    page.getByPlaceholder(field),
    page.getByRole('textbox', { name: field }),
    page.getByRole('searchbox', { name: field }),
    page.getByRole('combobox', { name: field }),
    page.locator(`[name="${attr}"], [id="${attr}"]`),
  ];
  for (const locator of candidates) {
    try {
      if (await locator.count()) return locator.first();
    } catch {
      // Invalid selector for this field name: try the next strategy
    }
  }
  throw new BrowserError(`No form field matches "${field}" on this page.`);
}

// A navigation can be cut short by a leftover one (e.g. an error page still loading): retry once
async function gotoWithRetry(page, url) {
  try {
    await page.goto(url);
  } catch (err) {
    if (!/interrupted by another navigation/i.test(err.message)) throw err;
    await page.waitForTimeout(500);
    await page.goto(url);
  }
}

const ACTIONS = {
  async open({ url }) {
    const page = await activePage();
    await gotoWithRetry(page, normalizeUrl(url));
    await settle(page);
    return { message: `Opened ${await page.title() || page.url()}.`, ...(await pageSummary(page)) };
  },

  async search({ query, engine = 'duckduckgo' }) {
    if (!query) throw new BrowserError('Give something to search for.');
    const build = SEARCH_ENGINES[engine] || SEARCH_ENGINES.duckduckgo;
    const page = await activePage();
    await gotoWithRetry(page, build(query));
    await settle(page);
    const results = await searchResults(page);
    return {
      message: results.length ? `${results.length} result(s) for "${query}".` : `The ${engine} page opened but no results could be read (it may be asking to verify a human); the window is on screen.`,
      results,
      url: page.url(),
    };
  },

  async click({ target }) {
    if (!target) throw new BrowserError('Say what to click (its text or a CSS selector).');
    const page = await activePage();
    const element = await findClickable(page, target);
    const context = page.context();
    const popup = context.waitForEvent('page', { timeout: 1500 }).catch(() => null);
    await element.click();
    const opened = await popup;
    if (opened) state.activePage = opened;
    const current = opened || page;
    await settle(current);
    return { message: `Clicked "${target}"${opened ? ' (it opened a new tab)' : ''}.`, ...(await pageSummary(current)) };
  },

  async fill({ field, value, submit }) {
    if (!field) throw new BrowserError('Name the field to fill.');
    const page = await activePage();
    const input = await findField(page, field);
    const type = (await input.getAttribute('type').catch(() => '')) || '';
    if (type.toLowerCase() === 'password') throw new BrowserError('Ultron does not type passwords; the operator enters those directly in the browser window.');
    await input.fill(String(value ?? ''));
    if (submit) {
      await input.press('Enter');
      await settle(page);
    }
    return { message: `Filled "${field}"${submit ? ' and submitted' : ''}.`, url: page.url(), title: await page.title() };
  },

  async press({ key }) {
    const page = await activePage();
    await page.keyboard.press(String(key || 'Enter'));
    await settle(page);
    return { message: `Pressed ${key || 'Enter'}.`, url: page.url() };
  },

  async extract({ what = 'text', selector }) {
    const page = await activePage();
    if (what === 'links') {
      const links = await page.$$eval(selector ? `${selector} a[href]` : 'a[href]', (anchors) =>
        anchors.map((a) => ({ text: (a.innerText || a.title || '').trim().slice(0, 120), url: a.href })).filter((l) => l.text && /^https?:/.test(l.url)).slice(0, 100)
      );
      return { message: `${links.length} link(s) on ${await page.title()}.`, links };
    }
    if (what === 'tables') {
      const tables = await page.$$eval(selector ? `${selector} table, ${selector}` : 'table', (nodes) =>
        nodes.filter((n) => n.tagName === 'TABLE').slice(0, 5).map((table) => [...table.rows].slice(0, 50).map((row) => [...row.cells].map((cell) => cell.innerText.trim().slice(0, 200))))
      );
      return { message: tables.length ? `${tables.length} table(s) read.` : 'There are no tables on this page.', tables };
    }
    const text = selector ? await page.locator(selector).first().innerText() : await readableText(page);
    return { message: `Read ${text.length} characters from ${await page.title()}${text.length > MAX_TEXT ? ' (first part returned)' : ''}.`, text: text.slice(0, MAX_TEXT), url: page.url() };
  },

  async scroll({ direction = 'down', amount }) {
    const page = await activePage();
    const pixels = Number(amount) || 800;
    await page.evaluate(({ direction: d, pixels: px }) => {
      if (d === 'top') window.scrollTo(0, 0);
      else if (d === 'bottom') window.scrollTo(0, document.body.scrollHeight);
      else window.scrollBy(0, d === 'up' ? -px : px);
    }, { direction, pixels });
    return { message: `Scrolled ${direction}.` };
  },

  async screenshot({ full_page: fullPage }) {
    const page = await activePage();
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    const file = path.join(/*turbopackIgnore: true*/ SCREENSHOT_DIR, `browser-${new Date().toISOString().replace(/[:.]/g, '-')}.png`);
    await page.screenshot({ path: file, fullPage: Boolean(fullPage) });
    // A smaller JPEG for Jarvis to look at
    const preview = await page.screenshot({ type: 'jpeg', quality: 70, fullPage: false });
    return { message: `Screenshot saved to ${file.replace(os.homedir(), '~')}.`, path: file, image_base64: preview.toString('base64'), url: page.url(), title: await page.title() };
  },

  async back() {
    const page = await activePage();
    await page.goBack();
    await settle(page);
    return { message: 'Went back.', ...(await pageSummary(page)) };
  },

  async tabs({ tab_action: tabAction = 'list', index, url }) {
    const context = await getContext();
    const pages = context.pages().filter((p) => !p.isClosed());
    if (tabAction === 'new') {
      const page = await context.newPage();
      state.activePage = page;
      if (url) {
        await page.goto(normalizeUrl(url));
        await settle(page);
      }
      return { message: `Opened a new tab${url ? ` on ${await page.title()}` : ''}.` };
    }
    if (tabAction === 'switch' || tabAction === 'close') {
      const page = pages[Number(index) - 1];
      if (!page) throw new BrowserError(`There is no tab ${index} (${pages.length} open).`);
      if (tabAction === 'close') {
        await page.close();
        state.activePage = null;
        return { message: `Closed tab ${index}.` };
      }
      state.activePage = page;
      await page.bringToFront();
      return { message: `Switched to tab ${index}: ${await page.title()}.` };
    }
    const list = await Promise.all(pages.map(async (p, i) => ({ tab: i + 1, title: await p.title(), url: p.url() })));
    return { message: `${list.length} tab(s) open.`, tabs: list };
  },

  async status() {
    const browser = findBrowser();
    return { message: state.context ? `The ${state.browserName} window is open (${state.context.pages().length} tab(s)).` : browser ? `${browser.name} is available; the Ultron window is closed.` : 'No supported browser is installed.', open: Boolean(state.context), browser: browser?.name || null };
  },

  async close() {
    const wasOpen = await closeBrowser();
    return { message: wasOpen ? 'Closed the Ultron browser window.' : 'The Ultron browser was not open.' };
  },
};

export async function closeBrowser() {
  clearTimeout(state.idleTimer);
  const context = state.context;
  state.context = null;
  state.activePage = null;
  if (!context) return false;
  await context.close().catch(() => {});
  return true;
}

export const BROWSER_ACTIONS = Object.keys(ACTIONS);

export function runBrowserAction(action, options = {}) {
  const handler = ACTIONS[action];
  if (!handler) throw new BrowserError(`Unknown browser action "${action}". Use: ${BROWSER_ACTIONS.join(', ')}.`);
  if (action === 'status' || action === 'close') return handler(options);
  return enqueue(() => handler(options));
}
