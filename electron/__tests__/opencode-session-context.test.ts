import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vite-plus/test';

const require = createRequire(import.meta.url);
const { readOpencodeSessionContext } = require('../opencode-session-context.cjs') as {
  readOpencodeSessionContext: (sessionId?: string) => {
    messages?: ReadonlyArray<{ role: 'assistant' | 'user'; text: string }>;
    risks?: ReadonlyArray<string>;
    source: { threadId?: string; type: string };
    version: 1;
  } | null;
};

const sessionId = 'ses_1234567890abcdef';

test('returns null for undefined or empty session ID', () => {
  expect(readOpencodeSessionContext(undefined)).toBeNull();
  expect(readOpencodeSessionContext('')).toBeNull();
});

test('returns null when opencode CLI is not found', async () => {
  const previousOpencodePath = process.env.CODIFF_OPENCODE_PATH;
  try {
    process.env.CODIFF_OPENCODE_PATH = '/nonexistent/opencode';
    expect(readOpencodeSessionContext(sessionId)).toBeNull();
  } finally {
    if (previousOpencodePath == null) {
      delete process.env.CODIFF_OPENCODE_PATH;
    } else {
      process.env.CODIFF_OPENCODE_PATH = previousOpencodePath;
    }
  }
});

test('returns null when opencode export fails', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'codiff-opencode-session-'));
  const mockOpencode = join(directory, 'opencode');
  const previousOpencodePath = process.env.CODIFF_OPENCODE_PATH;

  try {
    await writeFile(mockOpencode, '#!/bin/sh\nexit 1\n', { mode: 0o755 });
    process.env.CODIFF_OPENCODE_PATH = mockOpencode;

    expect(readOpencodeSessionContext(sessionId)).toBeNull();
  } finally {
    if (previousOpencodePath == null) {
      delete process.env.CODIFF_OPENCODE_PATH;
    } else {
      process.env.CODIFF_OPENCODE_PATH = previousOpencodePath;
    }
    await rm(directory, { force: true, recursive: true });
  }
});

test('returns null when opencode export returns invalid JSON', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'codiff-opencode-session-'));
  const mockOpencode = join(directory, 'opencode');
  const previousOpencodePath = process.env.CODIFF_OPENCODE_PATH;

  try {
    await writeFile(mockOpencode, '#!/bin/sh\necho "not valid json"\nexit 0\n', { mode: 0o755 });
    process.env.CODIFF_OPENCODE_PATH = mockOpencode;

    expect(readOpencodeSessionContext(sessionId)).toBeNull();
  } finally {
    if (previousOpencodePath == null) {
      delete process.env.CODIFF_OPENCODE_PATH;
    } else {
      process.env.CODIFF_OPENCODE_PATH = previousOpencodePath;
    }
    await rm(directory, { force: true, recursive: true });
  }
});

test('extracts user and assistant messages from opencode export', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'codiff-opencode-session-'));
  const mockOpencode = join(directory, 'opencode');
  const previousOpencodePath = process.env.CODIFF_OPENCODE_PATH;

  try {
    const exportData = {
      messages: [
        { role: 'user', content: 'Fix the bug in the login form' },
        { role: 'assistant', content: 'I found the issue in auth.ts line 42' },
        { role: 'user', content: 'Great, please fix it' },
        { role: 'assistant', content: 'Done, the fix has been applied' },
      ],
    };

    await writeFile(mockOpencode, `#!/bin/sh\ncat << 'EOF'\n${JSON.stringify(exportData)}\nEOF\n`, {
      mode: 0o755,
    });
    process.env.CODIFF_OPENCODE_PATH = mockOpencode;

    const result = readOpencodeSessionContext(sessionId);
    expect(result).toMatchObject({
      messages: [
        { role: 'user', text: 'Fix the bug in the login form' },
        { role: 'assistant', text: 'I found the issue in auth.ts line 42' },
        { role: 'user', text: 'Great, please fix it' },
        { role: 'assistant', text: 'Done, the fix has been applied' },
      ],
      source: {
        threadId: sessionId,
        type: 'opencode-session-excerpt',
      },
      version: 1,
    });
  } finally {
    if (previousOpencodePath == null) {
      delete process.env.CODIFF_OPENCODE_PATH;
    } else {
      process.env.CODIFF_OPENCODE_PATH = previousOpencodePath;
    }
    await rm(directory, { force: true, recursive: true });
  }
});

