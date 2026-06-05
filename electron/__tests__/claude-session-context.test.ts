import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vite-plus/test';

const require = createRequire(import.meta.url);
const { readClaudeSessionContext } = require('../claude-session-context.cjs') as {
  readClaudeSessionContext: (sessionId?: string) => {
    messages?: ReadonlyArray<{ role: 'assistant' | 'user'; text: string }>;
    risks?: ReadonlyArray<string>;
    source: { threadId?: string; type: string };
    version: 1;
  } | null;
};

const sessionId = '019e5e57-e7d6-7392-9ad1-ad959319d2fb';

test('finds the active Claude Code session under CLAUDE_CONFIG_DIR', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'codiff-claude-home-'));
  const previousClaudeConfigDir = process.env.CLAUDE_CONFIG_DIR;

  try {
    const projectDirectory = join(directory, 'projects', '-home-reviewer-repo');
    const sessionPath = join(projectDirectory, `${sessionId}.jsonl`);
    await mkdir(projectDirectory, { recursive: true });
    await writeFile(
      sessionPath,
      `${JSON.stringify({
        cwd: '/home/reviewer/repo',
        message: {
          content: [{ text: 'Keep Codiff in charge of the ephemeral walkthrough.', type: 'text' }],
          role: 'user',
        },
        type: 'user',
      })}\n`,
    );
    process.env.CLAUDE_CONFIG_DIR = directory;

    expect(readClaudeSessionContext(sessionId)).toMatchObject({
      messages: [
        {
          role: 'user',
          text: 'Keep Codiff in charge of the ephemeral walkthrough.',
        },
      ],
      source: {
        threadId: sessionId,
        type: 'claude-session-excerpt',
      },
      version: 1,
    });
  } finally {
    if (previousClaudeConfigDir == null) {
      delete process.env.CLAUDE_CONFIG_DIR;
    } else {
      process.env.CLAUDE_CONFIG_DIR = previousClaudeConfigDir;
    }
    await rm(directory, { force: true, recursive: true });
  }
});
