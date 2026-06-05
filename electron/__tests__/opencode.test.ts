import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vite-plus/test';

const require = createRequire(import.meta.url);
const {
  DEFAULT_OPENCODE_MODEL,
  OPENCODE_NOT_FOUND_CODE,
  OPENCODE_NOT_FOUND_MESSAGE,
  getOpencodeCommand,
  getOpencodeLaunchErrorMessage,
  isOpencodeModelAvailabilityError,
  isOpencodeNotFoundError,
  normalizeOpencodeModel,
  runOpencode,
} = require('../opencode.cjs') as {
  DEFAULT_OPENCODE_MODEL: string;
  OPENCODE_NOT_FOUND_CODE: string;
  OPENCODE_NOT_FOUND_MESSAGE: string;
  getOpencodeCommand: () => string;
  getOpencodeLaunchErrorMessage: (error: unknown) => string;
  isOpencodeModelAvailabilityError: (value: string) => boolean;
  isOpencodeNotFoundError: (error: unknown) => boolean;
  normalizeOpencodeModel: (value: unknown) => string;
  runOpencode: (
    repoRoot: string,
    prompt: string,
    schema: unknown,
    outputName?: string,
    timeoutMessage?: string,
    options?: { model?: string },
  ) => Promise<string>;
};

test('normalizes OpenCode model preferences to a free-form string', () => {
  expect(normalizeOpencodeModel('opencode-go/deepseek-v4-flash')).toBe('opencode-go/deepseek-v4-flash');
  expect(normalizeOpencodeModel('  anthropic/claude-sonnet-4-6  ')).toBe('anthropic/claude-sonnet-4-6');
  expect(normalizeOpencodeModel('')).toBe(DEFAULT_OPENCODE_MODEL);
  expect(normalizeOpencodeModel(undefined)).toBe(DEFAULT_OPENCODE_MODEL);
  expect(normalizeOpencodeModel(null)).toBe(DEFAULT_OPENCODE_MODEL);
});

test('detects selected OpenCode model and provider availability failures', () => {
  expect(isOpencodeModelAvailabilityError('provider_not_found: opencode-go')).toBe(true);
  expect(isOpencodeModelAvailabilityError('model deepseek-v4-flash is not available for you.')).toBe(true);
  expect(isOpencodeModelAvailabilityError('You do not have access to this model.')).toBe(true);
  expect(isOpencodeModelAvailabilityError('Rate limit reached, please try again later.')).toBe(false);
});

test('isOpencodeNotFoundError matches the OpenCode not-found code and ENOENT', () => {
  expect(isOpencodeNotFoundError({ code: OPENCODE_NOT_FOUND_CODE, message: 'missing' })).toBe(true);
  expect(isOpencodeNotFoundError({ code: 'ENOENT', message: 'spawn missing' })).toBe(true);
  expect(isOpencodeNotFoundError({ code: 'EACCES', message: 'denied' })).toBe(false);
  expect(isOpencodeNotFoundError('not an object')).toBe(false);
});

test('explains missing OpenCode CLI launches', () => {
  expect(getOpencodeLaunchErrorMessage(Object.assign(new Error('spawn opencode ENOENT'), { code: 'ENOENT' }))).toBe(
    OPENCODE_NOT_FOUND_MESSAGE,
  );
  expect(getOpencodeLaunchErrorMessage(new Error('boom'))).toBe('boom');
});

test('rejects invalid explicit OpenCode CLI overrides', () => {
  const previousOpencodePath = process.env.CODIFF_OPENCODE_PATH;
  process.env.CODIFF_OPENCODE_PATH = '/tmp/codiff-missing-opencode';

  try {
    expect(() => getOpencodeCommand()).toThrow('CODIFF_OPENCODE_PATH');
    try {
      getOpencodeCommand();
    } catch (error) {
      expect(error).toMatchObject({ code: OPENCODE_NOT_FOUND_CODE });
    }
  } finally {
    if (previousOpencodePath == null) {
      delete process.env.CODIFF_OPENCODE_PATH;
    } else {
      process.env.CODIFF_OPENCODE_PATH = previousOpencodePath;
    }
  }
});

test('runs OpenCode walkthroughs and parses JSON from NDJSON text events', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'codiff-opencode-'));
  const fakeOpencodePath = join(directory, 'opencode');
  const argsPath = join(directory, 'args.txt');
  const promptPath = join(directory, 'prompt.txt');
  const previousOpencodePath = process.env.CODIFF_OPENCODE_PATH;

  try {
    await writeFile(
      fakeOpencodePath,
      `#!/bin/sh
for arg in "$@"; do
  printf '%s\\n' "$arg" >> "${argsPath}"
done
cat > "${promptPath}"
printf '%s\\n' '{"type":"text","part":{"text":"{\\"version\\":1,\\"summary\\":{\\"focus\\":\\"x\\",\\"skim\\":\\"y\\"},\\"groups\\":[]}"}}'
`,
    );
    await chmod(fakeOpencodePath, 0o755);
    process.env.CODIFF_OPENCODE_PATH = fakeOpencodePath;

    await expect(
      runOpencode(
        directory,
        'initial prompt',
        { type: 'object', required: ['version'] },
        'walkthrough.json',
        'Timed out.',
        { model: 'opencode-go/deepseek-v4-flash' },
      ),
    ).resolves.toBe('{"version":1,"summary":{"focus":"x","skim":"y"},"groups":[]}');

    const args = (await readFile(argsPath, 'utf8')).trim().split('\n');
    expect(args).toContain('run');
    expect(args).toContain('--model');
    expect(args).toContain('opencode-go/deepseek-v4-flash');
    expect(args).toContain('--dir');
    expect(args).toContain(directory);

    const fullPrompt = await readFile(promptPath, 'utf8');
    expect(fullPrompt).toContain('initial prompt');
    expect(fullPrompt).toContain('Return ONLY a single JSON object');
    expect(fullPrompt).toContain('"version"');
    expect(fullPrompt).toContain('"required"');
  } finally {
    if (previousOpencodePath == null) {
      delete process.env.CODIFF_OPENCODE_PATH;
    } else {
      process.env.CODIFF_OPENCODE_PATH = previousOpencodePath;
    }
    await rm(directory, { force: true, recursive: true });
  }
});

