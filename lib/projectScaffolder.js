import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { resolveSafePath, displayPath } from '@/lib/fsSandbox';
import { findExecutable, isWindows, isMac } from '@/lib/desktopLauncher';

/**
 * Project scaffolder for Jarvis (Phase 7.3): creates new projects from templates as
 * background jobs so a multi-minute `npm install` never blocks the live voice session.
 * Generators are the operator's chosen CLIs: `@bhavyajustchill/init` (Node/Express API and
 * admin panel, driven through a pseudo-terminal because it is prompt-only), create-next-app,
 * create-vite (React, JavaScript), and `flutter create`. The HUD polls job status.
 */

export class ScaffoldError extends Error {}

const STEP_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_LOG_LINES = 60;
const NPM = isWindows ? 'npm.cmd' : 'npm';
const NPX = isWindows ? 'npx.cmd' : 'npx';
const INIT_CLI = '@bhavyajustchill/init@latest';
const PROMPT_STALL_MS = 90 * 1000;

// Menu entries in the @bhavyajustchill/init template picker, matched by visible name
const INIT_CHOICES = {
  'node-express-js': 'Node Express JS MVC API',
  'node-express-ts': 'Node Express TS Modular API',
  'admin-panel': 'React Tailwind ShadCN Admin',
};

// Survive Next.js dev-server module reloads
const jobs = globalThis.__jarvisScaffoldJobs || (globalThis.__jarvisScaffoldJobs = new Map());

const toKebab = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
const toSnake = (name) => {
  const snake = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60);
  return /^[a-z]/.test(snake) ? snake : `app_${snake}`; // Dart package names must start with a letter
};

function findFlutter() {
  const home = os.homedir();
  return findExecutable(['flutter'], [
    path.join(home, 'dev', 'flutter', 'bin'),
    path.join(home, 'flutter', 'bin'),
    path.join(home, 'snap', 'flutter', 'common', 'flutter', 'bin'),
    process.env.FLUTTER_ROOT ? path.join(process.env.FLUTTER_ROOT, 'bin') : '',
  ].filter(Boolean));
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

/**
 * Builds a step that runs @bhavyajustchill/init in a pseudo-terminal and answers its prompts.
 */
const initCliStep = ({ choice, name, parent, install }) => ({
  label: `Running ${INIT_CLI} (${choice})${install ? ' and installing dependencies' : ''}`,
  pty: {
    command: [NPX, '--yes', INIT_CLI],
    prompts: [
      { question: 'What do you want to initialize?', select: choice },
      { question: 'What is your project name?', answer: `${name}\r` },
      { question: 'Do you want to install dependencies?', answer: install ? 'y\r' : 'n\r' },
    ],
    successText: 'Project created successfully',
  },
  cwd: parent,
});

const TEMPLATES = {
  flutter: {
    label: 'Flutter app',
    naming: toSnake,
    steps: ({ name, dir, parent, install }) => {
      const flutter = findFlutter();
      if (!flutter) throw new ScaffoldError('The Flutter SDK was not found on PATH or in ~/dev/flutter, ~/flutter, or the snap install.');
      return [
        {
          label: 'Generating Flutter project',
          cmd: flutter,
          args: ['create', ...(install ? [] : ['--no-pub']), '--project-name', name, dir],
          cwd: parent,
        },
      ];
    },
  },
  react: {
    label: 'React + Vite app (JavaScript)',
    naming: toKebab,
    steps: ({ name, dir, parent, install }) => [
      {
        label: 'Generating React + Vite project',
        cmd: NPM,
        args: ['create', '--yes', 'vite@latest', name, '--', '--template', 'react', '--no-interactive', '--no-immediate'],
        cwd: parent,
      },
      install && { label: 'Installing dependencies', cmd: NPM, args: ['install'], cwd: dir },
    ],
  },
  'node-express': {
    label: 'Node.js Express API',
    naming: toKebab,
    steps: ({ name, parent, install, typescript }) => [
      initCliStep({ choice: INIT_CHOICES[typescript ? 'node-express-ts' : 'node-express-js'], name, parent, install }),
    ],
  },
  nextjs: {
    label: 'Next.js app',
    naming: toKebab,
    steps: ({ name, parent, install, typescript }) => [
      {
        label: 'Generating Next.js project',
        cmd: NPX,
        args: [
          '--yes', 'create-next-app@latest', name, typescript ? '--ts' : '--js', '--app', '--tailwind', '--eslint',
          '--import-alias', '@/*', '--use-npm', '--disable-git', '--yes', ...(install ? [] : ['--skip-install']),
        ],
        cwd: parent,
      },
    ],
  },
  'admin-panel': {
    label: 'React + Tailwind + shadcn admin panel',
    naming: toKebab,
    steps: ({ name, parent, install }) => [initCliStep({ choice: INIT_CHOICES['admin-panel'], name, parent, install })],
  },
};

export const TEMPLATE_NAMES = Object.keys(TEMPLATES);
const TEMPLATE_ALIASES = { 'shadcn-admin': 'admin-panel', admin: 'admin-panel', express: 'node-express', next: 'nextjs' };

// ---------------------------------------------------------------------------
// Job runner
// ---------------------------------------------------------------------------

const stripAnsi = (text) => text.replace(/\u001b\[[0-9;?]*[A-Za-z]/g, '');

function appendLog(job, chunk) {
  const lines = stripAnsi(chunk.toString()).split(/\r?\n/).map((l) => l.trimEnd()).filter(Boolean);
  job.log.push(...lines);
  if (job.log.length > MAX_LOG_LINES) job.log.splice(0, job.log.length - MAX_LOG_LINES);
}

function runCommand(job, step) {
  return new Promise((resolve) => {
    const child = spawn(step.cmd, step.args, {
      cwd: step.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      shell: isWindows,
      env: {
        ...process.env,
        CI: '1',
        FORCE_COLOR: '0',
        NO_COLOR: '1',
        NEXT_TELEMETRY_DISABLED: '1',
        npm_config_yes: 'true',
        npm_config_fund: 'false',
        npm_config_audit: 'false',
        npm_config_update_notifier: 'false',
      },
    });
    const timer = setTimeout(() => {
      appendLog(job, `Step timed out after ${Math.round((step.timeoutMs || STEP_TIMEOUT_MS) / 60000)} minutes.`);
      child.kill('SIGTERM');
    }, step.timeoutMs || STEP_TIMEOUT_MS);
    child.stdout.on('data', (chunk) => appendLog(job, chunk));
    child.stderr.on('data', (chunk) => appendLog(job, chunk));
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ ok: false, error: err.message });
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve(code === 0 ? { ok: true } : { ok: false, error: signal ? `terminated by ${signal}` : `exited with code ${code}` });
    });
  });
}

