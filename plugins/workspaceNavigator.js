import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export default {
  id: 'workspace_navigator',
  name: 'Workspace Codebase Navigator',
  description:
    'Analyzes Project A.D.A directory topology, code file counts, active git branch, recent commits, and 3D asset statuses.',
  parameters: {
    type: 'OBJECT',
    properties: {
      include_git: {
        type: 'BOOLEAN',
        description: 'Whether to include active git branch and last commit summary.',
      },
    },
  },
  execute: async (args = {}) => {
    const rootDir = process.cwd();

    // Scan top-level directories and count files
    let fileCount = 0;
    let jsFiles = 0;
    let jsxFiles = 0;
    let assetCount = 0;

    function walk(dir, depth = 0) {
      if (depth > 3) return;
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === '.git') {
            continue;
          }
          if (entry.isDirectory()) {
            walk(path.join(dir, entry.name), depth + 1);
          } else {
            fileCount++;
            if (entry.name.endsWith('.js')) jsFiles++;
            if (entry.name.endsWith('.jsx')) jsxFiles++;
            if (entry.name.endsWith('.glb') || entry.name.endsWith('.png') || entry.name.endsWith('.svg')) {
              assetCount++;
            }
          }
        }
      } catch {
        // Ignore permission or inaccessible folders
      }
    }

    walk(rootDir, 0);

    let gitInfo = null;
    if (args.include_git !== false) {
      try {
        const { stdout: branch } = await execAsync('git branch --show-current', { timeout: 1500 });
        const { stdout: commit } = await execAsync('git log -n 1 --oneline', { timeout: 1500 });
        gitInfo = {
          branch: (branch || '').trim(),
          latestCommit: (commit || '').trim(),
        };
      } catch {
        gitInfo = { branch: 'unknown', latestCommit: 'none' };
      }
    }

    return {
      status: 'SYNCHRONIZED',
      workspace_root: rootDir,
      metrics: {
        total_tracked_files: fileCount,
        javascript_modules: jsFiles,
        react_jsx_components: jsxFiles,
        binary_3d_assets: assetCount,
      },
      git: gitInfo,
      timestamp: new Date().toISOString(),
    };
  },
};

