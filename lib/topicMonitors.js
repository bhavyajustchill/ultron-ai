import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

/**
 * Topic monitors (Phase 8.6): topics the operator asks Jarvis to watch. Each is checked about once
 * a day against the Google News RSS search feed (keyless; personal feed-reader use) and raises an
 * alert when a headline appears that has not been seen before. Adding a topic records what is
 * already out there, so only genuinely new headlines are announced.
 *
 * Test overrides: JARVIS_MONITORS_FILE, JARVIS_NEWS_RSS_BASE, JARVIS_MONITOR_INTERVAL_MS.
 */

const MONITORS_FILE = path.resolve(/*turbopackIgnore: true*/ process.env.JARVIS_MONITORS_FILE || path.join(process.cwd(), 'data', 'monitors.json'));
const RSS_BASE = process.env.JARVIS_NEWS_RSS_BASE || 'https://news.google.com/rss/search';
const CHECK_INTERVAL_MS = Number(process.env.JARVIS_MONITOR_INTERVAL_MS ?? 24 * 60 * 60 * 1000);
const MAX_TOPICS = 10;
const SEEN_LIMIT = 200; // a whole feed (Google News returns up to ~100 items)

export class MonitorError extends Error {}

function readMonitors() {
  try {
    const data = JSON.parse(fs.readFileSync(MONITORS_FILE, 'utf-8'));
    return Array.isArray(data.topics) ? data.topics : [];
  } catch {
    return [];
  }
}

function writeMonitors(topics) {
  fs.mkdirSync(path.dirname(MONITORS_FILE), { recursive: true });
  fs.writeFileSync(MONITORS_FILE, JSON.stringify({ topics }, null, 2), 'utf-8');
}

const decodeXml = (text) =>
  text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&')
    .trim();

const tag = (xml, name) => {
  const match = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`));
  return match ? decodeXml(match[1]) : '';
};

const headlineHash = (title) => crypto.createHash('sha1').update(title.toLowerCase()).digest('hex').slice(0, 12);

/**
 * Latest headlines for a topic, newest first: [{ title, source, link, published }].
 */
export async function fetchHeadlines(topic) {
  const url = `${RSS_BASE}?q=${encodeURIComponent(topic)}&hl=en-US&gl=US&ceid=US:en`;
  let res;
  try {
    res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (J.A.R.V.I.S topic monitor)' }, signal: AbortSignal.timeout(15000) });
  } catch (err) {
    throw new MonitorError(`The news feed could not be reached (${err.message}).`);
  }
  if (!res.ok) throw new MonitorError(`The news feed answered HTTP ${res.status}.`);
  const xml = await res.text();
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)]
    .map(([, item]) => {
      const source = tag(item, 'source');
      const rawTitle = tag(item, 'title');
      // Google News titles end with " - Source"
      const title = source && rawTitle.endsWith(` - ${source}`) ? rawTitle.slice(0, -(source.length + 3)) : rawTitle;
      const published = new Date(tag(item, 'pubDate'));
      return { title, source, link: tag(item, 'link'), published: Number.isNaN(published.getTime()) ? null : published.toISOString() };
    })
    .filter((h) => h.title)
    .sort((a, b) => new Date(b.published || 0) - new Date(a.published || 0));
}

function findTopic(topics, name) {
  const wanted = String(name || '').toLowerCase().trim();
  return topics.find((t) => t.topic.toLowerCase() === wanted) || topics.find((t) => t.topic.toLowerCase().includes(wanted) && wanted);
}

/**
 * Starts watching a topic; returns { topic, latest } (latest headline right now, if any).
 */
export async function addMonitor(name) {
  const topic = String(name || '').replace(/\s+/g, ' ').trim();
  if (topic.length < 2 || topic.length > 80) throw new MonitorError('Give a topic between 2 and 80 characters.');
  const topics = readMonitors();
  if (topics.some((t) => t.topic.toLowerCase() === topic.toLowerCase())) throw new MonitorError(`"${topic}" is already being monitored.`);
  if (topics.length >= MAX_TOPICS) throw new MonitorError(`Jarvis watches at most ${MAX_TOPICS} topics; remove one first.`);
  const headlines = await fetchHeadlines(topic);
  topics.push({
    topic,
    addedAt: new Date().toISOString(),
    lastChecked: new Date().toISOString(),
    seen: headlines.slice(0, SEEN_LIMIT).map((h) => headlineHash(h.title)),
  });
  writeMonitors(topics);
  return { topic, latest: headlines[0] || null };
}

export function removeMonitor(name) {
  const topics = readMonitors();
  const target = findTopic(topics, name);
  if (!target) throw new MonitorError(`"${name}" is not being monitored.`);
  writeMonitors(topics.filter((t) => t !== target));
  return target.topic;
}

export function listMonitors() {
  return readMonitors().map(({ topic, addedAt, lastChecked }) => ({ topic, addedAt, lastChecked }));
}

/**
 * Checks topics whose last check is older than the interval (all of them with `force`) and returns
 * alerts for headlines never seen before: [{ topic, title, source, link, published }].
 */
export async function checkMonitors({ force = false, now = Date.now() } = {}) {
  const topics = readMonitors();
  const alerts = [];
  const errors = [];
  for (const entry of topics) {
    if (!force && now - new Date(entry.lastChecked).getTime() < CHECK_INTERVAL_MS) continue;
    try {
      const headlines = await fetchHeadlines(entry.topic);
      const seen = new Set(entry.seen || []);
      const fresh = headlines.find((h) => !seen.has(headlineHash(h.title)));
      if (fresh) alerts.push({ topic: entry.topic, ...fresh });
      entry.seen = [...new Set([...headlines.map((h) => headlineHash(h.title)), ...(entry.seen || [])])].slice(0, SEEN_LIMIT);
      entry.lastChecked = new Date(now).toISOString();
    } catch (err) {
      errors.push(`${entry.topic}: ${err.message}`);
    }
  }
  writeMonitors(topics);
  return { alerts, errors };
}
