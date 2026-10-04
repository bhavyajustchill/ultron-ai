/**
 * Live tool `youtube_player`: Built-in YouTube player panel.
 */
export default {
  declaration: {
    name: 'youtube_player',
    description: 'Controls the built-in YouTube player panel in the HUD: play searches YouTube and starts the best match (the other results become the up-next queue); pause, resume, next, previous, stop, volume (0-100), now_playing.',
    parameters: {
      type: 'OBJECT',
      properties: {
        action: {
          type: 'STRING',
          description: 'Player action.',
          enum: ['play', 'pause', 'resume', 'next', 'previous', 'stop', 'volume', 'now_playing'],
        },
        query: {
          type: 'STRING',
          description: 'play only: what to search for (song, video, topic, channel).',
        },
        volume: {
          type: 'NUMBER',
          description: 'volume only: level from 0 to 100.',
        },
      },
      required: ['action'],
    },
  },

  async run(args, ctx) {
    const action = args.action || 'play';
    const store = ctx.store.getState();
    const { youtube } = store;
    const describe = (video) => ({ title: video.title, channel: video.channel, duration: video.duration, live: video.live });
    let output;

    if (action === 'play') {
      ctx.log(`[MEDIA] Searching YouTube for "${args.query || ''}"...`);
      try {
        const { video, message } = await ctx.media.playYouTubeQuery(args.query || '');
        output = video ? { status: 'PLAYING', ...describe(video) } : { status: 'NOT_FOUND', message };
      } catch (err) {
        output = { status: 'FAILED', message: err.message };
      }
    } else if (!youtube.isOpen || youtube.queue.length === 0) {
      output = { status: 'IDLE', message: 'Nothing is loaded in the HUD YouTube player.' };
    } else if (action === 'pause' || action === 'resume') {
      store.sendYouTubeCommand(action === 'pause' ? 'pause' : 'play');
      output = { status: action === 'pause' ? 'PAUSED' : 'PLAYING', ...describe(youtube.queue[youtube.index]) };
    } else if (action === 'next' || action === 'previous') {
      const index = Math.min(Math.max(youtube.index + (action === 'next' ? 1 : -1), 0), youtube.queue.length - 1);
      store.setYouTube({ index, isPlaying: true });
      output = { status: 'PLAYING', ...describe(youtube.queue[index]) };
    } else if (action === 'volume') {
      const level = Math.min(100, Math.max(0, Math.round(Number(args.volume) || 0)));
      store.sendYouTubeCommand('volume', level);
      output = { status: 'OK', volume: level };
    } else if (action === 'stop') {
      store.setYouTube({ isOpen: false });
      output = { status: 'STOPPED' };
    } else {
      output = { status: youtube.isPlaying ? 'PLAYING' : 'PAUSED', ...describe(youtube.queue[youtube.index]) };
    }

    ctx.log(`[MEDIA] YouTube ${action.toUpperCase()}: ${output.title || output.message || output.status}`);
    return output;
  },
};
