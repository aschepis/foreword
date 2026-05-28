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
    hint: 'Google\'s Gemini CLI. The runner writes the prompt to a temp file and we point Gemini at it via its @file syntax, so even huge diffs don\'t hit ARG_MAX.',
    models: [
      { id: 'gemini-3-pro', label: 'Gemini 3 Pro' },
      { id: 'gemini-3-flash', label: 'Gemini 3 Flash' },
    ],
    defaultModel: 'gemini-3-pro',
    buildCommand: (model, kind) => {
      const m = model ? ` --model ${model}` : '';
      /* The runner exposes the rendered prompt at $LOCAL_REVIEW_PROMPT_FILE.
         `@<path>` is Gemini CLI's file-inclusion syntax — it reads the file
         into the prompt instead of passing it as argv, sidestepping ARG_MAX. */
      if (kind === 'fix') return `gemini --yolo -p "@$LOCAL_REVIEW_PROMPT_FILE"${m}`;
      return `gemini -p "@$LOCAL_REVIEW_PROMPT_FILE"${m}`;
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
