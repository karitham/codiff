import { createRequire } from 'node:module';
import { expect, test } from 'vite-plus/test';

const require = createRequire(import.meta.url);
const { AGENT_BACKENDS, DEFAULT_AGENT_BACKEND, getAgent, listAgents, normalizeAgentBackend } =
  require('../agent.cjs') as {
    AGENT_BACKENDS: ReadonlyArray<'codex' | 'claude' | 'opencode'>;
    DEFAULT_AGENT_BACKEND: string;
    getAgent: (backendId: unknown) => {
      id: string;
      label: string;
      sessionLaunchOptionKey: string;
      notFoundCode: string;
      run: unknown;
      readSessionContext: unknown;
      skill: { sourceSubdir: string; targetSubdir: string };
    };
    listAgents: () => ReadonlyArray<{ id: string }>;
    normalizeAgentBackend: (value: unknown) => string;
  };

test('normalizes unknown agent backends to the default', () => {
  expect(normalizeAgentBackend('claude')).toBe('claude');
  expect(normalizeAgentBackend('codex')).toBe('codex');
  expect(normalizeAgentBackend('gpt')).toBe(DEFAULT_AGENT_BACKEND);
  expect(normalizeAgentBackend(undefined)).toBe(DEFAULT_AGENT_BACKEND);
});

test('lists both agent backends', () => {
  expect(AGENT_BACKENDS).toEqual(['codex', 'claude', 'opencode']);
  expect(listAgents().map((agent) => agent.id)).toEqual(['codex', 'claude', 'opencode']);
});

test('resolves the Codex agent with its session and skill wiring', () => {
  const agent = getAgent('codex');
  expect(agent.id).toBe('codex');
  expect(agent.sessionLaunchOptionKey).toBe('codexSessionId');
  expect(agent.notFoundCode).toBe('CODEX_NOT_FOUND');
  expect(agent.skill).toEqual({
    label: 'Codex Skill',
    sourceSubdir: 'codex/skills/codiff',
    targetSubdir: '.codex/skills/codiff',
  });
  expect(typeof agent.run).toBe('function');
  expect(typeof agent.readSessionContext).toBe('function');
});

test('resolves the Claude Code agent with its session and skill wiring', () => {
  const agent = getAgent('claude');
  expect(agent.id).toBe('claude');
  expect(agent.label).toBe('Claude Code');
  expect(agent.sessionLaunchOptionKey).toBe('claudeSessionId');
  expect(agent.notFoundCode).toBe('CLAUDE_NOT_FOUND');
  expect(agent.skill).toEqual({
    label: 'Claude Code Skill',
    sourceSubdir: 'claude/skills/codiff',
    targetSubdir: '.claude/skills/codiff',
  });
});

test('resolves the OpenCode agent with its session and tool wiring', () => {
  const agent = getAgent('opencode');
  expect(agent.id).toBe('opencode');
  expect(agent.label).toBe('OpenCode');
  expect(agent.sessionLaunchOptionKey).toBe('opencodeSessionId');
  expect(agent.notFoundCode).toBe('OPENCODE_NOT_FOUND');
  expect(agent.skill).toEqual({
    label: 'OpenCode Tool',
    sourceSubdir: 'opencode/tools/codiff.ts',
    targetSubdir: '.config/opencode/tools/codiff.ts',
  });
});

test('falls back to the default backend for unknown ids', () => {
  expect(getAgent('unknown').id).toBe(DEFAULT_AGENT_BACKEND);
});
