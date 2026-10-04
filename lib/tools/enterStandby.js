/**
 * Live tool `enter_standby`: Signs off and closes the live link after the farewell plays.
 */
export default {
  declaration: {
    name: 'enter_standby',
    description: 'Ends the live voice link and returns Ultron to standby, where he listens only for the wake phrase. Use when the operator says goodbye, "that\'s all", "go to sleep", or asks you to stand by. After calling it, say a brief farewell.',
    parameters: {
      type: 'OBJECT',
      properties: {},
    },
  },

  run(args, ctx) {
    ctx.requestStandby();
    const phrase = ctx.store.getState().operatorProfile?.wakePhrase || ctx.defaultWakePhrase;
    ctx.log('[WAKE] Standby requested. Closing the link after Ultron signs off...');
    return {
      status: 'STANDBY_SCHEDULED',
      wake_phrase: phrase,
      message: `Say a brief farewell now; the link closes when you finish speaking. The operator can wake you with "${phrase}".`,
    };
  },
};
