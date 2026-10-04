import { spawn } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { generateText } from '@/lib/geminiText';
import { resolveSafePath, displayPath } from '@/lib/fsSandbox';
import { findExecutable } from '@/lib/desktopLauncher';
import { prepareConfirm, cancelConfirm } from '@/lib/confirmGate';

/**
 * Autonomous dev agent (Phase 8.11): writes a small multi-file Python or Node project for a
 * request, installs its dependencies inside the project (Python venv; npm with install scripts
 * disabled), and — after the operator authorises it on the HUD card — runs it, reads the errors,
 * and asks Gemini for fixes, up to 5 attempts. Runs as a background job the HUD follows.
 *
 * Test overrides: JARVIS_DEV_PROJECTS_DIR, JARVIS_DEV_RUN_TIMEOUT_MS, JARVIS_DEV_SERVER_SETTLE_MS.
 */

const PROJECTS_DIR = process.env.JARVIS_DEV_PROJECTS_DIR || '~/Desktop/UltronProjects';
const MAX_ATTEMPTS = 5;
const MAX_FILES = 12;
const MAX_FILE_BYTES = 100 * 1024;
const MAX_DEPENDENCIES = 15;
const SCRIPT_TIMEOUT_MS = Number(process.env.JARVIS_DEV_RUN_TIMEOUT_MS ?? 30000);
const SERVER_SETTLE_MS = Number(process.env.JARVIS_DEV_SERVER_SETTLE_MS ?? 6000);
const INSTALL_TIMEOUT_MS = 4 * 60 * 1000;
const APPROVAL_WAIT_MS = 3 * 60 * 1000;
const OUTPUT_TAIL = 6000;
const LANGUAGES = { python: 'Python 3', node: 'Node.js (JavaScript)' };
// Plain registry names only: no URLs, paths, git specs, or flags
const PACKAGE_NAME = { python: /^[A-Za-z0-9][A-Za-z0-9._-]{0,80}(\[[A-Za-z0-9,_-]+\])?([<>=!~]=?[0-9][0-9a-zA-Z.*]*)?$/, node: /^(@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]{0,80}(@[0-9^~][0-9a-zA-Z.^~*-]*)?$/ };

export class DevAgentError extends Error {}

const jobs = globalThis.__jarvisDevJobs || (globalThis.__jarvisDevJobs = new Map());

function log(job, line) {
  job.log.push(line);
  if (job.log.length > 200) job.log.shift();
  job.step = line;
}

function parseJson(text) {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '');
  try {
    return JSON.parse(cleaned);
  } catch {
    throw new DevAgentError('The model did not return a usable project description.');
  }
}

/**
 * Keeps a model-proposed path inside the project: relative, no "..", no hidden VCS / env folders.
 */
function safeRelativePath(projectDir, file) {
  const rel = String(file || '').replace(/\\/g, '/').replace(/^\.\/+/, '');
  if (!rel || rel.startsWith('/') || /^[a-z]:/i.test(rel) || rel.split('/').some((part) => part === '..' || part === '.git' || part === '.venv' || part === 'node_modules')) return null;
  const full = path.resolve(/*turbopackIgnore: true*/ projectDir, rel);
  return full.startsWith(projectDir + path.sep) ? full : null;
}

function writeFiles(job, files) {
  const written = [];
  for (const file of (files || []).slice(0, MAX_FILES)) {
    const target = safeRelativePath(job.dir, file.path);
    if (!target) {
      log(job, `Skipped an unsafe file path from the model: ${file.path}`);
      continue;
    }
    const content = String(file.content ?? '');
    if (Buffer.byteLength(content) > MAX_FILE_BYTES) {
      log(job, `Skipped ${file.path}: larger than ${MAX_FILE_BYTES / 1024} KB.`);
      continue;
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content, 'utf-8');
    written.push(path.relative(job.dir, target));
  }
  for (const rel of written) if (!job.files.includes(rel)) job.files.push(rel);
  return written;
}

function readProjectFiles(job) {
  let budget = 120000;
  return job.files
    .map((rel) => {
      const content = fs.existsSync(path.join(job.dir, rel)) ? fs.readFileSync(path.join(job.dir, rel), 'utf-8') : '';
      const slice = content.slice(0, Math.max(0, budget));
      budget -= slice.length;
      return `--- ${rel} ---\n${slice}`;
    })
    .join('\n\n');
}

