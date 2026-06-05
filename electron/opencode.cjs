// @ts-check

const { spawn } = require('node:child_process');
const { promises: fs } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { findExecutableOnPath, isExecutableFile, oneLine, parseJSONMessage } = require('./agent-shared.cjs');

const OPENCODE_TIMEOUT_MS = 60_000;
const DEFAULT_OPENCODE_MODEL = 'default';
const FALLBACK_OPENCODE_MODEL = 'default';
const OPENCODE_NOT_FOUND_CODE = 'OPENCODE_NOT_FOUND';
const OPENCODE_NOT_FOUND_MESSAGE =
  'OpenCode CLI was not found. Install OpenCode and verify `opencode --version` works in Terminal. Codiff searches PATH, ~/.local/bin/opencode, /opt/homebrew/bin/opencode, and /usr/local/bin/opencode. If OpenCode is installed somewhere else, launch Codiff with `CODIFF_OPENCODE_PATH=/absolute/path/to/opencode codiff -w`.';
/**
 * @typedef {{
 *   fallbackModel?: string;
 *   model?: string;
 *   onModelFallback?: (fallbackModel: string, originalModel: string) => Promise<void> | void;
 * }} OpenCodeOptions
 */
/**
 * @typedef {{
 *   id: string;
 *   label: string;
 * }} OpenCodeModel
 */
/** @type {ReadonlyArray<OpenCodeModel>} */
const OPENCODE_MODELS = Object.freeze([
  {
    id: DEFAULT_OPENCODE_MODEL,
    label: 'Use OpenCode Default',
  },
]);
const OPENCODE_MODEL_IDS = new Set(OPENCODE_MODELS.map((model) => model.id));

/** @param {string} [detail] */
const createOpencodeNotFoundError = (detail) =>
  Object.assign(new Error(detail ? `${OPENCODE_NOT_FOUND_MESSAGE} ${detail}` : OPENCODE_NOT_FOUND_MESSAGE), {
    code: OPENCODE_NOT_FOUND_CODE,
  });

const getOpencodeCommand = () => {
  const opencodePath = process.env.CODIFF_OPENCODE_PATH?.trim();
  if (opencodePath) {
    if (isExecutableFile(opencodePath)) {
      return opencodePath;
    }

    throw createOpencodeNotFoundError(
      `CODIFF_OPENCODE_PATH is set to ${JSON.stringify(opencodePath)}, but that file is not executable.`,
    );
  }

  const pathCommand = findExecutableOnPath('opencode');
  if (pathCommand) {
    return pathCommand;
  }

  for (const path of [
    join(process.env.HOME || '', '.local/bin/opencode'),
    '/opt/homebrew/bin/opencode',
    '/usr/local/bin/opencode',
  ]) {
    if (isExecutableFile(path)) {
      return path;
    }
  }

  throw createOpencodeNotFoundError();
};

/** @param {unknown} error */
const isOpencodeNotFoundError = (error) =>
  Boolean(
    error &&
    typeof error === 'object' &&
    'code' in error &&
    (error.code === OPENCODE_NOT_FOUND_CODE || error.code === 'ENOENT'),
  );

/** @param {unknown} error */
const getOpencodeLaunchErrorMessage = (error) => {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
          ? error.message
          : String(error ?? '');

  if (isOpencodeNotFoundError(error)) {
    return OPENCODE_NOT_FOUND_MESSAGE;
  }

  return message;
};

/** @param {unknown} error */
const getOpencodeLaunchError = (error) => {
  if (isOpencodeNotFoundError(error)) {
    return createOpencodeNotFoundError();
  }

  const message = getOpencodeLaunchErrorMessage(error);
  if (error instanceof Error && message === error.message) {
    return error;
  }

  return new Error(message);
};

/** @param {unknown} value @returns {string} */
const normalizeOpencodeModel = (value) =>
  typeof value === 'string' && value.trim() ? value.trim() : DEFAULT_OPENCODE_MODEL;

/** @param {string} value */
const isOpencodeModelAvailabilityError = (value) =>
  /\b(?:model_not_found|unknown model|invalid model|model is not available|not available for|not supported|does not have access|do not have access|don't have access|access to model|provider not found|provider_not_found|model.*not.*found|403|404)\b/i.test(
    value,
  );

/**
 * OpenCode's `run --format json` emits an NDJSON stream of typed events. Each event looks like:
 *
 * {"type":"step_start","timestamp":...,"sessionID":"...","part":{"type":"step-start",...}}
 * {"type":"text","timestamp":...,"part":{"type":"text","text":"...","time":{...}}}
 * {"type":"error","timestamp":...,"error":{"name":"UnknownError","data":{"message":"..."}}}
 *
 * Pull the last `text` event emitted, then resolve its `part.text` as a JSON object matching the requested schema. If
 * any `error` event was emitted during the run, surface its message instead so users see the real reason the call
 * failed (often more useful than the generic exit-code message).
 *
 * @param {string} stdout
 * @returns {string} JSON string
 */
