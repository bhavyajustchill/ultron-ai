/**
 * Live tool `run_terminal_command`: Shell commands behind the on-screen authorization card.
 */
export default {
  declaration: {
    name: 'run_terminal_command',
    description: 'Runs a shell command on the operator\'s computer (bash, with their normal PATH). Read-only commands (ls, df, git status, version checks, ...) run immediately; anything else waits until the operator clicks AUTHORIZE on a confirmation card in the HUD (voice approval is not possible) and is cancelled after 90 seconds without a decision. sudo and destructive system commands are refused. Foreground commands time out after 2 minutes; set background for dev servers or watchers (output goes to a log file). Returns exit code and output.',
    parameters: {
      type: 'OBJECT',
      properties: {
        command: {
          type: 'STRING',
          description: 'One command line (chain steps with && if needed).',
        },
        working_directory: {
          type: 'STRING',
          description: 'Directory to run in, e.g. "~/dev/my-app" (default: home folder).',
        },
        reason: {
          type: 'STRING',
          description: 'One sentence shown on the confirmation card explaining why you want to run it.',
        },
        background: {
          type: 'BOOLEAN',
          description: 'Start without waiting for it to finish (servers, watchers). Always needs authorization.',
        },
      },
      required: ['command', 'reason'],
    },
  },

  async run(args, ctx) {
    ctx.log(`[TERMINAL] Ultron requests: \`${args.command || ''}\``);
    try {
      return await ctx.runCommandWithApproval(
        { command: args.command, cwd: args.working_directory, reason: args.reason, background: args.background },
        ctx.log
      );
    } catch (err) {
      return { status: 'FAILED', message: err.message };
    }
  },
};
