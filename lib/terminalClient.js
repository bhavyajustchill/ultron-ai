import { useAdaStore } from '@/lib/store';

/**
 * Client side of the terminal authorization flow (Phase 7.7): prepare on the server, show the
 * HUD confirmation card when the command is not read-only, and run only after the operator
 * clicks AUTHORIZE. Shared by the voice tool and the `jarvis-run-command` window event.
 */

const APPROVAL_TIMEOUT_MS = 90 * 1000;
const MODEL_OUTPUT_CHARS = 8000;
const resolvers = new Map();

async function postTerminal(body) {
  const res = await fetch('/api/terminal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

const tail = (text) => (text.length > MODEL_OUTPUT_CHARS ? `…${text.slice(-MODEL_OUTPUT_CHARS)}` : text);

function requestApproval(request) {
  return new Promise((resolve) => {
    let timer;
    const settle = (decision) => {
      clearTimeout(timer);
      resolvers.delete(request.id);
      if (useAdaStore.getState().pendingCommand?.id === request.id) useAdaStore.getState().setPendingCommand(null);
      resolve(decision);
    };
    timer = setTimeout(() => settle('timeout'), APPROVAL_TIMEOUT_MS);
    resolvers.set(request.id, settle);
    useAdaStore.getState().setPendingCommand({ ...request, expiresAt: Date.now() + APPROVAL_TIMEOUT_MS });
  });
}

/**
 * Called by the confirmation card's buttons.
 */
export function respondToCommand(id, approved) {
  resolvers.get(id)?.(approved ? 'approved' : 'denied');
}

/**
 * Prepare → (operator authorization when required) → run. `log` receives Comms Log lines.
 * Returns a tool-friendly result: { status, message?, exit_code?, stdout?, stderr?, ... }.
 */
export async function runCommandWithApproval({ command, cwd, reason, background }, log = () => {}) {
  const prepared = await postTerminal({ action: 'prepare', command, cwd, reason, background });
  if (!prepared.success) {
    log(`[TERMINAL] ${prepared.message}`);
    return { status: 'REFUSED', message: prepared.message };
  }

  const { request } = prepared;
  let decision = 'auto';
  if (request.needs_confirmation) {
    log(`[TERMINAL] Awaiting operator authorization on the HUD: \`${request.command}\``);
    decision = await requestApproval(request);
    if (decision !== 'approved') {
      postTerminal({ action: 'cancel', id: request.id }).catch(() => {});
      const message =
        decision === 'timeout'
          ? 'The operator did not authorize the command within 90 seconds, so it was not run.'
          : 'The operator denied the command, so it was not run.';
      log(`[TERMINAL] ${message}`);
      return { status: decision === 'timeout' ? 'TIMED_OUT_WAITING' : 'DENIED_BY_OPERATOR', message };
    }
  }

  const ran = await postTerminal({ action: 'run', id: request.id, token: request.token, confirmed: decision === 'approved' });
  if (!ran.success) {
    log(`[TERMINAL] Failed: ${ran.message}`);
    return { status: 'FAILED', message: ran.message };
  }

  const result = ran.result;
  if (result.background) {
    log(`[TERMINAL] Started in the background (pid ${result.pid}); output is logged to ${result.log_path}.`);
    return { status: 'STARTED_IN_BACKGROUND', ...result };
  }

  const preview = (result.stdout || result.stderr).trim().slice(0, 600);
  log(
    `[TERMINAL] ${result.timed_out ? 'Timed out' : `Exit ${result.exit_code}`} after ${(result.duration_ms / 1000).toFixed(1)}s — \`${request.command}\`${preview ? `\n\`\`\`\n${preview}\n\`\`\`` : ''}`
  );
  return {
    status: result.timed_out ? 'TIMED_OUT' : result.exit_code === 0 ? 'SUCCEEDED' : 'FAILED',
    approved_by_operator: decision === 'approved',
    ...result,
    stdout: tail(result.stdout),
    stderr: tail(result.stderr),
  };
}
