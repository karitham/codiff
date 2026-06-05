// @ts-check

const { cleanText, createSessionContextReader, MAX_SESSION_MESSAGE_CHARS, truncate } = require('./session-context.cjs');

/**
 * @typedef {import('../src/types.ts').WalkthroughContext} WalkthroughContext
 */

/** @param {unknown} value */
const extractContentText = (value) => {
  if (typeof value === 'string') {
    return cleanText(value);
  }

  if (!Array.isArray(value)) {
    return '';
  }

  return cleanText(
    value
      .map((item) => {
        if (!item || typeof item !== 'object') {
          return '';
        }

        if (
          'type' in item &&
          item.type === 'text' &&
          'text' in item &&
          typeof item.text === 'string'
        ) {
          return item.text;
        }

        return '';
      })
      .filter(Boolean)
      .join('\n'),
  );
};

/** @param {string} text */
const isNoiseMessage = (text) => {
  const normalized = cleanText(text).toLowerCase();
  return (
    normalized === '/codiff' ||
    normalized === 'codiff' ||
    normalized === 'show me codiff' ||
    normalized === 'open codiff'
  );
};

/** @param {string} path @param {string} sessionId */
const pathMatchesSessionId = (path, sessionId) =>
  path.toLowerCase().endsWith(`${sessionId.toLowerCase()}.jsonl`);

/** @param {unknown} input */
const extractMessage = (input) => {
  if (!input || typeof input !== 'object') {
    return null;
  }

  if (!('type' in input) || (input.type !== 'user' && input.type !== 'assistant')) {
    return null;
  }

  const message = 'message' in input ? input.message : null;
  if (!message || typeof message !== 'object') {
    return null;
  }

  const role = 'role' in message ? message.role : undefined;
  if (role !== 'assistant' && role !== 'user') {
    return null;
  }

  const text = truncate(
    extractContentText('content' in message ? message.content : null),
    MAX_SESSION_MESSAGE_CHARS,
  );
  if (!text || isNoiseMessage(text)) {
    return null;
  }

  return { role, text };
};

const readClaudeSessionContext = createSessionContextReader({
  envHomeVar: 'CLAUDE_CONFIG_DIR',
  defaultHomeSubdir: '.claude',
  searchSubdir: 'projects',
  sessionType: 'claude-session-excerpt',
  notFoundWarning: 'Codiff could not find recent readable messages for the linked Claude Code session.',
  pathMatchesSessionId,
  extractContentText,
  extractMessage,
  isNoiseMessage,
});

module.exports = {
  readClaudeSessionContext,
};