const extractAssistantJson = (stdout) => {
  /** @type {string[]} */
  const textParts = [];
  /** @type {string[]} */
  const errorMessages = [];

  for (const rawLine of stdout.split('\n')) {
    const line = rawLine.trim();
    if (!line.startsWith('{')) {
      continue;
    }
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      throw new Error(
        'OpenCode --format json produced output that was not valid NDJSON. ' +
          'Check your `opencode` installation and rerun codiff.',
      );
    }

    const eventType = typeof event?.type === 'string' ? event.type : undefined;
    if (eventType === 'text') {
      const text = event?.part?.text;
      if (typeof text === 'string' && text) {
        textParts.push(text);
      }
    } else if (eventType === 'error') {
      const message = event?.error?.data?.message;
      if (typeof message === 'string' && message) {
        errorMessages.push(message);
      }
    }
  }

  if (errorMessages.length > 0) {
    throw new Error(`OpenCode reported: ${errorMessages[errorMessages.length - 1]}`);
  }

  const finalText = textParts.at(-1);
  if (typeof finalText !== 'string' || !finalText) {
    throw new Error(
      'OpenCode --format json produced no text events. Check your `opencode` installation and rerun codiff.',
    );
  }

  return JSON.stringify(parseJSONMessage(finalText));
};

/**
 * @param {string} repoRoot
 * @param {string} prompt
 * @param {unknown} schema
 * @param {string} [_outputName]
 * @param {string} [timeoutMessage]
 * @param {OpenCodeOptions} [options]
 */
const runOpencode = async (
  repoRoot,
  prompt,
  schema,
  _outputName = 'opencode-output.json',
  timeoutMessage = 'OpenCode timed out.',
  options = {},
) => {
  const model = normalizeOpencodeModel(options.model);
  const fallbackModel = normalizeOpencodeModel(options.fallbackModel || FALLBACK_OPENCODE_MODEL);

  /** @param {string} opencodeModel @returns {Promise<string>} */
  const invokeOpencode = async (opencodeModel) => {
    const directory = await fs.mkdtemp(join(tmpdir(), 'codiff-opencode-'));
    const schemaPath = join(directory, 'schema.json');
    await fs.writeFile(schemaPath, JSON.stringify(schema), 'utf8');

    // Ask the model to emit only the requested JSON, then rely on
    // `opencode run --format json` to deliver the result as a single NDJSON
    // stream of typed events. We pull the assistant's final text event from
    // that stream and re-parse it as JSON against the supplied schema.
    const schemaInstructions = `\n\nReturn ONLY a single JSON object matching this JSON Schema. No prose, no markdown fences, no commentary. Schema:\n${JSON.stringify(schema, null, 2)}`;
    const fullPrompt = prompt + schemaInstructions;

    return await /** @type {Promise<string>} */ (
      new Promise((resolve, reject) => {
        let stderr = '';
        /** @type {Error | null} */
        let stdinError = null;
        let stdout = '';
        let finished = false;

        const opencodeCommand = getOpencodeCommand();
        const opencodeArgs = [
          'run',
          ...(opencodeModel === DEFAULT_OPENCODE_MODEL ? [] : ['--model', opencodeModel]),
          '--dir',
          repoRoot,
          '--format',
          'json',
        ];
        const child = spawn(opencodeCommand, opencodeArgs, {
          env: process.env,
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        const timer = setTimeout(() => {
          if (!finished) {
            finished = true;
            child.kill('SIGTERM');
            reject(new Error(timeoutMessage));
          }
        }, OPENCODE_TIMEOUT_MS);

        child.stdout.on('data', (chunk) => {
          stdout += chunk.toString();
        });
        child.stderr.on('data', (chunk) => {
          stderr += chunk.toString();
        });
        child.stdin.on('error', (error) => {
          stdinError = error;
        });
        child.on('error', (error) => {
          finished = true;
          clearTimeout(timer);
          reject(getOpencodeLaunchError(error));
        });
        child.on('close', (code, signal) => {
          if (finished) {
            return;
          }

          finished = true;
          clearTimeout(timer);

          if (code !== 0) {
            const message = oneLine(
              stderr || stdout || stdinError?.message,
              signal ? `OpenCode was terminated by ${signal}.` : `OpenCode exited with code ${code}.`,
            );
            reject(new Error(getOpencodeLaunchErrorMessage({ message, signal: signal ?? '' })));
            return;
          }

          try {
            resolve(extractAssistantJson(stdout));
          } catch (error) {
            reject(error instanceof Error ? error : new Error(String(error)));
          }
        });

        child.stdin.end(fullPrompt, () => {});
      })
    ).finally(() => fs.rm(directory, { force: true, recursive: true }).catch(() => {}));
  };

  try {
    return await invokeOpencode(model);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (model === fallbackModel || !isOpencodeModelAvailabilityError(message)) {
      throw error;
    }

    const response = await invokeOpencode(fallbackModel);
    await options.onModelFallback?.(fallbackModel, model);
    return response;
  }
};

module.exports = {
  OPENCODE_NOT_FOUND_CODE,
  OPENCODE_NOT_FOUND_MESSAGE,
  DEFAULT_OPENCODE_MODEL,
  FALLBACK_OPENCODE_MODEL,
  getOpencodeCommand,
  getOpencodeLaunchErrorMessage,
  isOpencodeModelAvailabilityError,
  isOpencodeNotFoundError,
  normalizeOpencodeModel,
  OPENCODE_MODELS,
  runOpencode,
};