/**
 * Runs a program in the project folder without a shell; kills the whole process group on timeout.
 * Resolves { code, output, timedOut, stillRunning }.
 */
function runProcess(command, args, cwd, { timeoutMs, settleMs } = {}) {
  return new Promise((resolve) => {
    let output = '';
    const child = spawn(command, args, { cwd, detached: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PYTHONUNBUFFERED: '1', CI: '1', NO_COLOR: '1' } });
    const append = (chunk) => {
      output = (output + chunk.toString()).slice(-OUTPUT_TAIL);
    };
    child.stdout.on('data', append);
    child.stderr.on('data', append);
    const kill = () => {
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {
        // Already gone
      }
    };
    let finished = false;
    const finish = (result) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve({ ...result, output: output.trim() });
    };
    const timer = setTimeout(() => {
      kill();
      finish(settleMs ? { code: null, stillRunning: true } : { code: null, timedOut: true });
    }, settleMs || timeoutMs);
    child.on('error', (err) => finish({ code: -1, error: err.message }));
    child.on('close', (code) => finish({ code }));
  });
}

async function installDependencies(job, dependencies) {
  const wanted = [...new Set((dependencies || []).map((d) => String(d).trim()).filter(Boolean))].filter((d) => !job.dependencies.includes(d));
  if (!wanted.length) return true;
  const rejected = wanted.filter((d) => !PACKAGE_NAME[job.language].test(d));
  if (rejected.length) log(job, `Ignored dependency names that are not plain package names: ${rejected.join(', ')}`);
  const accepted = wanted.filter((d) => PACKAGE_NAME[job.language].test(d)).slice(0, MAX_DEPENDENCIES - job.dependencies.length);
  if (!accepted.length) return true;
  log(job, `Installing ${accepted.join(', ')}`);

  let result;
  if (job.language === 'python') {
    if (!fs.existsSync(path.join(job.dir, '.venv'))) {
      const venv = await runProcess(job.python, ['-m', 'venv', '.venv'], job.dir, { timeoutMs: INSTALL_TIMEOUT_MS });
      if (venv.code !== 0) {
        log(job, `Could not create a virtual environment: ${venv.output.slice(-300)}`);
        return false;
      }
    }
    result = await runProcess(path.join(job.dir, '.venv', 'bin', 'pip'), ['install', '--disable-pip-version-check', '--prefer-binary', ...accepted], job.dir, { timeoutMs: INSTALL_TIMEOUT_MS });
  } else {
    // --ignore-scripts: packages chosen by a model never get to run install hooks
    result = await runProcess(job.npm, ['install', '--ignore-scripts', '--no-audit', '--no-fund', ...accepted], job.dir, { timeoutMs: INSTALL_TIMEOUT_MS });
  }
  if (result.code !== 0) {
    log(job, `Dependency install failed: ${result.output.slice(-400)}`);
    return false;
  }
  job.dependencies.push(...accepted);
  return true;
}

function runCommand(job) {
  if (job.language === 'python') {
    const venvPython = path.join(job.dir, '.venv', 'bin', 'python');
    return [fs.existsSync(venvPython) ? venvPython : job.python, [job.entry]];
  }
  return [process.execPath, [job.entry]];
}

const commandLabel = (job) => `${job.language === 'python' ? 'python' : 'node'} ${job.entry}`;

async function runOnce(job) {
  const [command, args] = runCommand(job);
  if (job.kind === 'server') {
    const result = await runProcess(command, args, job.dir, { settleMs: SERVER_SETTLE_MS });
    // A server that is still up after the settle time counts as working
    return { ok: Boolean(result.stillRunning), output: result.output || '(no output)', detail: result.stillRunning ? `still running after ${SERVER_SETTLE_MS / 1000}s` : `exited with code ${result.code}` };
  }
  const result = await runProcess(command, args, job.dir, { timeoutMs: SCRIPT_TIMEOUT_MS });
  if (result.timedOut) return { ok: false, output: `${result.output}\n[Stopped after ${SCRIPT_TIMEOUT_MS / 1000}s: the script did not finish (waiting for input or looping).]`, detail: 'timed out' };
  return { ok: result.code === 0, output: result.output || '(no output)', detail: `exit code ${result.code}` };
}

