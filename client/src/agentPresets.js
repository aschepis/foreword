/**
 * Well-known agent presets. Each preset knows how to build a shell command
 * for both review-kind and fix-kind agents, given a model id.
 *
 * `buildCommand(model, kind)` returns the full command string.
 * Set provider='other' for a fully custom command.
 */
export const AGENT_PRESETS = {
  claude: {
    id: 'claude',
    label: 'Claude Code',
    bin: 'claude',
    hint: 'Anthropic\'s Claude Code CLI. Stdin → prompt, stdout → response.',
    models: [
      { id: 'claude-opus-4-7', label: 'Opus 4.7 — most capable' },
      { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6 — balanced' },
      { id: 'claude-haiku-4-5', label: 'Haiku 4.5 — fast / cheap' },
    ],
    defaultModel: 'claude-sonnet-4-6',
    buildCommand: (model, kind) => {
      const m = model ? ` --model ${model}` : '';
      if (kind === 'fix') {
        return `claude -p --permission-mode acceptEdits --output-format json${m}`;
      }
      return `claude -p --output-format json${m}`;
    },
  },
  codex: {
    id: 'codex',
    label: 'Codex (OpenAI)',
    bin: 'codex',
    hint: 'OpenAI Codex CLI. Tweak the command if your version uses different flags.',
    models: [
      { id: 'gpt-5', label: 'GPT-5' },
      { id: 'gpt-5-mini', label: 'GPT-5 mini' },
      { id: 'gpt-4.1', label: 'GPT-4.1' },
    ],
    defaultModel: 'gpt-5',
    buildCommand: (model, kind) => {
      const m = model ? ` --model ${model}` : '';
      if (kind === 'fix') return `codex exec --skip-git-repo-check${m}`;
      return `codex exec --skip-git-repo-check${m}`;
    },
  },
  gemini: {
    id: 'gemini',
    label: 'Gemini CLI',
    bin: 'gemini',
    hint: 'Google\'s Gemini CLI. `-p ""` engages headless mode; the actual prompt comes from stdin (Gemini appends the -p value to stdin), so no ARG_MAX concern. Model list may lag Google\'s releases — switch to "Other" and use --model with a current ID if needed.',
    models: [
      { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro — most capable' },
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash — fast / cheap' },
      { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash — older fast' },
      { id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro — older capable' },
    ],
    defaultModel: 'gemini-2.5-pro',
    buildCommand: (model, kind) => {
      const m = model ? ` --model ${model}` : '';
      /* Gemini requires `-p` to receive *some* value to switch into headless
         mode, but it then APPENDS that value to whatever is on stdin. Passing
         "" means the effective prompt is just stdin, which the runner pipes. */
      if (kind === 'fix') return `gemini --yolo -p ""${m}`;
      return `gemini -p ""${m}`;
    },
  },
  other: {
    id: 'other',
    label: 'Other / custom',
    hint: 'Type any shell command. Your prompt arrives on stdin; stdout is parsed for findings.',
    models: [],
    defaultModel: null,
    buildCommand: () => '',
  },
};

export const PRESET_ORDER = ['claude', 'codex', 'gemini', 'other'];
