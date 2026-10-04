import { getJson } from '@/lib/tools/http';

/**
 * Live tool `get_weather`: Live weather for a city or the operator's location, mirrored into the Intel panel.
 */
export default {
  declaration: {
    name: 'get_weather',
    description: 'Retrieves exact real-time live meteorological metrics and atmospheric status for any city or operator\'s current location (e.g. current temperature in °C and °F, apparent/feels-like temperature, conditions like Sunny/Rain/Cloudy/Thunderstorm, humidity percentage, wind speed in km/h, precipitation in mm, and daily forecast). Can also launch the interactive Google Weather card on the operator\'s desktop browser if requested.',
    parameters: {
      type: 'OBJECT',
      properties: {
        city: {
          type: 'STRING',
          description: 'Target city or location name (e.g. "Delhi", "New York", "Tokyo", "London", "Paris"). Leave blank or set to "current" for the operator\'s local sector.',
        },
        open_browser: {
          type: 'BOOLEAN',
          description: 'Set to true if the operator explicitly asks to see, display, or open the weather dashboard in their browser or on screen.',
        },
      },
    },
  },

  async run(args, ctx) {
    const city = args.city || '';
    const openBrowser = Boolean(args.open_browser);
    ctx.log(`[WEATHER INTEL] Interrogating meteorological telemetry for: "${city || 'Current Sector'}"...`);

    let weather = null;
    try {
      weather = await getJson(`/api/weather?city=${encodeURIComponent(city)}&open_browser=${openBrowser}`);
    } catch (err) {
      console.error('[tools/get_weather] Weather fetch error:', err);
    }

    if (!weather?.success) {
      const message = `Unable to establish meteorological link for "${city || 'current location'}".`;
      ctx.log(`[WEATHER INTEL] ${message}`);
      return { status: 'FAILED', message };
    }

    const { location: loc, current: cur, forecast: fc } = weather;
    ctx.log(
      `[WEATHER INTEL] Atmospheric feed synchronized for ${loc.name}: ${cur.temperature_c}°C (${cur.condition}, Feels ${cur.feels_like_c}°C, Humidity ${cur.humidity_percent}%)${weather.browser_opened ? ' [Desktop browser dashboard launched]' : ''}.`
    );
    ctx.store.getState().addIntelResult({
      query: `Weather in ${loc.full_address || loc.name}`,
      mode: 'weather',
      summary: weather.summary,
      results: [
        {
          title: `Current Atmospheric Conditions: ${loc.name}`,
          snippet: `Temperature: ${cur.temperature_c}°C (${cur.temperature_f}°F) | Condition: ${cur.condition} | Feels Like: ${cur.feels_like_c}°C | Humidity: ${cur.humidity_percent}% | Wind: ${cur.wind_speed_kmh} km/h | Precipitation: ${cur.precipitation_mm}mm | Today: Low ${fc.today_min_c}°C / High ${fc.today_max_c}°C`,
          source: `Live Meteorological Telemetry (${weather.dataSource})`,
        },
      ],
    });
    return {
      status: 'SUCCESS',
      location: loc.full_address || loc.name,
      temperature_celsius: cur.temperature_c,
      temperature_fahrenheit: cur.temperature_f,
      apparent_feels_like_c: cur.feels_like_c,
      apparent_feels_like_f: cur.feels_like_f,
      condition: cur.condition,
      humidity_percentage: cur.humidity_percent,
      wind_speed_kmh: cur.wind_speed_kmh,
      precipitation_mm: cur.precipitation_mm,
      today_high_c: fc.today_max_c,
      today_low_c: fc.today_min_c,
      today_high_f: fc.today_max_f,
      today_low_f: fc.today_min_f,
      spoken_summary: weather.summary,
      browser_opened: weather.browser_opened,
    };
  },
};