function waitForApproval(job) {
  job.request = prepareConfirm({
    title: `Run "${job.name}"`,
    detail: `${commandLabel(job)}  (in ${displayPath(job.dir)})\nFiles: ${job.files.join(', ')}${job.dependencies.length ? `\nDependencies: ${job.dependencies.join(', ')}` : ''}`,
    warnings: [`Runs code Ultron just wrote on this computer, up to ${MAX_ATTEMPTS} times while fixing errors.`],
    payload: { action: 'dev_agent_run', jobId: job.id },
  });
  job.status = 'awaiting_approval';
  log(job, 'Waiting for the operator to authorize running it on the HUD');
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), APPROVAL_WAIT_MS);
    job.resolveApproval = (approved) => {
      clearTimeout(timer);
      resolve(approved);
    };
  });
}

async function plan(job, apiKey) {
  const rules =
    job.language === 'python'
      ? 'Use Python 3 and the standard library unless a package is truly needed; "dependencies" are pip package names; "entry" is the .py file to run.'
      : 'Use Node.js with ES modules ("type": "module" in package.json, which you must include); "dependencies" are npm package names; "entry" is the .js file to run.';
  const text = await generateText({
    apiKey,
    json: true,
    timeoutMs: 180000,
    prompt: `You are a senior engineer. Write a complete, working ${LANGUAGES[job.language]} project for this request:\n"${job.task}"\n\nRespond with JSON only:\n{"name": "short-kebab-case-name", "summary": "one sentence", "kind": "script" or "server", "entry": "path of the file to run", "dependencies": ["package"], "files": [{"path": "relative/path", "content": "full file content"}]}\n\nRules: ${rules} At most ${MAX_FILES - 2} files, including a short README.md with usage. Never read interactive input (no input(), no readline prompts): use constants or command-line arguments with sensible defaults. A script must print its result and exit by itself; a server must listen on a port from 8000 up and print a line when it is ready. No placeholder code: everything must run.`,
  });
  return parseJson(text);
}

async function fix(job, failure, apiKey) {
  const text = await generateText({
    apiKey,
    json: true,
    timeoutMs: 180000,
    prompt: `This ${LANGUAGES[job.language]} project fails when run with "${commandLabel(job)}" (${failure.detail}). Find the cause and fix it.\n\nRespond with JSON only: {"explanation": "one sentence", "files": [{"path": "relative/path", "content": "full new content"}], "dependencies": ["any additional package"]}. Include only files that change, each with its complete new content. The project must still satisfy the original request: "${job.task}".\n\nOutput of the failed run:\n${failure.output.slice(-4000)}\n\nProject files:\n${readProjectFiles(job)}`,
  });
  return parseJson(text);
}