test('handles messages with content as array of text objects', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'codiff-opencode-session-'));
  const mockOpencode = join(directory, 'opencode');
  const previousOpencodePath = process.env.CODIFF_OPENCODE_PATH;

  try {
    const exportData = {
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'First part' },
            { type: 'text', text: 'Second part' },
          ],
        },
      ],
    };

    await writeFile(mockOpencode, `#!/bin/sh\ncat << 'EOF'\n${JSON.stringify(exportData)}\nEOF\n`, {
      mode: 0o755,
    });
    process.env.CODIFF_OPENCODE_PATH = mockOpencode;

    const result = readOpencodeSessionContext(sessionId);
    expect(result).toMatchObject({
      messages: [{ role: 'user', text: 'First part Second part' }],
      source: {
        threadId: sessionId,
        type: 'opencode-session-excerpt',
      },
      version: 1,
    });
  } finally {
    if (previousOpencodePath == null) {
      delete process.env.CODIFF_OPENCODE_PATH;
    } else {
      process.env.CODIFF_OPENCODE_PATH = previousOpencodePath;
    }
    await rm(directory, { force: true, recursive: true });
  }
});

test('filters out noise messages like "codiff" or "show me codiff"', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'codiff-opencode-session-'));
  const mockOpencode = join(directory, 'opencode');
  const previousOpencodePath = process.env.CODIFF_OPENCODE_PATH;

  try {
    const exportData = {
      messages: [
        { role: 'user', content: 'codiff' },
        { role: 'user', content: 'Show me Codiff' },
        { role: 'user', content: 'open codiff' },
        { role: 'user', content: 'Actual question about the code' },
      ],
    };

    await writeFile(mockOpencode, `#!/bin/sh\ncat << 'EOF'\n${JSON.stringify(exportData)}\nEOF\n`, {
      mode: 0o755,
    });
    process.env.CODIFF_OPENCODE_PATH = mockOpencode;

    const result = readOpencodeSessionContext(sessionId);
    expect(result?.messages).toHaveLength(1);
    expect(result?.messages?.[0]).toMatchObject({
      role: 'user',
      text: 'Actual question about the code',
    });
  } finally {
    if (previousOpencodePath == null) {
      delete process.env.CODIFF_OPENCODE_PATH;
    } else {
      process.env.CODIFF_OPENCODE_PATH = previousOpencodePath;
    }
    await rm(directory, { force: true, recursive: true });
  }
});

test('returns warning when no valid messages found', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'codiff-opencode-session-'));
  const mockOpencode = join(directory, 'opencode');
  const previousOpencodePath = process.env.CODIFF_OPENCODE_PATH;

  try {
    const exportData = {
      messages: [
        { role: 'system', content: 'System message' },
        { role: 'tool', content: 'Tool result' },
      ],
    };

    await writeFile(mockOpencode, `#!/bin/sh\ncat << 'EOF'\n${JSON.stringify(exportData)}\nEOF\n`, {
      mode: 0o755,
    });
    process.env.CODIFF_OPENCODE_PATH = mockOpencode;

    const result = readOpencodeSessionContext(sessionId);
    expect(result).toMatchObject({
      messages: [],
      risks: ['Codiff could not find recent readable messages for the linked OpenCode session.'],
      source: {
        threadId: sessionId,
        type: 'opencode-session-excerpt',
      },
      version: 1,
    });
  } finally {
    if (previousOpencodePath == null) {
      delete process.env.CODIFF_OPENCODE_PATH;
    } else {
      process.env.CODIFF_OPENCODE_PATH = previousOpencodePath;
    }
    await rm(directory, { force: true, recursive: true });
  }
});

test('truncates long message text to 2400 characters', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'codiff-opencode-session-'));
  const mockOpencode = join(directory, 'opencode');
  const previousOpencodePath = process.env.CODIFF_OPENCODE_PATH;

  try {
    const longText = 'x'.repeat(3000);
    const exportData = {
      messages: [{ role: 'user', content: longText }],
    };

    await writeFile(mockOpencode, `#!/bin/sh\ncat << 'EOF'\n${JSON.stringify(exportData)}\nEOF\n`, {
      mode: 0o755,
    });
    process.env.CODIFF_OPENCODE_PATH = mockOpencode;

    const result = readOpencodeSessionContext(sessionId);
    // truncate adds "\n...[truncated]" (15 chars) to the 2400-char slice
    expect(result?.messages?.[0]?.text.length).toBe(2415);
    expect(result?.messages?.[0]?.text.endsWith('\n...[truncated]')).toBe(true);
  } finally {
    if (previousOpencodePath == null) {
      delete process.env.CODIFF_OPENCODE_PATH;
    } else {
      process.env.CODIFF_OPENCODE_PATH = previousOpencodePath;
    }
    await rm(directory, { force: true, recursive: true });
  }
});
