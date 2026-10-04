/**
 * YouTube search for the HUD media deck (Phase 7.5). Uses the YouTube Data API when
 * YOUTUBE_API_KEY is set; otherwise reads the public results page's embedded ytInitialData.
 */

const MAX_RESULTS = 10;
const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
};

function collectVideoRenderers(node, out) {
  if (!node || typeof node !== 'object' || out.length >= MAX_RESULTS) return;
  if (node.videoRenderer?.videoId) {
    const v = node.videoRenderer;
    out.push({
      id: v.videoId,
      title: v.title?.runs?.map((r) => r.text).join('') || 'Untitled video',
      channel: v.ownerText?.runs?.[0]?.text || '',
      duration: v.lengthText?.simpleText || null,
      live: !v.lengthText,
    });
    return;
  }
  for (const value of Object.values(node)) collectVideoRenderers(value, out);
}

async function searchViaResultsPage(query) {
  const res = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, {
    headers: BROWSER_HEADERS,
  });
  if (!res.ok) throw new Error(`YouTube responded ${res.status}`);
  const html = await res.text();
  const match = html.match(/var ytInitialData = (\{.*?\});<\/script>/s);
  if (!match) throw new Error('YouTube results page format not recognised');
  const videos = [];
  collectVideoRenderers(JSON.parse(match[1]), videos);
  return videos;
}

async function searchViaDataApi(query, apiKey) {
  const params = new URLSearchParams({ part: 'snippet', type: 'video', maxResults: String(MAX_RESULTS), q: query, key: apiKey });
  const res = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`);
  if (!res.ok) throw new Error(`YouTube Data API responded ${res.status}`);
  const data = await res.json();
  return (data.items || []).map((item) => ({
    id: item.id.videoId,
    title: item.snippet.title,
    channel: item.snippet.channelTitle,
    duration: null,
    live: item.snippet.liveBroadcastContent === 'live',
  }));
}

export async function searchYouTube(query) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (apiKey) {
    try {
      return await searchViaDataApi(query, apiKey);
    } catch (err) {
      console.warn('[youtubeSearch] Data API failed, falling back to results page:', err.message);
    }
  }
  return searchViaResultsPage(query);
}
