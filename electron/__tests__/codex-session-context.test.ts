import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vite-plus/test';

const require = createRequire(import.meta.url);
const { readCodexSessionContext } = require('../codex-session-context.cjs') as {
  readCodexSessionContext: (sessionId?: string) => {
    messages?: ReadonlyArray<{ role: 'assistant' | 'user'; text: string }>;
    risks?: ReadonlyArray<string>;
    source: { threadId?: string; type: string };
    version: 1;
  } | null;
};

const sessionId = '019e5e57-e7d6-7392-9ad1-ad959319d2fb';

test('finds the active Codex session under CODEX_HOME', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'codiff-codex-home-'));
  const previousCodexHome = process.env.CODEX_HOME;

  try {
    const sessionDirectory = join(directory, 'sessions', '2026', '05', '25');
    const sessionPath = join(sessionDirectory, `rollout-${sessionId}.jsonl`);
    await mkdir(sessionDirectory, { recursive: true });
    await writeFile(
      sessionPath,
      `${JSON.stringify({
        payload: {
          content: [
            {
              text: 'Keep Codiff in charge of the ephemeral walkthrough.',
              type: 'input_text',
            },
          ],
          role: 'user',
          type: 'message',
        },
        type: 'response_item',
      })}\n`,
    );
    process.env.CODEX_HOME = directory;

    expect(readCodexSessionContext(sessionId)).toMatchObject({
      messages: [
        {
          role: 'user',
          text: 'Keep Codiff in charge of the ephemeral walkthrough.',
        },
      ],
      source: {
        threadId: sessionId,
        type: 'codex-session-excerpt',
      },
      version: 1,
    });
  } finally {
    if (previousCodexHome == null) {
      delete process.env.CODEX_HOME;
    } else {
      process.env.CODEX_HOME = previousCodexHome;
    }
    await rm(directory, { force: true, recursive: true });
  }
});
