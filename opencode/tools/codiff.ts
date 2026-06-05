import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const toolRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const codiffRoot = resolve(toolRoot, '../..');

const getCodiffCommand = () => {
  if (process.env.CODIFF_COMMAND) {
    return { args: [], command: process.env.CODIFF_COMMAND };
  }

  const appCli = join(codiffRoot, 'bin/codiff-app');
  if (process.platform === 'darwin' && codiffRoot.includes('.app/Contents/Resources/app') && existsSync(appCli)) {
    return { args: [], command: appCli };
  }

  const devCli = join(codiffRoot, 'bin/codiff.js');
  if (existsSync(devCli)) {
    return { args: [devCli], command: process.execPath };
  }

  if (process.platform === 'darwin' && existsSync(appCli)) {
    return { args: [], command: appCli };
  }

  return { args: [], command: 'codiff' };
};

export default {
  description:
    'Open Codiff to review staged and unstaged Git changes. Use after making code changes to get a visual diff review. Optionally specify a commit, branch, or PR to review.',
  args: {
    target: {
      type: 'string',
      description:
        'Git ref to review: commit hash, branch name, PR number (e.g. "123"), or PR URL. Defaults to reviewing uncommitted changes.',
    },
  },
  async execute(args: { target?: string }, context: { worktree?: string; directory: string; sessionID?: string }) {
    const codiffCommand = getCodiffCommand();
    const repoPath = context.worktree || context.directory;

    const cliArgs = [
      ...codiffCommand.args,
      '-w',
      '--agent',
      'opencode',
      ...(context.sessionID ? ['--opencode-session', context.sessionID] : []),
      ...(args.target ? [args.target] : []),
      repoPath,
    ];

    const result = spawnSync(codiffCommand.command, cliArgs, {
      encoding: 'utf8',
      stdio: 'inherit',
      cwd: repoPath,
    });

    if (result.error) {
      return `Failed to open Codiff: ${result.error.message}`;
    }

    if (result.status !== 0) {
      return `Codiff exited with code ${result.status}`;
    }

    return 'Codiff opened successfully. Review your changes in the Codiff window.';
  },
};
