export type CodiffDiffStyle = 'split' | 'unified';
export type CodiffTheme = 'system' | 'light' | 'dark';
export type CodiffAgentBackend = 'codex' | 'claude' | 'opencode';

/**
 * Codex backend configuration. Own type so Codex-specific fields (e.g., reasoningEffort) can be added without affecting
 * other backends.
 */
export type CodexAgentConfig = {
  fallbackModel: string;
  model: string;
};

/** Claude Code backend configuration. Own type so Claude-specific fields can be added without affecting other backends. */
export type ClaudeAgentConfig = {
  fallbackModel: string;
  model: string;
};

/**
 * OpenCode backend configuration. Own type so OpenCode-specific fields (e.g., provider) can be added without affecting
 * other backends.
 */
export type OpenCodeAgentConfig = {
  fallbackModel: string;
  model: string;
};

/** Per-backend configuration map. Each backend owns its config type, allowing them to drift independently. */
export type CodiffAgentConfigs = {
  claude: ClaudeAgentConfig;
  codex: CodexAgentConfig;
  opencode: OpenCodeAgentConfig;
};

export type CodiffSettings = {
  agentBackend: CodiffAgentBackend;
  agents: CodiffAgentConfigs;
  copyCommentsOnClose: boolean;
  diffStyle: CodiffDiffStyle;
  editorCommand: string;
  lastRepositoryPath: string;
  showOutdated: boolean;
  showWhitespace: boolean;
  theme: CodiffTheme;
  wordWrap: boolean;
};

export type KeyCombo = string;

// A shortcut can be a single combo or a list of aliases that all trigger the action.
export type KeyComboBinding = KeyCombo | ReadonlyArray<KeyCombo>;

export type CodiffKeymap = {
  closeSearch: KeyCombo;
  commandBar: KeyCombo;
  diffSearch: KeyCombo;
  discardComment: KeyCombo;
  fileFilter: KeyCombo;
  nextHunk: KeyComboBinding;
  nextSearchMatch: KeyCombo;
  openFile: KeyCombo;
  prevHunk: KeyComboBinding;
  prevSearchMatch: KeyCombo;
  shortcutsHelp: KeyCombo;
  submitComment: KeyCombo;
  toggleSidebar: KeyCombo;
  toggleWordWrap: KeyCombo;
};

export type CodiffConfig = {
  keymap: CodiffKeymap;
  settings: CodiffSettings;
};
