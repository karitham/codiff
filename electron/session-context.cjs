// @ts-check

const { existsSync, readFileSync, readdirSync, statSync } = require('node:fs');
const { homedir } = require('node:os');
const { join } = require('node:path');
const { cleanText, truncate } = require('./agent-shared.cjs');

const MAX_SESSION_SCAN_FILES = 20_000;
const MAX_SESSION_MESSAGE_CHARS = 2_400;
const MAX_SESSION_MESSAGES = 18;
const MAX_SESSION_CONTEXT_CHARS = 28_000;
const SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** @typedef {import('../src/types.ts').WalkthroughContext} WalkthroughContext */

/**
 * Backend-specific configuration for reading session transcripts.
 *
 * @typedef {{
 *   envHomeVar: string;
 *   defaultHomeSubdir: string;
 *   searchSubdir: string;
 *   sessionType: string;
 *   notFoundWarning: string;
 *   pathMatchesSessionId: (path: string, sessionId: string) => boolean;
 *   extractContentText: (value: unknown) => string;
 *   extractMessage: (input: unknown) => { role: 'assistant' | 'user'; text: string } | null;
 *   isNoiseMessage: (text: string) => boolean;
 * }} SessionReaderConfig
 */

/** @param {unknown} value */
const normalizeSessionId = (value) => (typeof value === 'string' && SESSION_ID_PATTERN.test(value) ? value : '');

/**
 * @param {SessionReaderConfig} readerConfig
 * @returns {string}
 */
const getSessionHome = (readerConfig) =>
  process.env[readerConfig.envHomeVar] || join(homedir(), readerConfig.defaultHomeSubdir);

/**
 * @param {SessionReaderConfig} readerConfig
 * @param {string} root
 * @param {string} sessionId
 */
const findSessionFile = (readerConfig, root, sessionId) => {
  if (!sessionId || !existsSync(root)) {
    return null;
  }

  /** @type {string[]} */
  const stack = [root];
  let scanned = 0;

  while (stack.length > 0 && scanned < MAX_SESSION_SCAN_FILES) {
    const directory = stack.pop();
    if (!directory) {
      continue;
    }

    /** @type {import('node:fs').Dirent[]} */
    let entries;
    try {
      entries = readdirSync(directory, { withFileTypes: true }).sort((a, b) => b.name.localeCompare(a.name));
    } catch {
      continue;
    }

    for (const entry of entries) {
      scanned += 1;
      const path = join(directory, entry.name);
      if (entry.isFile() && readerConfig.pathMatchesSessionId(path, sessionId)) {
        return path;
      }

      if (entry.isDirectory()) {
        stack.push(path);
      }

      if (scanned >= MAX_SESSION_SCAN_FILES) {
        break;
      }
    }
  }

  return null;
};

/**
 * @param {SessionReaderConfig} readerConfig
 * @param {string} sessionPath
 */
const readSessionMessages = (readerConfig, sessionPath) => {
  const stat = statSync(sessionPath);
  if (!stat.isFile()) {
    return [];
  }

  /** @type {{ role: 'assistant' | 'user'; text: string }[]} */
  const messages = [];
  let totalChars = 0;

  for (const line of readFileSync(sessionPath, 'utf8').split('\n')) {
    if (!line.trim()) {
      continue;
    }

    try {
      const message = readerConfig.extractMessage(JSON.parse(line));
      if (!message) {
        continue;
      }

      messages.push(message);
    } catch {
      // Ignore malformed or future-format records in session logs.
    }
  }

  /** @type {{ role: 'assistant' | 'user'; text: string }[]} */
  const selected = [];
  for (const message of messages.slice().reverse()) {
    if (selected.length >= MAX_SESSION_MESSAGES) {
      break;
    }

    const cost = message.role.length + message.text.length + 2;
    if (selected.length > 0 && totalChars + cost > MAX_SESSION_CONTEXT_CHARS) {
      break;
    }

    selected.push(message);
    totalChars += cost;
  }

  return selected.reverse();
};

/**
 * Create a session context reader for a specific backend.
 *
 * @param {SessionReaderConfig} readerConfig
 * @returns {(sessionId: string | undefined) => WalkthroughContext | null}
 */
const createSessionContextReader = (readerConfig) => {
  /** @param {string | undefined} sessionId */
  return (sessionId) => {
    const threadId = normalizeSessionId(sessionId);
    if (!threadId) {
      return null;
    }

    const home = getSessionHome(readerConfig);
    const path = findSessionFile(readerConfig, join(home, readerConfig.searchSubdir), threadId);
    const messages = path ? readSessionMessages(readerConfig, path) : [];

    return {
      messages,
      risks: messages.length === 0 ? [readerConfig.notFoundWarning] : undefined,
      source: {
        generatedAt: new Date().toISOString(),
        threadId,
        type: /** @type {any} */ (readerConfig.sessionType),
      },
      version: 1,
    };
  };
};

module.exports = {
  MAX_SESSION_CONTEXT_CHARS,
  MAX_SESSION_MESSAGE_CHARS,
  MAX_SESSION_MESSAGES,
  MAX_SESSION_SCAN_FILES,
  SESSION_ID_PATTERN,
  cleanText,
  createSessionContextReader,
  findSessionFile,
  normalizeSessionId,
  readSessionMessages,
  truncate,
};
