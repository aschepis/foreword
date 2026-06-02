# Foreword

> Self-review tool for the agentic-coding era.

Agents write the code. Humans are the last line of defense before that code lands on a teammate or in production. Self-review is the highest-leverage moment in modern engineering — and **Foreword** is a tool that actually makes it pleasant: a beautiful diff viewer, agentic reviewers running in parallel, a one-click fix-agent loop, risk scoring, and commit-by-commit time travel — all running locally against any git repo on your machine.

The name comes from publishing: a *foreword* is the bit that precedes the main work, where someone close to it gives it a careful pass before the rest of the world reads it. That's what self-review is.

```
┌─ FILE CARDS ─────────────────────────────────────────────┐
│ ☑ Viewed  internal/handlers/v1_orgs.go  CHANGED  +73 −12 │
│                                                          │
│   • Risk Radar ranks files by size · churn · fan-in ·    │
│     test-companion · agent agreement                     │
│   • AI Reviewers run in parallel; consensus filter cuts  │
│     single-model noise                                   │
│   • Time-Travel scrubs the branch commit-by-commit       │
│   • Fix agent autonomously addresses 🔧 fixable comments │
│     and commits each change discretely                   │
└──────────────────────────────────────────────────────────┘
```

---

## Why

Pre-PR self-review is the highest-leverage moment in modern engineering:
- It's the only point where the human who wrote the code reads the code.
- It's cheap (no teammate context-switch yet) but high-impact (catches the most bugs).
- With AI doing more authorship, the meaning of "I wrote this code" has shifted toward "I reviewed this code carefully."

But the tooling for self-review is awful: a terminal `git diff`, browser tab gymnastics, no persistence, no AI assistance, no way to mark progress on a 50-file diff. Foreword fixes that.

---

## Features

