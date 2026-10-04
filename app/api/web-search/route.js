import { NextResponse } from 'next/server';
import { fetchLiveWeather } from '../weather/route';
import crypto from 'crypto';
import { groundedSearch, knowledgeAnswer, readAndAnswer } from '@/lib/groundedSearch';
import { findSources } from '@/lib/searchProviders';

// Keys without grounding quota answer 429 every time: skip the attempt for a while after one
const GROUNDING_RETRY_MS = 30 * 60 * 1000;
const groundingRefusedUntil = new Map();
const keyId = (apiKey) => crypto.createHash('sha256').update(apiKey).digest('hex').slice(0, 16);

/**
 * Clean and decode DuckDuckGo redirect URLs
 */
function cleanUrl(rawUrl) {
  if (!rawUrl) return '';
  if (rawUrl.startsWith('//')) {
    rawUrl = 'https:' + rawUrl;
  }
  try {
    const urlObj = new URL(rawUrl);
    if (urlObj.searchParams.has('uddg')) {
      return decodeURIComponent(urlObj.searchParams.get('uddg'));
    }
  } catch {
    // Return original if parsing fails
  }
  return rawUrl;
}

/**
 * Strip HTML tags and entities
 */
function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();
}

/**
 * Extract search results from DuckDuckGo HTML
 */
function parseDuckDuckGoHtml(html) {
  const results = [];
  // Match each result block
  const resultRegex = /<div class="result results_links results_links_deep[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/g;
  let match;

  while ((match = resultRegex.exec(html)) !== null && results.length < 5) {
    const block = match[1];

    // Extract Title & URL
    const titleMatch = /<a class="result__url"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(block) ||
                       /<a class="result__snippet"[^>]*href="([^"]+)"[^>]*>/i.exec(block);

    const titleAnchor = /<h2 class="result__title">[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(block);

    const rawUrl = titleAnchor ? titleAnchor[1] : (titleMatch ? titleMatch[1] : '');
    const title = titleAnchor ? stripHtml(titleAnchor[2]) : 'Intelligence Report';

    // Extract Snippet
    const snippetMatch = /<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i.exec(block);
    const snippet = snippetMatch ? stripHtml(snippetMatch[1]) : '';

    const url = cleanUrl(rawUrl);
    let sourceDomain = 'Web Intel';
    try {
      if (url.startsWith('http')) {
        sourceDomain = new URL(url).hostname.replace('www.', '');
      }
    } catch {
      // fallback
    }

    if (title && snippet) {
      results.push({
        title,
        snippet,
        url,
        source: sourceDomain,
      });
    }
  }

  return results;
}

/**
 * Fallback to DuckDuckGo Instant Answer API
 */
async function fetchInstantAnswer(query) {
  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 Ultron/1.0' } });
    if (!res.ok) return [];

    const data = await res.json();
    const results = [];

    if (data.AbstractText) {
      results.push({
        title: data.Heading || query,
        snippet: data.AbstractText,
        url: data.AbstractURL || 'https://duckduckgo.com/?q=' + encodeURIComponent(query),
        source: data.AbstractSource || 'DuckDuckGo Knowledge',
      });
    }

    if (data.RelatedTopics && Array.isArray(data.RelatedTopics)) {
      for (const topic of data.RelatedTopics.slice(0, 4)) {
        if (topic.Text && topic.FirstURL) {
          results.push({
            title: topic.Text.split(' - ')[0] || topic.Text.slice(0, 60),
            snippet: topic.Text,
            url: topic.FirstURL,
            source: 'Related Intel',
          });
        }
      }
    }

    return results;
  } catch (err) {
    console.error('[web-search] Instant Answer fallback error:', err);
    return [];
  }
}

