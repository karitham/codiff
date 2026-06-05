// @ts-check

const { spawnSync } = require('node:child_process');
const { cleanText, MAX_SESSION_MESSAGE_CHARS, truncate } = require('./session-context.cjs');
const { getOpencodeCommand } = require('./opencode.cjs');

/** @typedef {import('../src/types.ts').WalkthroughContext} WalkthroughContext */

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

        // Handle OpenCode's message format
        if ('type' in item && item.type === 'text' && 'text' in item && typeof item.text === 'string') {
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
  return normalized === 'codiff' || normalized === 'show me codiff' || normalized === 'open codiff';
};

/**
 * Extract a message from OpenCode export format
 *
 * @param {unknown} input
 */
const extractMessage = (input) => {
  if (!input || typeof input !== 'object') {
    return null;
  }

  // OpenCode export format: { role: 'user' | 'assistant', content: string | array }
  const role = 'role' in input ? input.role : undefined;
  if (role !== 'assistant' && role !== 'user') {
    return null;
  }

  const content = 'content' in input ? input.content : null;
  const text = truncate(extractContentText(content), MAX_SESSION_MESSAGE_CHARS);

  if (!text || isNoiseMessage(text)) {
    return null;
  }

  return { role, text };
};

/**
 * Read OpenCode session context using the CLI
 *
 * @param {string | undefined} sessionId
 * @returns {WalkthroughContext | null}
 */
const readOpencodeSessionContext = (sessionId) => {
  if (typeof sessionId !== 'string' || !sessionId) {
    return null;
  }

  let opencodeCommand;
  try {
    opencodeCommand = getOpencodeCommand();
  } catch {
    return null;
  }

  const result = spawnSync(opencodeCommand, ['export', sessionId], {
    encoding: 'utf8',
    timeout: 10_000,
  });

  if (result.error || result.status !== 0) {
    return null;
  }

  let sessionData;
  try {
    sessionData = JSON.parse(result.stdout);
  } catch {
    return null;
  }

  // Extract messages from the exported session
  const rawMessages = sessionData?.messages || sessionData?.transcript || [];

  /** @type {{ role: 'assistant' | 'user'; text: string }[]} */
  const messages = [];
  for (const msg of rawMessages) {
    const message = extractMessage(msg);
    if (message) {
      messages.push(message);
    }
  }

  return {
    messages,
    risks:
      messages.length === 0
        ? ['Codiff could not find recent readable messages for the linked OpenCode session.']
        : undefined,
    source: {
      generatedAt: new Date().toISOString(),
      threadId: sessionId,
      type: 'opencode-session-excerpt',
    },
    version: 1,
  };
};

module.exports = {
  readOpencodeSessionContext,
};