/**
 * Wraps a command so it runs inside a pseudo-terminal (prompt libraries need a TTY).
 */
function inPseudoTerminal(command) {
  const script = findExecutable(['script']);
  if (!script || isWindows) return null;
  if (isMac) return { cmd: script, args: ['-q', '/dev/null', ...command] };
  return { cmd: script, args: ['-qec', command.join(' '), '/dev/null'] }; // util-linux
}

/**
 * Runs an interactive CLI in a pseudo-terminal, answering each prompt once it appears.
 * Select prompts are answered by arrowing down until the named choice is highlighted, so
 * the driver keeps working if the menu order changes. Fails fast on unexpected prompts.
 */
function runPromptDriven(job, step) {
  const { command, prompts, successText } = step.pty;
  const pty = inPseudoTerminal(command);
  if (!pty) {
    return Promise.resolve({ ok: false, error: 'the "script" utility (util-linux) is required to drive the interactive initializer' });
  }

  return new Promise((resolve) => {
    const child = spawn(pty.cmd, pty.args, {
      cwd: step.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        COLUMNS: '120',
        LINES: '40',
        FORCE_COLOR: '0',
        npm_config_yes: 'true',
        npm_config_fund: 'false',
        npm_config_audit: 'false',
        npm_config_update_notifier: 'false',
      },
    });

    let screen = '';
    let promptIndex = 0;
    let selectPresses = 0;
    let settled = false;
    let quietTimer;
    let stallTimer;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(quietTimer);
      clearTimeout(stallTimer);
      clearTimeout(overallTimer);
      resolve(result);
    };
    const fail = (error) => {
      child.kill('SIGTERM');
      finish({ ok: false, error });
    };
    const overallTimer = setTimeout(() => fail('timed out'), step.timeoutMs || STEP_TIMEOUT_MS);

    const armStallWatchdog = () => {
      clearTimeout(stallTimer);
      if (promptIndex < prompts.length) {
        stallTimer = setTimeout(
          () => fail(`no expected prompt appeared (waiting for "${prompts[promptIndex].question}")`),
          PROMPT_STALL_MS
        );
      }
    };

    const answerPrompts = () => {
      const prompt = prompts[promptIndex];
      if (!prompt || !screen.includes(prompt.question)) return;

      if (prompt.select) {
        const pointer = screen.lastIndexOf('❯');
        if (pointer < 0) return;
        if (screen.slice(pointer + 1).trimStart().startsWith(prompt.select)) {
          child.stdin.write('\r');
        } else if (selectPresses++ < 15) {
          child.stdin.write('\u001b[B');
          return;
        } else {
          fail(`"${prompt.select}" is not offered by the initializer`);
          return;
        }
      } else {
        child.stdin.write(prompt.answer);
      }
      promptIndex++;
      armStallWatchdog();
    };

    const onData = (chunk) => {
      appendLog(job, chunk);
      screen += stripAnsi(chunk.toString());
      // Act once the terminal goes quiet so a prompt is never read half-rendered
      clearTimeout(quietTimer);
      quietTimer = setTimeout(answerPrompts, 200);
    };

    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('error', (err) => finish({ ok: false, error: err.message }));
    child.on('close', (code) => {
      if (code === 0 && screen.includes(successText)) finish({ ok: true });
      else finish({ ok: false, error: code === 0 ? 'the initializer did not report success' : `exited with code ${code}` });
    });
    armStallWatchdog();
  });
}