/**
 * GET /api/web-search?query=...&mode=...
 * Performs real-time web search and returns structured intelligence cards.
 * 1. Gemini with Google Search grounding (key from the x-gemini-api-key header or GEMINI_API_KEY).
 * 2. Search then read (Phase 9.2): candidate pages from lib/searchProviders (a configured search
 *    API, else Brave Search, Google News, Wikipedia, Bing RSS, a headless DuckDuckGo search), read
 *    and summarised by Gemini with citations; without a key, the results themselves.
 * 3. DuckDuckGo HTML, then the DuckDuckGo Instant Answer API.
 * 4. The model's own knowledge, labelled as not live.
 */
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const items = (searchParams.get('items') || '').split('|').map((item) => item.trim()).filter(Boolean);
    const mode = items.length > 1 ? 'compare' : searchParams.get('mode') || 'search'; // search | news | research | price | compare
    // Compare mode folds the items into the query so every engine sees them
    const rawQuery = (searchParams.get('query') || '').trim();
    const query = mode === 'compare' && items.length > 1 ? `${items.join(' vs ')}${rawQuery ? ` (${rawQuery})` : ''}` : rawQuery;

    if (!query) {
      return NextResponse.json(
        { error: 'MISSING_QUERY', message: 'Query parameter is required' },
        { status: 400 }
      );
    }

    // Weather safety interception: detect if query is asking about weather/temperature/forecast
    const weatherKeywords = /\b(weather|temperature|temp|forecast|climate|rain|raining|humidity|wind speed)\b/i;
    if (weatherKeywords.test(query)) {
      // Extract target location if present: e.g. "weather in Delhi", "temperature in Tokyo", "forecast for London"
      let targetCity = '';
      const cityMatch =
        query.match(/(?:weather|temperature|temp|forecast|climate|rain|humidity)\s+(?:in|for|at|around|near)?\s*([a-zA-Z\s]+)/i) ||
        query.match(/([a-zA-Z\s]+)\s+(?:weather|temperature|temp|forecast|climate)/i);

      if (cityMatch && cityMatch[1]) {
        targetCity = cityMatch[1]
          .replace(/\b(?:today|tomorrow|now|currently|tonight|please|show|get|tell|me|what is|how is)\b/gi, '')
          .trim();
      }

      try {
        const weatherIntel = await fetchLiveWeather(targetCity, false);
        if (weatherIntel && weatherIntel.success) {
          const loc = weatherIntel.location;
          const cur = weatherIntel.current;
          const fc = weatherIntel.forecast;

          const results = [
            {
              title: `Live Atmospheric Telemetry: ${loc.full_address || loc.name}`,
              snippet: `${cur.temperature_c}°C (${cur.temperature_f}°F) — ${cur.condition}. Feels like ${cur.feels_like_c}°C. Humidity: ${cur.humidity_percent}%. Wind: ${cur.wind_speed_kmh} km/h. Precipitation: ${cur.precipitation_mm}mm. High: ${fc.today_max_c}°C / Low: ${fc.today_min_c}°C.`,
              url: `https://www.google.com/search?q=weather+in+${encodeURIComponent(loc.full_address || loc.name)}`,
              source: `Meteorological Telemetry (${weatherIntel.dataSource})`,
            },
          ];

          return NextResponse.json({
            success: true,
            query,
            mode: 'weather',
            count: 1,
            timestamp: new Date().toLocaleTimeString(),
            summary: weatherIntel.summary,
            results,
            weatherData: weatherIntel,
          });
        }
      } catch (weatherErr) {
        console.warn('[/api/web-search] Weather interception failed, proceeding to standard web search:', weatherErr.message);
      }
    }

    // 1. Grounded Gemini search (Google Search tool) when a key is available
    const apiKey = req.headers.get('x-gemini-api-key') || process.env.GEMINI_API_KEY || '';
    if (apiKey && !(groundingRefusedUntil.get(keyId(apiKey)) > Date.now())) {
      try {
        const grounded = await groundedSearch(query, mode, apiKey);
        return NextResponse.json({
          success: true,
          query,
          mode,
          engine: 'gemini-grounded',
          count: grounded.results.length,
          timestamp: new Date().toLocaleTimeString(),
          summary: grounded.summary,
          results: grounded.results,
          search_queries: grounded.queries,
        });
      } catch (groundedErr) {
        if (/\((429|403)\)/.test(groundedErr.message)) groundingRefusedUntil.set(keyId(apiKey), Date.now() + GROUNDING_RETRY_MS);
        console.warn('[/api/web-search] Grounded search failed, searching and reading pages instead:', groundedErr.message);
      }
    }

    // 2. Search then read
    let found = { results: [], providers: [], failures: [] };
    try {
      found = await findSources(query, mode);
    } catch (sourcesErr) {
      console.warn('[/api/web-search] Search sources failed:', sourcesErr.message);
    }
    if (found.failures.length) console.warn('[/api/web-search] Unavailable sources:', found.failures.join('; '));
    if (found.results.length) {
      const base = { success: true, query, mode, providers: found.providers, timestamp: new Date().toLocaleTimeString() };
      if (apiKey) {
        try {
          const answer = await readAndAnswer(query, mode, found.results, apiKey);
          return NextResponse.json({
            ...base,
            engine: answer.engine,
            count: answer.results.length,
            summary: answer.summary,
            results: answer.results,
            sources_read: answer.read,
          });
        } catch (readErr) {
          console.warn('[/api/web-search] Reading the results failed, returning them as found:', readErr.message);
        }
      }
      const top = found.results
        .slice(0, 4)
        .map((r, i) => `${i + 1}. ${r.title} (${r.source})${r.snippet ? `: ${r.snippet.slice(0, 160)}` : ''}`)
        .join('\n');
      return NextResponse.json({
        ...base,
        engine: found.providers.join('+'),
        count: found.results.length,
        summary: `Found ${found.results.length} live results for "${query}" (search snippets; the pages were not read${apiKey ? '' : ' because no Gemini key is connected'}):\n${top}`,
        results: found.results,
      });
    }

    // 3. DuckDuckGo HTML Search
    let results = [];
    let engine = 'duckduckgo';
    try {
      const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(
        mode === 'news' ? `${query} latest news` : query
      )}`;

      const res = await fetch(searchUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        next: { revalidate: 60 },
      });

      if (res.ok) {
        const html = await res.text();
        results = parseDuckDuckGoHtml(html);
      }
    } catch (htmlErr) {
      console.warn('[web-search] HTML parser failed, using fallback:', htmlErr.message);
    }

    // Instant Answer API if HTML parsed zero results
    if (results.length === 0) {
      results = await fetchInstantAnswer(query);
      engine = 'duckduckgo-instant';
    }

    // No live results: fall back to the model's own knowledge, explicitly labelled as not live
    if (results.length === 0 && apiKey) {
      try {
        const answer = await knowledgeAnswer(query, mode, apiKey);
        return NextResponse.json({
          success: true,
          query,
          mode,
          engine: 'gemini-knowledge',
          live: false,
          count: 0,
          timestamp: new Date().toLocaleTimeString(),
          summary: `Live web search is unavailable right now, so this comes from built-in knowledge and may be out of date (say so when answering): ${answer}`,
          results: [],
        });
      } catch (knowledgeErr) {
        console.warn('[/api/web-search] Knowledge fallback failed:', knowledgeErr.message);
      }
    }

    // Nothing retrieved: say so plainly rather than inventing a result Jarvis would repeat as fact
    if (results.length === 0) {
      return NextResponse.json({
        success: true,
        query,
        mode,
        engine: 'none',
        count: 0,
        timestamp: new Date().toLocaleTimeString(),
        summary: `No live web results could be retrieved for "${query}" right now${apiKey ? '' : ' (connect a Gemini API key to enable grounded Google Search)'}.`,
        results: [],
      });
    }

    // Compose concise takeaway summary for Jarvis to speak
    const topSnippets = results
      .slice(0, 3)
      .map((r, i) => `${i + 1}. ${r.title}: ${r.snippet.slice(0, 140)}...`)
      .join('\n');

    const summary = `Found ${results.length} intelligence items for "${query}":\n${topSnippets}`;

    return NextResponse.json({
      success: true,
      query,
      mode,
      engine,
      count: results.length,
      timestamp: new Date().toLocaleTimeString(),
      summary,
      results,
    });
  } catch (error) {
    console.error('[/api/web-search] Error:', error);
    return NextResponse.json(
      {
        error: 'SEARCH_ERROR',
        message: error.message || 'Failed to execute web intelligence search',
      },
      { status: 500 }
    );
  }
}
