// @ts-check

const { cleanText, createSessionContextReader, MAX_SESSION_MESSAGE_CHARS, truncate } = require('./session-context.cjs');

/**
 * @typedef {import('../src/types.ts').WalkthroughContext} WalkthroughContext
 */

/** @param {unknown} value */
const extractContentText = (value) => {
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
          'text' in item &&
          typeof item.text === 'string' &&
          (!('type' in item) ||
            item.type === 'input_text' ||
            item.type === 'output_text' ||
            item.type === 'text')
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
    normalized === '$codiff' || normalized === 'show me codiff' || normalized === 'open codiff'
  );
};

/** @param {string} path @param {string} sessionId */
const pathMatchesSessionId = (path, sessionId) =>
  path.endsWith('.jsonl') && path.toLowerCase().includes(sessionId.toLowerCase());

/** @param {unknown} input */
const extractMessage = (input) => {
  if (!input || typeof input !== 'object') {
    return null;
  }

  if (!('type' in input) || input.type !== 'response_item') {
    return null;
  }

  const payload = 'payload' in input ? input.payload : null;
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  if (!('type' in payload) || payload.type !== 'message') {
    return null;
  }

  const role = 'role' in payload ? payload.role : undefined;
  if (role !== 'assistant' && role !== 'user') {
    return null;
  }

  const text = truncate(
    extractContentText('content' in payload ? payload.content : null),
    MAX_SESSION_MESSAGE_CHARS,
  );
  if (!text || isNoiseMessage(text)) {
    return null;
  }

  return { role, text };
};

const readCodexSessionContext = createSessionContextReader({
  envHomeVar: 'CODEX_HOME',
  defaultHomeSubdir: '.codex',
  searchSubdir: 'sessions',
  sessionType: 'codex-session-excerpt',
  notFoundWarning: 'Codiff could not find recent readable messages for the linked Codex session.',
  pathMatchesSessionId,
  extractContentText,
  extractMessage,
  isNoiseMessage,
});

module.exports = {
  readCodexSessionContext,
};
