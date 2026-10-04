import { chromium } from 'playwright-core';
import { findBrowser } from '@/lib/browserAgent';
import { fetchHeadlines } from '@/lib/topicMonitors';

/**
 * Web search sources for Jarvis when Gemini's Google Search grounding is unavailable (Phase 9.2).
 * findSources() returns candidate pages for a query; lib/groundedSearch.js then has Gemini read
 * them. Order: a configured search API (Brave Search API, Google Programmable Search, Serper),
 * else keyless sources in parallel — Brave Search's results page, Google News RSS (news), and
 * Wikipedia — topped up from Bing's RSS feed (relevance-filtered: it often matches only the first
 * word) and, when there are no web results or headlines at all, a DuckDuckGo search in a headless
 * browser.
 *
 * Test overrides: JARVIS_BRAVE_HTML_BASE, JARVIS_BING_RSS_BASE, JARVIS_BING_NEWS_RSS_BASE,
 * JARVIS_WIKIPEDIA_API, JARVIS_BRAVE_API_BASE, JARVIS_GOOGLE_CSE_BASE, JARVIS_SERPER_BASE,
 * JARVIS_NEWS_RSS_BASE (lib/topicMonitors), JARVIS_HEADLESS_SEARCH=0 (skip the browser).
 */

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const BRAVE_HTML_BASE = process.env.JARVIS_BRAVE_HTML_BASE || 'https://search.brave.com/search';
const BING_RSS_BASE = process.env.JARVIS_BING_RSS_BASE || 'https://www.bing.com/search';
const BING_NEWS_RSS_BASE = process.env.JARVIS_BING_NEWS_RSS_BASE || 'https://www.bing.com/news/search';
const WIKIPEDIA_API = process.env.JARVIS_WIKIPEDIA_API || 'https://en.wikipedia.org/w/api.php';
const BRAVE_API_BASE = process.env.JARVIS_BRAVE_API_BASE || 'https://api.search.brave.com/res/v1';
const GOOGLE_CSE_BASE = process.env.JARVIS_GOOGLE_CSE_BASE || 'https://www.googleapis.com/customsearch/v1';
const SERPER_BASE = process.env.JARVIS_SERPER_BASE || 'https://google.serper.dev';
const MAX_RESULTS = 8;
// Brave answers 429 when asked too often; leave it alone for a while after that
const BRAVE_COOLDOWN_MS = 10 * 60 * 1000;
let braveRestingUntil = 0;

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

const NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };

export function decodeEntities(text) {
  return String(text || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&([a-z]+);/gi, (match, name) => NAMED_ENTITIES[name.toLowerCase()] ?? match);
}

/**
 * Readable text of an HTML page or fragment: the main / article element when there is one,
 * without scripts, styles, navigation, or markup.
 */
export function htmlToText(html) {
  let body = String(html || '').replace(/<(script|style|noscript|svg|template|iframe|head|nav|footer|form)\b[\s\S]*?<\/\1>/gi, ' ');
  const main = body.match(/<(main|article)\b[\s\S]*?<\/\1>/i)?.[0];
  if (main && main.length > 500) body = main;
  return decodeEntities(body.replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|tr)>/gi, '\n').replace(/<[^>]+>/g, ' '))
    .replace(/[ \t\f\v ]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

export function hostnameOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'Web source';
  }
}

const STOPWORDS = new Set(
  'a an the of in on at to for and or is are was were be been what who whom whose which when where why how does do did vs versus with about from by latest today current currently now me my i you your it its this that these those please tell show find search look up give get there any some much many'.split(' ')
);

/**
 * The words of a query that a relevant result should mention.
 */
export function keywords(query) {
  return [...new Set(String(query).toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 1 && !STOPWORDS.has(w)))];
}

// Share of the query's words a result mentions: whole words, or inside a longer word for words of
// five letters or more (so "pi" never matches "wikipedia")
function relevance(result, words) {
  if (!words.length) return 1;
  const haystack = `${result.title} ${result.snippet} ${result.url}`.toLowerCase();
  const tokens = new Set(haystack.split(/[^\p{L}\p{N}]+/u));
  return words.filter((w) => tokens.has(w) || (w.length >= 5 && haystack.includes(w))).length / words.length;
}