async function pipeline(job, apiKey) {
  try {
    log(job, 'Planning and writing the code');
    const project = await plan(job, apiKey);
    const slug = String(project.name || job.name || 'ultron-project').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'ultron-project';
    let dir = path.join(/*turbopackIgnore: true*/ job.root, slug);
    for (let n = 2; fs.existsSync(dir); n++) dir = path.join(/*turbopackIgnore: true*/ job.root, `${slug}-${n}`);
    fs.mkdirSync(dir, { recursive: true });
    Object.assign(job, { dir, name: path.basename(dir), summary: project.summary || '', kind: project.kind === 'server' ? 'server' : 'script' });
    const written = writeFiles(job, project.files);
    if (!written.length) throw new DevAgentError('The model returned no files.');
    const entryPath = safeRelativePath(dir, project.entry);
    const entry = entryPath ? path.relative(dir, entryPath) : null;
    job.entry = entry && job.files.includes(entry) ? entry : job.files.find((f) => (job.language === 'python' ? /\.py$/ : /\.m?js$/).test(f));
    if (!job.entry) throw new DevAgentError('The model did not provide a file to run.');
    if (job.language === 'node' && !fs.existsSync(path.join(dir, 'package.json'))) {
      fs.writeFileSync(path.join(dir, 'package.json'), `${JSON.stringify({ name: job.name, version: '1.0.0', private: true, type: 'module' }, null, 2)}\n`);
      job.files.push('package.json');
    }
    log(job, `Wrote ${job.files.length} file(s) to ${displayPath(dir)}: ${job.files.join(', ')}`);
    await installDependencies(job, project.dependencies);

    const approved = await waitForApproval(job);
    job.request = null;
    if (!approved) {
      job.status = 'not_run';
      log(job, 'Not authorized, so the code was written but not run');
      return;
    }

    job.status = 'running';
    for (job.attempts = 1; job.attempts <= MAX_ATTEMPTS; job.attempts++) {
      log(job, `Running ${commandLabel(job)} (attempt ${job.attempts} of ${MAX_ATTEMPTS})`);
      const result = await runOnce(job);
      job.lastOutput = result.output.slice(-1500);
      if (result.ok) {
        job.status = 'succeeded';
        log(job, `Works (${result.detail}) after ${job.attempts} attempt(s)`);
        return;
      }
      log(job, `Failed (${result.detail}): ${result.output.split('\n').filter(Boolean).slice(-2).join(' | ').slice(0, 300)}`);
      if (job.attempts === MAX_ATTEMPTS) break;
      log(job, 'Asking for a fix');
      const repair = await fix(job, result, apiKey);
      const changed = writeFiles(job, repair.files);
      job.fixes.push(repair.explanation || `Changed ${changed.join(', ')}`);
      log(job, `Fix: ${repair.explanation || 'updated files'} (${changed.join(', ') || 'no file changes'})`);
      await installDependencies(job, repair.dependencies);
    }
    job.status = 'failed';
    job.error = `Still failing after ${MAX_ATTEMPTS} attempts.`;
  } catch (err) {
    job.status = 'failed';
    job.error = err.message;
    log(job, `Stopped: ${err.message}`);
  } finally {
    if (job.request) cancelConfirm(job.request.id);
    job.request = null;
    job.finishedAt = Date.now();
  }
}

export function startDevJob({ task, language = 'python', apiKey }) {
  const description = String(task || '').trim();
  if (description.length < 8) throw new DevAgentError('Describe what the program should do.');
  const lang = /^(js|javascript|node|nodejs)$/i.test(language) ? 'node' : /^py(thon)?3?$/i.test(language) ? 'python' : null;
  if (!lang) throw new DevAgentError('The dev agent writes Python or Node.js projects.');
  if (!apiKey) throw new DevAgentError('The dev agent uses Gemini and needs the API key.');
  if ([...jobs.values()].some((j) => ['running', 'awaiting_approval'].includes(j.status))) throw new DevAgentError('A dev agent job is already in progress; wait for it to finish.');
  const root = resolveSafePath(PROJECTS_DIR);
  const python = findExecutable(['python3', 'python']);
  if (lang === 'python' && !python) throw new DevAgentError('Python 3 is not installed.');
  const npm = findExecutable(['npm']);
  if (lang === 'node' && !npm) throw new DevAgentError('npm is not installed.');

  const job = {
    id: crypto.randomUUID(),
    task: description.slice(0, 2000),
    language: lang,
    root,
    python,
    npm,
    status: 'running',
    step: 'Starting',
    log: [],
    files: [],
    dependencies: [],
    fixes: [],
    attempts: 0,
    startedAt: Date.now(),
  };
  jobs.set(job.id, job);
  pipeline(job, apiKey);
  return snapshot(job);
}

/**
 * Called when the HUD card's AUTHORIZE (or DENY) settles the run request.
 */
export function settleDevApproval(jobId, approved) {
  const job = jobs.get(jobId);
  if (!job?.resolveApproval) return false;
  job.resolveApproval(approved);
  job.resolveApproval = null;
  return true;
}

export function snapshot(job) {
  return {
    id: job.id,
    status: job.status,
    step: job.step,
    task: job.task,
    language: job.language,
    name: job.name || null,
    path: job.dir ? displayPath(job.dir) : null,
    files: job.files,
    dependencies: job.dependencies,
    entry: job.entry || null,
    kind: job.kind || null,
    attempts: job.attempts,
    fixes: job.fixes,
    error: job.error || null,
    lastOutput: job.lastOutput || '',
    log: job.log,
    request: job.status === 'awaiting_approval' ? job.request : null,
    elapsedSeconds: Math.round(((job.finishedAt || Date.now()) - job.startedAt) / 1000),
  };
}

export function getDevJob(id) {
  const job = jobs.get(id);
  return job ? snapshot(job) : null;
}