### Beautiful, modern diff UI
- **GitHub-dark, syntax-highlighted side-by-side or unified diff** (powered by [react-diff-view](https://github.com/otakustay/react-diff-view) + refractor).
- **Per-file cards** with sticky headers, collapse, additions/deletions chips, and renamed/added/deleted/copied badges.
- **Viewed checkbox** on each file (in the header *and* the sidebar). Ticking auto-collapses the file body, GitHub-style. If the file changes since you reviewed it, the checkbox un-ticks itself with a `CHANGED SINCE REVIEW` badge.
- **Threaded inline comments** anchored to specific lines, plus a global comments drawer for review-wide thoughts.
- **Replies** to any comment (including AI findings), with optional `🔧 Agent-fixable` flag so a fix agent will address them.
- **Hide-whitespace toggle**.
- **Keyboard navigation**: `j`/`k` to cycle through pinned findings (with wrap), `,`/`.` to scrub commits, `w` to toggle whitespace, `f` to switch unified ↔ split, `g` for a global comment, `?` for the full list.

### AI reviewers (`kind: review`)
- Configure agents that shell out to **Claude Code**, **Codex**, **Gemini CLI**, or any custom command. The Settings UI auto-generates the shell command from a provider + model dropdown; pick **Other** for full customization.
- Run **multiple agents in parallel**. Findings are pinned to the exact line in the diff if the agent provided one, or surfaced in a Global Findings drawer if not.
- **Consensus filter** ("≥2 agents agree") cuts single-model noise on big batches.
- **Run inspector** — for every agent run, see the exact prompt (with goals injected), stdout, stderr, exit code, duration, and the parsed findings table. Copy or download any pane. Re-run individual agents from the inspector or each row of the history.

### Fix agents (`kind: fix`)
- Mark a comment (or a reply to an agent finding) **`🔧 Agent-fixable`** to flag it for the fix agent.
- Click **Run fix agent on N comment(s)** and an autonomous loop kicks in: for each fixable comment, the runner snapshots HEAD, shells out to the fix agent in the worktree, and verifies a new commit landed. **One discrete commit per fix.**
- Live ndjson progress stream — see each comment go `◌ running → ✓ fixed (sha) duration` in real time.
- On success, comments are marked `fix_status='fixed'` with the commit SHA recorded; future runs skip them. Failed runs are retryable.
- **Reload prompt** when the session completes — refreshes the diff, comments, risk, commits, and review head_sha so you see the new state.
- **Pre-flight check** refuses to start if the worktree is dirty, protecting your in-progress work from being entangled with fix commits.

### Three "killer" features

#### 1. Multi-agent consensus
Multiple AI reviewers run in parallel against the same diff. Findings on the same line stack visually. A "consensus only (≥2 agents)" filter lets you say "only show me what multiple models agree on" — a strong signal that something is actually wrong.

#### 2. Commit Time-Travel
A scrubber above the diff lets you play back the branch commit-by-commit. Two modes:
- **Cumulative** — see the diff up to commit N.
- **Per-commit** — see only what changed in commit N (great for spotting "this commit undid the previous one" or "this commit snuck in unrelated changes").

Keyboard: `,` / `.` step backward / forward through commits.

#### 3. Risk Radar — suggested review order
Each non-test file is scored on five signals and bucketed `low` / `medium` / `high`:
| Signal | Weight | What |
|---|---|---|
| size | 0.25 | additions + deletions, normalized at 200 |
| churn | 0.20 | commits in last 90 days, normalized at 30 |
| fan-in | 0.20 | rough cross-file references via `git grep`, normalized at 50 |
| no-test penalty | 0.15 | 0.5 if change > 20 lines and no companion test file was touched |
| agent agreement | 0.20 | distinct AI reviewers flagging the file + a small bump per finding |

The radar reorders the file list by score so you can spend your attention on the dangerous 20% of files first.

### Review goals
Persistent, project-wide statements of what you care about in every review — "audit-log every state-changing handler", "no SQL string concat with user input", etc. Each AI agent opts in via **Include goals**; when enabled, the runner injects the active goals into the prompt either at `{{goals}}` or auto-prepended. Updates to goals take effect on the next run.

### Worktree-aware
- Add any local git repo by absolute path; Foreword enumerates all `git worktree` entries.
- Per-review you pick which worktree to operate from. All git ops (diffs, commits from fix agents) run in that worktree.

### Persistence + privacy
- All data lives in a local SQLite database at `~/.foreword/data.sqlite` (override with `FOREWORD_DATA_DIR`).
- **Nothing leaves your machine** unless an AI agent you configured calls out to a remote model. Foreword itself never makes network requests.
- Reviews, comments, findings, agent runs, goals — all stored and replayable. Run inspector lets you audit exactly what each agent saw and said.
- Danger-zone admin actions: **Clear reviews** (keeps repos + agents + goals) and **Clean slate** (nukes everything; requires typing `DELETE EVERYTHING` to confirm).

---

## Getting started

### Requirements
- **Node 20.19+** (managed via `mise.toml`)
- **pnpm 10+**
- `git` on `$PATH`
- An AI agent CLI of your choice (`claude`, `codex`, `gemini`, …) if you want AI reviews/fixes

### Install
```bash
mise install            # picks up mise.toml — installs the pinned Node + pnpm
pnpm install
pnpm build
pnpm start              # serves at http://localhost:3200
```

Open `http://localhost:3200`, add the absolute path to a git repo, pick a branch, and you're reviewing.

### Daily use
1. **Add a repo** (Home → paste absolute path). Worktrees are enumerated automatically.
2. **Start a review** — pick worktree, base ref (defaults to your default branch / merge-base), head ref (defaults to the currently-checked-out branch).
3. **Configure AI agents** (Settings → AI agents). Pick a preset (Claude / Codex / Gemini) or "Other"; choose a model from the dropdown; choose `Review` or `Fix` kind.
4. **Run reviewers** in the AI Reviewers panel; findings land inline on the diff.
5. **Mark files Viewed** as you go (header checkbox or sidebar). The header chip turns green and auto-collapses the body.
6. **Reply / flag fixable** — reply to any comment with the `🔧 Agent-fixable` checkbox.
7. **Run the fix agent** (Fix mode panel) and watch each comment get a discrete commit. Accept the reload prompt to see the new state.

### Keyboard shortcuts
| Key | Action |
|---|---|
| `j` / `k` | Next / previous pinned finding (loops at ends) |
| `,` / `.` | Prev / next commit in Time-Travel scrubber |
| `w` | Toggle ignore-whitespace |
| `f` | Toggle unified ↔ side-by-side |
| `g` | Open a global comment |
| `?` | Show all shortcuts |
| Double-click line number | Add a comment on that line |

---

## Configuring AI agents

Open **Settings → AI agents → + new agent**.

1. **Kind** — `🔍 Review` (suggests findings; never edits) or `🔧 Fix` (edits files + commits).
2. **Agent preset** — Claude Code / Codex / Gemini CLI / Other.
3. **Model** — dropdown of provider-specific models. Defaults to a sensible mid-tier.
4. **Shell command** — auto-generated from preset × model × kind; switch to **Other** to write a custom command.
5. **Prompt template** — substituted with `{{diff}}`, `{{file_paths}}`, `{{base}}`, `{{head}}`, `{{goals}}` for reviewers; `{{file}}`, `{{line}}`, `{{comment}}`, `{{thread_context}}`, `{{worktree}}`, `{{before_sha}}` for fix agents.

**How the prompt is delivered** — the rendered prompt is both **piped on stdin** and **written to a temp file** exposed as `$FOREWORD_PROMPT_FILE` (and, for backward compat, `$LOCAL_REVIEW_PROMPT_FILE`) in the shell environment. Pick whichever the agent likes. (Used by Gemini to sidestep ARG_MAX when its CLI doesn't read stdin.)

### Reviewer agent output contract
Reviewers should emit a JSON array of findings on stdout:
```json
[
  {"file": "path/to/file.go", "line": 42, "severity": "warn", "message": "this race ..."}
]
```
The parser is forgiving: it unwraps Claude Code's `{type:"result",result:"…"}` envelope, accepts JSON inside ` ```json ` fences, and as a last resort surfaces the raw text as a single global "agent commentary" finding so you always see what the agent said.

### Fix agent contract
Fix agents are run **once per fixable comment**, sequentially, in the worktree directory. The agent should:
1. Read the prompt (instructions + the conversation context for one comment).
2. Make the change.
3. Stage + `git commit` (use a message starting with `fix(foreword): `).
4. Make **exactly one commit** per invocation.
5. If no change is needed, do NOT commit; just explain. The comment will be marked `skipped` and you can retry.

After the session, `reviews.head_sha` is advanced to the new HEAD so the diff reloads with the fixes included.

---

## Architecture

```
┌──────────────────────┐         ┌──────────────────────┐
│ React + Vite client  │ ──/api──→ Express server (3200) │
│  · react-diff-view   │         │  · better-sqlite3    │
│  · refractor (Prism) │         │  · simple-git        │
│  · Tailwind          │         │  · spawn() agent CLIs│
└──────────────────────┘         └──────────────────────┘
                                            │
                                            ↓
                                  ~/.foreword/data.sqlite
```

### Stack
- **Backend**: Node + Express, `better-sqlite3` (synchronous, embedded, no daemon), `simple-git` (wrapper around the `git` binary).
- **Frontend**: React + Vite, `react-diff-view` for the diff, `refractor` for syntax highlighting, Tailwind for everything else, `react-router-dom` for navigation.
- **Agent runner**: `child_process.spawn` with the prompt delivered via stdin + a temp file (`$FOREWORD_PROMPT_FILE`).
- **One process** serves the API and the static client build in production.

### Data model (SQLite)
```
repos        ←  worktrees
reviews      ←  file_reviewed, comments (threaded), agent_runs, agent_findings
agent_configs (kind=review|fix, provider, model, include_goals)
goals        (global; injected into agent prompts when include_goals=1)
```
All schemas use additive `ALTER TABLE … ADD COLUMN` migrations, run idempotently on every boot — pulling main never breaks an existing local DB.

### Project layout
```
mise.toml                  # node + pnpm versions
package.json               # one package, both client + server scripts
vite.config.js
tailwind.config.js
PRODUCT.md                 # original product plan

server/
  index.js                 # Express + middleware + routes
  db.js                    # better-sqlite3 + migrations
  git.js                   # simple-git helpers, worktree enumeration
  log.js                   # colored leveled logger + request middleware
  routes/                  # repos, reviews, diffs, comments, agents, goals, fix, risk, settings, admin
  services/
    agent-runner.js        # runs review-kind agents, parses findings
    fix-runner.js          # runs fix-kind agents sequentially, one commit per comment
    risk-scorer.js         # computes per-file risk scores
    run-command.js         # shared spawn() helper (stdin + temp file + cleanup)

client/
  index.html
  src/
    main.jsx, App.jsx, api.js, agentPresets.js
    pages/                 # Home, RepoView, ReviewView, Settings
    components/            # DiffView, FileSidebar, RiskRadar, TimeTravel,
                           #   AgentPanel, AgentRunInspector, FixPanel,
                           #   CommentDialog, ...
    styles.css
```

---

## Development

```bash
mise install                # one-time
pnpm install
pnpm dev                    # hot-reloads both server + client
```

`pnpm dev` runs two processes concurrently:
- **Vite dev server** at `http://localhost:5173` with HMR (React state preserved across edits). Proxies `/api` to `:3200`.
- **Node `--watch`** on the Express server at `:3200`, restarts on any change under `server/`.

Use `http://localhost:5173` while developing.

### Useful scripts
| Command | What |
|---|---|
| `pnpm dev` | server + client with hot reload (Vite on 5173, server on 3200) |
| `pnpm dev:server` | just the server (`node --watch`) |
| `pnpm dev:client` | just Vite |
| `pnpm build` | production build of the client into `dist/` |
| `pnpm start` | production server (must `pnpm build` first) |

### Environment variables
| Var | Default | Purpose |
|---|---|---|
| `PORT` | `3200` | Server port |
| `FOREWORD_DATA_DIR` | `~/.foreword` | Where the SQLite DB and any future state lives. `LOCAL_REVIEW_DATA_DIR` is honored as a legacy alias. On first boot after the rename, if `~/.foreword` doesn't exist but `~/.local-review` does, the legacy directory is renamed automatically (atomic mv, no data copy). |
| `DEBUG` | unset | When set, enables verbose `DBG` log lines |

### Server logging
Every HTTP request logs status code + method + path + duration with colors:
```
12:28:54.097 HTTP 200 GET  /api/reviews/1/fix/pending 1ms 315b
12:28:54.132 AGT ▶ fix session review=1 agent="test-fix" pending=1
12:28:54.613 AGT ✓ fix run #1 comment=1 status=fixed sha=b068198 0.44s
```
Levels: `INF` / `WRN` / `ERR` / `OK ` / `AGT` (agent) / `GIT` / `DBG` (with `DEBUG=1`).

### Adding a new agent provider preset
Edit `client/src/agentPresets.js` and add an entry to `AGENT_PRESETS`:
```js
myProvider: {
  id: 'myProvider',
  label: 'My Provider CLI',
  hint: 'Notes about quirks.',
  models: [{ id: 'my-model-id', label: 'My Model' }],
  defaultModel: 'my-model-id',
  buildCommand: (model, kind) => {
    if (kind === 'fix') return `myprovider fix --model ${model}`;
    return `myprovider review --model ${model}`;
  },
},
```
Then add the id to `PRESET_ORDER`. Done — it shows up in the Settings tile picker with a model dropdown.

### Adding fields to the data model
Always append to the `MIGRATIONS` array in `server/db.js` as a separate `ALTER TABLE … ADD COLUMN …` statement. The migration loop tolerates "duplicate column name" errors, so re-running on an existing DB is safe.

---

## MCP server (handoff loop with coding agents)

Foreword exposes an MCP (Model Context Protocol) server at `/mcp` so a
coding agent (Claude Code, etc.) can open reviews for the user, wait
for feedback, and act on the comments — all from the same agent
session that wrote the code in the first place.

### Setup

Foreword must already be running. Then:

```bash
claude mcp add --transport http foreword http://localhost:3200/mcp
```

(Adjust the URL if you've moved Foreword to a different port.)

### Tools

| Tool | Purpose |
|---|---|
| `create_review` | Create a Foreword review on a branch and optionally open it in the user's browser. Auto-registers the repo if Foreword doesn't know about it yet. Returns the review id, URL, and an `mcp_session_id` that flags this review as agent-initiated. |
| `list_comments` | List all comments on a review. Optional filter: `all`, `fixable_pending`, `human`, `agent_findings`. |
| `get_fixable_work` | Return comments the user flagged as agent-fixable and not yet addressed. Each item includes `thread_markdown` — a pre-rendered conversation so you don't have to walk `parent_id` chains. |
| `mark_comment_fixed` | After applying a fix and committing, mark the comment so future calls skip it. `commit_sha` is recorded as audit trail. |
| `wait_for_review_signal` | Long-poll. Blocks until the user clicks "Send to agent" in the review UI, or until the timeout expires (default 300s, max 600s). Re-callable. |

### The handoff loop

```
User → Claude Code: "Add Stripe webhook handling."
Claude Code:        [writes code, commits]
Claude Code → MCP:  create_review(repo_path, head_ref, launch=true)
                    → browser opens at /reviews/N
User:               [reviews the diff, leaves comments,
                     ticks "agent-fixable", clicks "Send to agent"]
Claude Code → MCP:  wait_for_review_signal(review_id)
                    → returns when user clicks Send
Claude Code → MCP:  get_fixable_work(review_id)
                    → comments to address, with full thread context
Claude Code:        [applies each fix with full conversational context,
                     commits each separately]
Claude Code → MCP:  mark_comment_fixed(comment_id, commit_sha) ×N
Claude Code → User: "Addressed the two flagged items.
                     About the third — I think we should ___. Want me to?"
```

MCP-initiated reviews show a `via MCP` chip in the running header and
an explicit **↩ Send to agent** button next to the refresh button.
Plain UI-initiated reviews never see either — they keep the existing
"trigger Foreword's own fix agent" flow.

### Why this pattern is better

The agent that wrote the code has full conversational context — recent
decisions, the user's tone, why a particular tradeoff was made. The
review surface gives the user a visual diff to leave structured,
file:line-anchored feedback on. Pulling that feedback back to the same
agent session is dramatically tighter than restarting in a fresh
shell-out (which is what Foreword's built-in fix agent does).

The pattern mirrors Sublime's `/annotate` at smaller scale: agent
opens a review surface, user annotates, structured feedback returns —
but extended to **branch-scoped diffs** with Foreword's richer review
state (persistence, multi-reviewer findings, agent-fixable flags, time
travel).

---

## License

MIT — see [LICENSE](./LICENSE).