function dedupe(results) {
  const seen = new Set();
  return results.filter((r) => {
    if (!r.url) return false;
    const key = r.url.replace(/^https?:\/\/(www\.)?/, '').replace(/[/#?]+$/, '');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function fetchText(url, init = {}, timeoutMs = 8000) {
  const res = await fetch(url, {
    ...init,
    headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9', ...init.headers },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

const xmlItems = (xml) => [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, item]) => item);
const xmlTag = (xml, name) => decodeEntities(xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`))?.[1] || '').trim();
const toIso = (date) => {
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

// ---------------------------------------------------------------------------
// Keyless sources
// ---------------------------------------------------------------------------

/**
 * Brave Search's own results page (server-rendered).
 */
export async function braveHtml(query) {
  if (braveRestingUntil > Date.now()) throw new Error('resting after a rate limit');
  let html;
  try {
    html = await fetchText(`${BRAVE_HTML_BASE}?q=${encodeURIComponent(query)}`, { headers: { Accept: 'text/html,application/xhtml+xml' } });
  } catch (err) {
    if (/HTTP 429/.test(err.message)) braveRestingUntil = Date.now() + BRAVE_COOLDOWN_MS;
    throw err;
  }
  return html
    .split('data-type="web"')
    .slice(1)
    .map((block) => {
      const segment = block.slice(0, 12000);
      const url = decodeEntities(segment.match(/<a href="(https?:\/\/[^"]+)"/)?.[1] || '');
      const title = decodeEntities(segment.match(/class="title search-snippet-title[^"]*"[^>]*title="([^"]*)"/)?.[1] || '');
      const snippet = segment.match(/class="(?:snippet-description|generic-snippet)[^"]*"[^>]*>([\s\S]*?)<\/div>/)?.[1];
      if (!url || !title || /(^|\.)brave\.com$/.test(hostnameOf(url))) return null;
      return { title, url, snippet: snippet ? htmlToText(snippet).slice(0, 400) : '', source: hostnameOf(url), provider: 'brave' };
    })
    .filter(Boolean);
}

/**
 * Bing's RSS feeds (web or news). Results are often matched on the first word only, so callers
 * filter them for relevance.
 */
export async function bingRss(query, { news = false } = {}) {
  const xml = await fetchText(`${news ? BING_NEWS_RSS_BASE : BING_RSS_BASE}?format=rss&q=${encodeURIComponent(query)}`);
  return xmlItems(xml)
    .map((item) => {
      let url = xmlTag(item, 'link');
      // News links go through a click tracker carrying the article in `url`
      try {
        const tracked = new URL(url);
        if (tracked.pathname.includes('apiclick') && tracked.searchParams.get('url')) url = tracked.searchParams.get('url');
      } catch {
        return null;
      }
      const title = xmlTag(item, 'title');
      if (!title || !/^https?:/.test(url)) return null;
      return { title, url, snippet: htmlToText(xmlTag(item, 'description')).slice(0, 400), source: xmlTag(item, 'News:Source') || hostnameOf(url), published: toIso(xmlTag(item, 'pubDate')), provider: 'bing-rss' };
    })
    .filter(Boolean);
}

/**
 * Google News headlines (keyless RSS), newest first.
 */
export async function googleNews(query) {
  const headlines = await fetchHeadlines(query);
  return headlines.slice(0, 10).map((h) => ({
    title: h.title,
    url: h.link,
    snippet: [h.source, h.published ? new Date(h.published).toDateString() : ''].filter(Boolean).join(', '),
    source: h.source || 'Google News',
    published: h.published,
    provider: 'google-news',
  }));
}

export async function wikipedia(query) {
  const data = JSON.parse(await fetchText(`${WIKIPEDIA_API}?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=3&utf8=1`, {}, 6000));
  return (data.query?.search || []).map((page) => ({
    title: page.title,
    url: `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`,
    snippet: htmlToText(page.snippet),
    source: 'Wikipedia',
    provider: 'wikipedia',
  }));
}

/**
 * DuckDuckGo in a throwaway headless browser (an installed Chrome / Edge / Brave / Chromium), for
 * when every plain request is blocked. Separate from the visible Jarvis browser window.
 */
export async function headlessSearch(query) {
  const browser = findBrowser();
  if (!browser) throw new Error('no installed browser');
  const instance = await chromium.launch({ executablePath: browser.executablePath, headless: true });
  try {
    const context = await instance.newContext({ userAgent: UA, locale: 'en-US' });
    const page = await context.newPage();
    await page.goto(`https://duckduckgo.com/?q=${encodeURIComponent(query)}&ia=web`, { timeout: 20000 });
    await page.waitForSelector('[data-testid="result"]', { timeout: 10000 });
    const found = await page.evaluate(() =>
      [...document.querySelectorAll('[data-testid="result"]')].map((el) => {
        const anchor = el.querySelector('a[data-testid="result-title-a"]');
        const snippet = el.querySelector('[data-result="snippet"]');
        return anchor ? { title: anchor.innerText.trim(), url: anchor.href, snippet: (snippet?.innerText || '').trim() } : null;
      })
    );
    return found.filter((r) => r && /^https?:/.test(r.url)).map((r) => ({ ...r, snippet: r.snippet.slice(0, 400), source: hostnameOf(r.url), provider: 'duckduckgo-browser' }));
  } finally {
    await instance.close().catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Optional search APIs (used first when a key is configured)
// ---------------------------------------------------------------------------

const SEARCH_APIS = [
  {
    name: 'brave-api',
    enabled: () => Boolean(process.env.BRAVE_SEARCH_API_KEY),
    async search(query, news) {
      const data = JSON.parse(
        await fetchText(`${BRAVE_API_BASE}/${news ? 'news' : 'web'}/search?q=${encodeURIComponent(query)}&count=${MAX_RESULTS}`, {
          headers: { Accept: 'application/json', 'X-Subscription-Token': process.env.BRAVE_SEARCH_API_KEY },
        })
      );
      return ((news ? data.results : data.web?.results) || []).map((r) => ({
        title: decodeEntities(r.title),
        url: r.url,
        snippet: htmlToText(r.description || ''),
        source: r.meta_url?.hostname?.replace(/^www\./, '') || hostnameOf(r.url),
        ...(r.page_age ? { published: toIso(r.page_age) } : {}),
      }));
    },
  },
  {
    name: 'google-cse',
    enabled: () => Boolean(process.env.GOOGLE_CSE_API_KEY && process.env.GOOGLE_CSE_ID),
    async search(query, news) {
      const params = new URLSearchParams({ key: process.env.GOOGLE_CSE_API_KEY, cx: process.env.GOOGLE_CSE_ID, q: query, num: String(MAX_RESULTS), ...(news ? { sort: 'date' } : {}) });
      const data = JSON.parse(await fetchText(`${GOOGLE_CSE_BASE}?${params}`, { headers: { Accept: 'application/json' } }));
      return (data.items || []).map((r) => ({ title: r.title, url: r.link, snippet: r.snippet || '', source: r.displayLink?.replace(/^www\./, '') || hostnameOf(r.link) }));
    },
  },
  {
    name: 'serper',
    enabled: () => Boolean(process.env.SERPER_API_KEY),
    async search(query, news) {
      const data = JSON.parse(
        await fetchText(`${SERPER_BASE}/${news ? 'news' : 'search'}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-API-KEY': process.env.SERPER_API_KEY },
          body: JSON.stringify({ q: query, num: MAX_RESULTS }),
        })
      );
      return ((news ? data.news : data.organic) || []).map((r) => ({ title: r.title, url: r.link, snippet: r.snippet || '', source: r.source || hostnameOf(r.link), ...(r.date ? { published: r.date } : {}) }));
    },
  },
];

export const configuredSearchApis = () => SEARCH_APIS.filter((api) => api.enabled()).map((api) => api.name);

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Candidate pages for a query: { results: [{ title, url, snippet, source, published?, provider }],
 * providers: [names that contributed], failures: ["name: reason"] }.
 */
export async function findSources(query, mode = 'search') {
  const news = mode === 'news';
  const words = keywords(query);
  const failures = [];
  const attempt = (name, promise) =>
    promise.catch((err) => {
      failures.push(`${name}: ${err.message}`);
      return [];
    });
  const finish = (results) => {
    const unique = dedupe(results).slice(0, MAX_RESULTS);
    return { results: unique, providers: [...new Set(unique.map((r) => r.provider))], failures };
  };

  for (const api of SEARCH_APIS.filter((candidate) => candidate.enabled())) {
    const results = await attempt(api.name, api.search(query, news));
    if (results.length) return finish(results.map((r) => ({ ...r, provider: api.name })));
  }

  const [brave, headlines, wiki] = await Promise.all([
    attempt('brave', braveHtml(query)),
    news ? attempt('google-news', googleNews(query)) : [],
    mode === 'search' || mode === 'research' ? attempt('wikipedia', wikipedia(query)) : [],
  ]);
  let web = dedupe(brave.filter((r) => relevance(r, words) > 0));
  if (web.length < 3) {
    // Top up from Bing; with no web results and no headlines at all, also search in a browser
    const useBrowser = !web.length && !headlines.length && process.env.JARVIS_HEADLESS_SEARCH !== '0';
    const [bing, browser] = await Promise.all([
      attempt('bing-rss', bingRss(query, { news })),
      useBrowser ? attempt('duckduckgo-browser', headlessSearch(query)) : [],
    ]);
    web = dedupe([...web, ...browser.filter((r) => relevance(r, words) > 0), ...bing.filter((r) => relevance(r, words) >= 0.5)]);
  }

  const encyclopedic = wiki.filter((r) => relevance(r, words) >= 0.5).slice(0, 1);
  return finish(news ? [...headlines.slice(0, 6), ...web.slice(0, 3)] : [...web.slice(0, 6), ...encyclopedic]);
}
