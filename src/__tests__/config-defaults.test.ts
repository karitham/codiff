import { copyFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vite-plus/test';
import packageJson from '../../package.json' with { type: 'json' };
import schema from '../config/codiff-config.schema.json' with { type: 'json' };
import { createDefaultConfig } from '../config/defaults.ts';

const require = createRequire(import.meta.url);
const { createDefaultConfig: createElectronDefaultConfig, mergeConfig: mergeElectronConfig } =
  require('../../electron/config.cjs') as {
    createDefaultConfig: typeof createDefaultConfig;
    mergeConfig: (raw: unknown) => { settings: { agentBackend: string } };
  };

const extractDefaults = (schema: any): any => {
  if (schema.default !== undefined) {
    return schema.default;
  }

  if (schema.type === 'object' && schema.properties) {
    const result: Record<string, any> = {};
    for (const [key, prop] of Object.entries(schema.properties)) {
      result[key] = extractDefaults(prop);
    }
    return result;
  }

  return undefined;
};

const getSchemaDefaults = (section: 'keymap' | 'settings') => {
  return extractDefaults(schema.properties[section]);
};

test('schema defaults match config defaults', () => {
  const defaults = createDefaultConfig();

  expect(getSchemaDefaults('settings')).toEqual(defaults.settings);
  expect(getSchemaDefaults('keymap')).toEqual(defaults.keymap);
});

test('electron and renderer defaults match', () => {
  expect(createElectronDefaultConfig()).toEqual(createDefaultConfig());
});

test('electron defaults load from packaged app shape', () => {
  const packageRoot = mkdtempSync(join(tmpdir(), 'codiff-package-shape.'));
  mkdirSync(join(packageRoot, 'config'));
  mkdirSync(join(packageRoot, 'electron'));
  copyFileSync('config/defaults.json', join(packageRoot, 'config/defaults.json'));
  copyFileSync('electron/agent.cjs', join(packageRoot, 'electron/agent.cjs'));
  copyFileSync('electron/codex.cjs', join(packageRoot, 'electron/codex.cjs'));
  copyFileSync('electron/claude.cjs', join(packageRoot, 'electron/claude.cjs'));
  copyFileSync('electron/opencode.cjs', join(packageRoot, 'electron/opencode.cjs'));
  copyFileSync('electron/agent-shared.cjs', join(packageRoot, 'electron/agent-shared.cjs'));
  copyFileSync('electron/codex-session-context.cjs', join(packageRoot, 'electron/codex-session-context.cjs'));
  copyFileSync('electron/claude-session-context.cjs', join(packageRoot, 'electron/claude-session-context.cjs'));
  copyFileSync('electron/opencode-session-context.cjs', join(packageRoot, 'electron/opencode-session-context.cjs'));
  copyFileSync('electron/session-context.cjs', join(packageRoot, 'electron/session-context.cjs'));
  copyFileSync('electron/config.cjs', join(packageRoot, 'electron/config.cjs'));

  const packageRequire = createRequire(join(packageRoot, 'electron/config.cjs'));
  expect(packageRequire('./config.cjs').createDefaultConfig()).toEqual(createDefaultConfig());
});

test('npm package includes shared config defaults', () => {
  expect(packageJson.files).toContain('config');
});

test('mergeConfig preserves the opencode agent backend', () => {
  expect(mergeElectronConfig({ settings: { agentBackend: 'opencode' } }).settings.agentBackend).toBe('opencode');
  expect(mergeElectronConfig({ settings: { agentBackend: 'codex' } }).settings.agentBackend).toBe('codex');
  expect(mergeElectronConfig({ settings: { agentBackend: 'claude' } }).settings.agentBackend).toBe('claude');
  expect(mergeElectronConfig({ settings: { agentBackend: 'unknown' } }).settings.agentBackend).toBe('codex');
});
