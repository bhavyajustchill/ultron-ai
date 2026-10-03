import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { resolveSafePath, displayPath } from '@/lib/fsSandbox';
import { findExecutable, isWindows } from '@/lib/desktopLauncher';

/**
 * Project scaffolder for Jarvis (Phase 7.3): creates new projects from templates as
 * background jobs so a multi-minute `npm install` never blocks the live voice session.
 * Every generator runs non-interactively (stdin closed, CI=1); the HUD polls job status.
 */

export class ScaffoldError extends Error {}

const STEP_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_LOG_LINES = 60;
const NPM = isWindows ? 'npm.cmd' : 'npm';
const NPX = isWindows ? 'npx.cmd' : 'npx';

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
// In-process template writers
// ---------------------------------------------------------------------------

function writeFiles(root, files) {
  for (const [relative, content] of Object.entries(files)) {
    const target = path.join(/*turbopackIgnore: true*/ root, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content, 'utf-8');
  }
}

function writeExpressTemplate({ dir, name }) {
  writeFiles(dir, {
    'package.json': `${JSON.stringify(
      {
        name,
        version: '1.0.0',
        private: true,
        type: 'module',
        main: 'src/index.js',
        scripts: {
          dev: 'node --watch --env-file-if-exists=.env src/index.js',
          start: 'node --env-file-if-exists=.env src/index.js',
        },
        dependencies: { cors: '^2.8.6', express: '^5.2.1' },
      },
      null,
      2
    )}\n`,
    'src/index.js': `import express from 'express';
import cors from 'cors';
import healthRouter from './routes/health.js';
import itemsRouter from './routes/items.js';
import { notFound, errorHandler } from './middleware/errors.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use('/api/health', healthRouter);
app.use('/api/items', itemsRouter);

app.use(notFound);
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(\`${name} API listening on http://localhost:\${PORT}\`);
});
`,
    'src/routes/health.js': `import { Router } from 'express';

const router = Router();

router.get('/', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

export default router;
`,
    'src/routes/items.js': `import { Router } from 'express';

// In-memory store — swap for a real database when ready
const items = new Map();
let nextId = 1;

const router = Router();

router.get('/', (req, res) => {
  res.json([...items.values()]);
});

router.get('/:id', (req, res) => {
  const item = items.get(Number(req.params.id));
  if (!item) return res.status(404).json({ error: 'Item not found' });
  res.json(item);
});

router.post('/', (req, res) => {
  const { name, description = '' } = req.body ?? {};
  if (!name) return res.status(400).json({ error: '"name" is required' });
  const item = { id: nextId++, name, description, createdAt: new Date().toISOString() };
  items.set(item.id, item);
  res.status(201).json(item);
});

router.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = items.get(id);
  if (!existing) return res.status(404).json({ error: 'Item not found' });
  const updated = { ...existing, ...req.body, id };
  items.set(id, updated);
  res.json(updated);
});

router.delete('/:id', (req, res) => {
  if (!items.delete(Number(req.params.id))) return res.status(404).json({ error: 'Item not found' });
  res.status(204).end();
});

export default router;
`,
    'src/middleware/errors.js': `export function notFound(req, res) {
  res.status(404).json({ error: \`Route \${req.method} \${req.originalUrl} not found\` });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
}
`,
    '.env.example': 'PORT=3000\n',
    '.gitignore': 'node_modules\n.env\n',
    'README.md': `# ${name}

Node.js + Express REST API scaffolded by J.A.R.V.I.S.

\`\`\`bash
npm install
cp .env.example .env
npm run dev
\`\`\`

| Method | Route | Description |
| --- | --- | --- |
| GET | /api/health | Health check |
| GET | /api/items | List items |
| GET | /api/items/:id | Get one item |
| POST | /api/items | Create an item (\`{ "name": "..." }\`) |
| PUT | /api/items/:id | Update an item |
| DELETE | /api/items/:id | Delete an item |
`,
  });
}

/**
 * shadcn's dashboard block asks for TooltipProvider at the root and lives at /dashboard;
 * wire both so `npm run dev` opens straight into the admin panel.
 */
function finishShadcnAdmin({ dir }) {
  const layoutPath = ['app/layout.tsx', 'app/layout.jsx', 'src/app/layout.tsx']
    .map((p) => path.join(/*turbopackIgnore: true*/ dir, p))
    .find((p) => fs.existsSync(p));
  if (layoutPath) {
    let layout = fs.readFileSync(layoutPath, 'utf-8');
    if (!layout.includes('TooltipProvider') && layout.includes('{children}')) {
      layout = layout
        .replace('{children}', '<TooltipProvider>{children}</TooltipProvider>')
        .replace(/(import ["']\.\/globals\.css["'];?\n)/, `$1import { TooltipProvider } from "@/components/ui/tooltip"\n`);
      fs.writeFileSync(layoutPath, layout, 'utf-8');
    }
  }
  const appDir = layoutPath ? path.dirname(layoutPath) : path.join(/*turbopackIgnore: true*/ dir, 'app');
  const pageExt = layoutPath?.endsWith('.jsx') ? 'jsx' : 'tsx';
  fs.writeFileSync(
    path.join(/*turbopackIgnore: true*/ appDir, `page.${pageExt}`),
    'import { redirect } from "next/navigation"\n\nexport default function Page() {\n  redirect("/dashboard")\n}\n',
    'utf-8'
  );
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

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
    label: 'React + Vite app',
    naming: toKebab,
    steps: ({ name, dir, parent, install, typescript }) => [
      {
        label: 'Generating React + Vite project',
        cmd: NPM,
        args: ['create', '--yes', 'vite@latest', name, '--', '--template', typescript ? 'react-ts' : 'react', '--no-interactive', '--no-immediate'],
        cwd: parent,
      },
      install && { label: 'Installing dependencies', cmd: NPM, args: ['install'], cwd: dir },
    ],
  },
  'node-express': {
    label: 'Node.js Express API',
    naming: toKebab,
    steps: ({ dir, install }) => [
      { label: 'Writing Express API template', run: writeExpressTemplate },
      install && { label: 'Installing dependencies', cmd: NPM, args: ['install'], cwd: dir },
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
  'shadcn-admin': {
    label: 'shadcn/ui admin dashboard (Next.js, TypeScript)',
    naming: toKebab,
    steps: ({ name, dir, parent }) => [
      {
        label: 'Generating Next.js + shadcn/ui project and installing dependencies',
        cmd: NPX,
        args: ['--yes', 'shadcn@latest', 'init', '-t', 'next', '-n', name, '-d', '-y'],
        cwd: parent,
        timeoutMs: 15 * 60 * 1000,
      },
      { label: 'Adding the admin dashboard block', cmd: NPX, args: ['--yes', 'shadcn@latest', 'add', 'dashboard-01', '-y'], cwd: dir },
      { label: 'Wiring the dashboard as the home page', run: finishShadcnAdmin },
    ],
  },
};

export const TEMPLATE_NAMES = Object.keys(TEMPLATES);

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

async function runJob(job, steps, context) {
  for (const step of steps) {
    job.currentStep = step.label;
    let result;
    try {
      if (step.run) {
        await step.run(context);
        result = { ok: true };
      } else {
        result = await runCommand(job, step);
      }
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
export function startProject({ template, name, location = '~/dev', install = true, language = 'js' }) {
  const spec = TEMPLATES[template];
  if (!spec) throw new ScaffoldError(`Unknown template "${template}". Available: ${TEMPLATE_NAMES.join(', ')}.`);

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
