import { postJson } from '@/lib/tools/http';

/**
 * Live tool `spotify_control`: Spotify desktop app control over MPRIS.
 */
export default {
  declaration: {
    name: 'spotify_control',
    description: 'Controls the Spotify desktop app (launching it if needed): play, pause, toggle, next, previous, now_playing, and play_song to find and play a song, artist, album, or playlist by name.',
    parameters: {
      type: 'OBJECT',
      properties: {
        action: {
          type: 'STRING',
          description: 'Spotify action.',
          enum: ['play', 'pause', 'toggle', 'next', 'previous', 'now_playing', 'play_song'],
        },
        query: {
          type: 'STRING',
          description: 'play_song only: what to play, e.g. "Bohemian Rhapsody by Queen".',
        },
      },
      required: ['action'],
    },
  },

  async run(args, ctx) {
    ctx.log(`[MEDIA] Spotify ${(args.action || '').toUpperCase()}${args.query ? ` ("${args.query}")` : ''}...`);
    let result = { success: false, message: 'Failed to contact the Spotify bridge.' };
    try {
      result = await postJson('/api/spotify', { action: args.action, query: args.query });
    } catch (err) {
      console.error('[tools/spotify_control] Spotify control error:', err);
    }
    ctx.log(`[MEDIA] ${result.success ? 'Spotify' : 'Spotify failed'}: ${result.message}`);
    return result;
  },
};