test('omits --model when OpenCode should pick its own default', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'codiff-opencode-default-'));
  const fakeOpencodePath = join(directory, 'opencode');
  const argsPath = join(directory, 'args.txt');
  const previousOpencodePath = process.env.CODIFF_OPENCODE_PATH;

  try {
    await writeFile(
      fakeOpencodePath,
      `#!/bin/sh
for arg in "$@"; do
  printf '%s\\n' "$arg" >> "${argsPath}"
done
cat > /dev/null
printf '%s\\n' '{"type":"text","part":{"text":"{\\"version\\":1,\\"groups\\":[]}"}}'
`,
    );
    await chmod(fakeOpencodePath, 0o755);
    process.env.CODIFF_OPENCODE_PATH = fakeOpencodePath;

    await expect(
      runOpencode(directory, 'initial prompt', { type: 'object' }, 'walkthrough.json', 'Timed out.'),
    ).resolves.toBe('{"version":1,"groups":[]}');

    const args = (await readFile(argsPath, 'utf8')).trim().split('\n');
    expect(args).toContain('run');
    expect(args).not.toContain('--model');
    expect(args).toContain('--dir');
    expect(args).toContain(directory);
    expect(args).toContain('--format');
    expect(args).toContain('json');
  } finally {
    if (previousOpencodePath == null) {
      delete process.env.CODIFF_OPENCODE_PATH;
    } else {
      process.env.CODIFF_OPENCODE_PATH = previousOpencodePath;
    }
    await rm(directory, { force: true, recursive: true });
  }
});

test('surfaces OpenCode CLI errors with the stderr/stdout message', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'codiff-opencode-'));
  const fakeOpencodePath = join(directory, 'opencode');
  const previousOpencodePath = process.env.CODIFF_OPENCODE_PATH;

  try {
    await writeFile(
      fakeOpencodePath,
      `#!/bin/sh
cat > /dev/null
printf 'provider_not_found: opencode-go\\n' 1>&2
exit 2
`,
    );
    await chmod(fakeOpencodePath, 0o755);
    process.env.CODIFF_OPENCODE_PATH = fakeOpencodePath;

    await expect(
      runOpencode(directory, 'prompt', { type: 'object' }, 'walkthrough.json', 'Timed out.', {
        model: 'opencode-go/deepseek-v4-flash',
      }),
    ).rejects.toThrow(/provider_not_found: opencode-go/);
  } finally {
    if (previousOpencodePath == null) {
      delete process.env.CODIFF_OPENCODE_PATH;
    } else {
      process.env.CODIFF_OPENCODE_PATH = previousOpencodePath;
    }
    await rm(directory, { force: true, recursive: true });
  }
});

test('surfaces OpenCode NDJSON error events as the rejection message', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'codiff-opencode-'));
  const fakeOpencodePath = join(directory, 'opencode');
  const previousOpencodePath = process.env.CODIFF_OPENCODE_PATH;

  try {
    await writeFile(
      fakeOpencodePath,
      `#!/bin/sh
cat > /dev/null
printf '%s\\n' '{"type":"error","error":{"name":"UnknownError","data":{"message":"Model not found: anthropic/claude-3-opus."}}}'
printf '%s\\n' '{"type":"text","part":{"text":"ignored"}}'
`,
    );
    await chmod(fakeOpencodePath, 0o755);
    process.env.CODIFF_OPENCODE_PATH = fakeOpencodePath;

    await expect(
      runOpencode(directory, 'prompt', { type: 'object' }, 'walkthrough.json', 'Timed out.', {
        model: 'opencode-go/deepseek-v4-flash',
      }),
    ).rejects.toThrow(/Model not found: anthropic\/claude-3-opus\./);
  } finally {
    if (previousOpencodePath == null) {
      delete process.env.CODIFF_OPENCODE_PATH;
    } else {
      process.env.CODIFF_OPENCODE_PATH = previousOpencodePath;
    }
    await rm(directory, { force: true, recursive: true });
  }
});

test('rejects OpenCode output that does not contain a text event', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'codiff-opencode-'));
  const fakeOpencodePath = join(directory, 'opencode');
  const previousOpencodePath = process.env.CODIFF_OPENCODE_PATH;

  try {
    await writeFile(
      fakeOpencodePath,
      `#!/bin/sh
cat > /dev/null
printf '%s\\n' '{"type":"step_start","sessionID":"ses_1"}'
printf '%s\\n' 'Here is the analysis you asked for:'
printf '%s\\n' '{"version":1,"summary":{"focus":"x","skim":"y"},"groups":[]}'
`,
    );
    await chmod(fakeOpencodePath, 0o755);
    process.env.CODIFF_OPENCODE_PATH = fakeOpencodePath;

    await expect(
      runOpencode(directory, 'prompt', { type: 'object' }, 'walkthrough.json', 'Timed out.', {
        model: 'opencode-go/deepseek-v4-flash',
      }),
    ).rejects.toThrow(/no text events/i);
  } finally {
    if (previousOpencodePath == null) {
      delete process.env.CODIFF_OPENCODE_PATH;
    } else {
      process.env.CODIFF_OPENCODE_PATH = previousOpencodePath;
    }
    await rm(directory, { force: true, recursive: true });
  }
});