async function runJob(job, steps, context) {
  for (const step of steps) {
    job.currentStep = step.label;
    let result;
    try {
      result = step.pty ? await runPromptDriven(job, step) : await runCommand(job, step);
    } catch (err) {
      result = { ok: false, error: err.message };
    }
    if (!result.ok) {
      job.status = 'failed';
      job.error = `${step.label} failed: ${result.error}`;
      job.finishedAt = Date.now();
      return;
    }
  }

  // Fresh repository so the operator can commit straight away
  const git = findExecutable(['git']);
  if (git && !fs.existsSync(path.join(context.dir, '.git'))) {
    job.currentStep = 'Initializing git repository';
    await runCommand(job, { cmd: git, args: ['init', '-q'], cwd: context.dir });
  }

  job.status = 'succeeded';
  job.currentStep = null;
  job.finishedAt = Date.now();
}

function snapshot(job) {
  return {
    id: job.id,
    template: job.template,
    templateLabel: job.templateLabel,
    name: job.name,
    path: displayPath(job.dir),
    status: job.status,
    currentStep: job.currentStep,
    error: job.error || null,
    elapsedSeconds: Math.round(((job.finishedAt || Date.now()) - job.startedAt) / 1000),
    logTail: job.log.slice(-12),
  };
}

/**
 * Validates the request and starts a scaffolding job; returns its initial snapshot.
 */
export function startProject({ template: requestedTemplate, name, location = '~/dev', install = true, language = 'js' }) {
  const template = TEMPLATE_ALIASES[requestedTemplate] || requestedTemplate;
  const spec = TEMPLATES[template];
  if (!spec) throw new ScaffoldError(`Unknown template "${requestedTemplate}". Available: ${TEMPLATE_NAMES.join(', ')}.`);

  const projectName = spec.naming(String(name || ''));
  if (!projectName || projectName === 'app_') throw new ScaffoldError('A project name with at least one letter or digit is required.');

  const parent = resolveSafePath(location);
  if (!fs.existsSync(parent)) fs.mkdirSync(parent, { recursive: true });
  if (!fs.statSync(parent).isDirectory()) throw new ScaffoldError(`${displayPath(parent)} is not a folder.`);

  const dir = resolveSafePath(path.join(parent, projectName));
  if (fs.existsSync(dir)) throw new ScaffoldError(`${displayPath(dir)} already exists. Choose another name or location.`);
  for (const other of jobs.values()) {
    if (other.status === 'running' && other.dir === dir) throw new ScaffoldError(`${displayPath(dir)} is already being created.`);
  }

  const context = { name: projectName, dir, parent, install: install !== false, typescript: language === 'ts' };
  const steps = spec.steps(context).filter(Boolean);

  const job = {
    id: `proj-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    template,
    templateLabel: spec.label,
    name: projectName,
    dir,
    status: 'running',
    currentStep: steps[0]?.label || null,
    log: [],
    startedAt: Date.now(),
  };
  jobs.set(job.id, job);
  runJob(job, steps, context);
  return snapshot(job);
}

export function getProjectJob(id) {
  const job = jobs.get(id);
  return job ? snapshot(job) : null;
}

export function listProjectJobs() {
  return [...jobs.values()].sort((a, b) => b.startedAt - a.startedAt).slice(0, 10).map(snapshot);
}
