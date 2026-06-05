// @ts-check

const codex = require('./codex.cjs');
const claude = require('./claude.cjs');
const opencode = require('./opencode.cjs');
const { readCodexSessionContext } = require('./codex-session-context.cjs');
const { readClaudeSessionContext } = require('./claude-session-context.cjs');
const { readOpencodeSessionContext } = require('./opencode-session-context.cjs');

/**
 * @typedef {import('../src/types.ts').WalkthroughContext} WalkthroughContext
 * @typedef {{
 *   fallbackModel?: string;
 *   model?: string;
 *   onModelFallback?: (fallbackModel: string, originalModel: string) => Promise<void> | void;
 * }} AgentOptions
 * @typedef {{
 *   id: 'codex' | 'claude' | 'opencode';
 *   label: string;
 *   cliName: string;
 *   cliPathEnvVar: string;
 *   models: ReadonlyArray<{id: string; label: string}>;
 *   defaultModel: string;
 *   fallbackModel: string;
 *   normalizeModel: (value: unknown) => string;
 *   notFoundCode: string;
 *   isNotFoundError: (error: unknown) => boolean;
 *   run: (
 *     repoRoot: string,
 *     prompt: string,
 *     schema: unknown,
 *     outputName?: string,
 *     timeoutMessage?: string,
 *     options?: AgentOptions,
 *   ) => Promise<string>;
 *   readSessionContext: (sessionId: string | undefined) => WalkthroughContext | null;
 *   sessionLaunchOptionKey: 'codexSessionId' | 'claudeSessionId' | 'opencodeSessionId';
 *   skill: {label: string; sourceSubdir: string; targetSubdir: string};
 * }} Agent
 */

const DEFAULT_AGENT_BACKEND = 'codex';
/** @type {ReadonlyArray<'codex' | 'claude' | 'opencode'>} */
const AGENT_BACKENDS = Object.freeze(['codex', 'claude', 'opencode']);

/** @returns {Agent} */
const createCodexAgent = () => ({
  id: 'codex',
  label: 'Codex',
  cliName: 'codex',
  cliPathEnvVar: 'CODIFF_CODEX_PATH',
  models: codex.OPENAI_MODELS,
  defaultModel: codex.DEFAULT_OPENAI_MODEL,
  fallbackModel: codex.FALLBACK_OPENAI_MODEL,
  normalizeModel: codex.normalizeOpenAIModel,
  notFoundCode: codex.CODEX_NOT_FOUND_CODE,
  isNotFoundError: codex.isCodexNotFoundError,
  run: codex.runCodex,
  readSessionContext: readCodexSessionContext,
  sessionLaunchOptionKey: 'codexSessionId',
  skill: {
    label: 'Codex Skill',
    sourceSubdir: 'codex/skills/codiff',
    targetSubdir: '.codex/skills/codiff',
  },
});

/** @returns {Agent} */
const createClaudeAgent = () => ({
  id: 'claude',
  label: 'Claude Code',
  cliName: 'claude',
  cliPathEnvVar: 'CODIFF_CLAUDE_PATH',
  models: claude.CLAUDE_MODELS,
  defaultModel: claude.DEFAULT_CLAUDE_MODEL,
  fallbackModel: claude.FALLBACK_CLAUDE_MODEL,
  normalizeModel: claude.normalizeClaudeModel,
  notFoundCode: claude.CLAUDE_NOT_FOUND_CODE,
  isNotFoundError: claude.isClaudeNotFoundError,
  run: claude.runClaude,
  readSessionContext: readClaudeSessionContext,
  sessionLaunchOptionKey: 'claudeSessionId',
  skill: {
    label: 'Claude Code Skill',
    sourceSubdir: 'claude/skills/codiff',
    targetSubdir: '.claude/skills/codiff',
  },
});

/** @returns {Agent} */
const createOpencodeAgent = () => ({
  id: 'opencode',
  label: 'OpenCode',
  cliName: 'opencode',
  cliPathEnvVar: 'CODIFF_OPENCODE_PATH',
  models: opencode.OPENCODE_MODELS,
  defaultModel: opencode.DEFAULT_OPENCODE_MODEL,
  fallbackModel: opencode.FALLBACK_OPENCODE_MODEL,
  normalizeModel: opencode.normalizeOpencodeModel,
  notFoundCode: opencode.OPENCODE_NOT_FOUND_CODE,
  isNotFoundError: opencode.isOpencodeNotFoundError,
  run: opencode.runOpencode,
  readSessionContext: readOpencodeSessionContext,
  sessionLaunchOptionKey: 'opencodeSessionId',
  skill: {
    label: 'OpenCode Tool',
    sourceSubdir: 'opencode/tools/codiff.ts',
    targetSubdir: '.config/opencode/tools/codiff.ts',
  },
});

/** @type {Record<'codex' | 'claude' | 'opencode', () => Agent>} */
const AGENT_FACTORIES = {
  claude: createClaudeAgent,
  codex: createCodexAgent,
  opencode: createOpencodeAgent,
};

/** @param {unknown} value @returns {'codex' | 'claude' | 'opencode'} */
const normalizeAgentBackend = (value) =>
  value === 'codex' || value === 'claude' || value === 'opencode' ? value : DEFAULT_AGENT_BACKEND;

/** @param {unknown} backendId @returns {Agent} */
const getAgent = (backendId) => AGENT_FACTORIES[normalizeAgentBackend(backendId)]();

/** @returns {ReadonlyArray<Agent>} */
const listAgents = () => AGENT_BACKENDS.map((id) => AGENT_FACTORIES[id]());

module.exports = {
  AGENT_BACKENDS,
  DEFAULT_AGENT_BACKEND,
  getAgent,
  listAgents,
  normalizeAgentBackend,
};
