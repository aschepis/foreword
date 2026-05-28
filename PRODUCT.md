# Local Review — Product Plan

> The self-review tool for the agentic-coding era.

## Why

Agents write the code. Humans are the last line of defense before that code lands on a teammate or a customer. Self-review is the highest-leverage moment in modern engineering — and it deserves a tool that's actually pleasant to use, not a hunt through `git diff` in a terminal.

## Stack (chosen for "build it fast, build it well")

- **Backend:** Node.js + Express, `better-sqlite3` (zero-config, synchronous, embedded), `simple-git` (battle-tested wrapper around the `git` CLI).
- **Frontend:** React + Vite, TailwindCSS, `diff2html` for diff rendering (literally the example called out in the README), `react-router` for navigation.
- **Agent runner:** shell-out via `child_process` with configurable command + prompt template; parses structured JSON findings (`{ file, line, severity, message }[]`).
- **One process, one repo.** Express serves the Vite-built SPA in production; Vite proxies API calls in dev.

Everything off-the-shelf where possible — no custom diff parser, no custom syntax highlighter, no custom SQL ORM.

## Core requirements (from the README)

1. Web server on **port 3200** (configurable via `PORT`).
2. Local **SQLite** storage at `~/.local-review/data.sqlite`.
3. **Add a repo** by absolute path; validate it's a git repo; **enumerate worktrees** via `git worktree list --porcelain`.
4. **Branch picker** — list local + remote branches, pick a base and a head; default head = current branch, base = `main`/`master`/merge-base.
5. **Beautiful diff** — `diff2html` side-by-side, syntax-highlighted, file tree sidebar, sticky file headers.
6. **Mark file reviewed** — stored per (review, file_path, content_sha). If the file content sha changes from the reviewed sha, the checkmark visually invalidates ("changed since you reviewed this").
7. **Review history** — every diff load creates a `Review` row; you can revisit past reviews and see what was marked / commented.
8. **Threaded comments** — file-level, line-level, or global. Replies form a thread. Resolve/unresolve.
9. **Hide whitespace** toggle (passes `-w` to `git diff`).
10. **Agent configuration** — name, shell command, prompt template (with `{{diff}}`, `{{file_paths}}`, `{{base}}`, `{{head}}` placeholders), output parser (default: JSON array of findings).
11. **Agentic comments inline** — findings whose `file`+`line` map into the diff are pinned to that exact line; un-mappable findings go to a **Global Findings** drawer.

## Table-stakes gaps the README didn't spell out — filled in

- **Settings page** for agent configs + global preferences (whitespace default, theme, etc.).
- **Per-comment author** — defaults to `$USER`, overridable in settings.
- **Keyboard navigation** — `j`/`k` next/prev file, `n`/`p` next/prev unreviewed file, `m` mark reviewed, `c` add comment, `?` shortcut help.
- **Dark mode** (default — code reviewers live in the dark).
- **Empty / error states** for "no repos added", "agent failed", "diff is huge (>10k lines) — load on demand".
- **Diff streaming for large diffs** — render file-by-file lazily so the page stays responsive on 50+ file diffs.
- **Worktree-aware paths** — if the user picked a worktree, all git ops run from that worktree's path.
- **Auto-detect base branch** — `main`, `master`, or the upstream tracking branch.
- **Persistent agent runs** — runs are stored, viewable later, re-runnable; you don't lose findings when you reload.

## Three killer features (unspecified — invented here)

### 1. Multi-Agent Consensus View
Run **multiple configured agents in parallel** against the same diff. Findings on the same line from multiple agents stack visually with a "**3 agents flagged this**" badge — a strong signal. Findings flagged by only one agent get a "lone wolf" indicator. A **Consensus filter** lets the reviewer say "only show me what ≥2 agents agree on" — cutting through noise from any single model's quirks. This turns multiple AI reviewers into a jury, not a cacophony.

### 2. Commit Time-Travel
A **scrubber bar** above the diff lets you play back the branch commit-by-commit, watching the diff evolve like a slideshow. Two modes:
- **Cumulative** — see the diff up to commit N (matches how you'd normally read a PR but lets you stop at a specific commit).
- **Per-commit** — see only what changed in commit N (useful for spotting "this commit undid the previous one" or "this commit snuck in unrelated changes").

The scrubber shows commit messages and authors; keyboard `,` / `.` step backwards / forwards. This is the missing primitive for understanding *how* code arrived at its current state.

### 3. Risk Radar
A heatmap visualization (top of every review) ranks each changed file by a computed **risk score**:
- **Size** (lines added/removed, normalized to file length)
- **Centrality** (rough fan-in via `grep`-counting imports/references in the rest of the repo)
- **Test coverage delta** (did the file gain or lose test-file companions in this diff?)
- **Churn** (commits touching this file in the last 90 days — high churn = high context cost)
- **Agent agreement** (do AI agents flag this file?)

The radar guides the reviewer to spend the most attention on the highest-risk files first — and ships a **"Suggested Review Order"** that reorders the file tree by risk. For most PRs, this means you've reviewed the dangerous 20% of files within 80% of your attention.

## Architecture

```
/
  PRODUCT.md
  package.json                  # root: server + dev orchestration
  server/
    index.js                    # Express, serves API + static client build
    db.js                       # better-sqlite3, migrations
    git.js                      # simple-git helpers, worktree enumeration
    routes/
      repos.js                  # POST /api/repos, GET /api/repos, GET /api/repos/:id/branches
      reviews.js                # POST /api/reviews (create), GET /api/reviews, GET /api/reviews/:id
      diffs.js                  # GET /api/reviews/:id/diff (streamed JSON), commits list
      comments.js               # CRUD threaded comments
      agents.js                 # CRUD agent configs, POST /api/reviews/:id/agent-runs
      risk.js                   # GET /api/reviews/:id/risk
    services/
      agent-runner.js
      risk-scorer.js
  client/
    index.html
    vite.config.js
    src/
      main.jsx, App.jsx, api.js, routes.jsx
      pages/  Home, RepoView, ReviewView, Settings
      components/  DiffView, FileTree, CommentThread, AgentPanel,
                   RiskRadar, TimeTravelScrubber, BranchPicker
      hooks/   useKeyboard, useReview
      styles/  tailwind, prism theme
```

## Data model (SQLite)

```sql
repos(id, path, name, default_branch, created_at)
worktrees(id, repo_id, path, branch)
reviews(id, repo_id, worktree_id, base_ref, head_ref, base_sha, head_sha, created_at)
review_files(id, review_id, path, status, additions, deletions, content_sha)
file_reviewed(review_id, path, reviewed_sha, reviewed_at, reviewed_by)  -- PK (review_id, path)
comments(id, review_id, parent_id, path, line, side, body, author, resolved, created_at, source) -- source: 'human'|'agent:<name>'
agent_configs(id, name, command, prompt_template, enabled, created_at)
agent_runs(id, review_id, agent_config_id, status, started_at, finished_at, stdout, stderr, finding_count)
agent_findings(id, agent_run_id, file, line, severity, message, mapped_to_comment_id)
settings(key, value) -- JSON blob
```

## Build order

1. Scaffold root `package.json`, server skeleton, DB + migrations.
2. Client scaffold with Vite + Tailwind + diff2html.
3. Repos: add / list / enumerate worktrees / list branches.
4. Reviews: create + persist + diff endpoint + render with `diff2html`.
5. File tree, mark-reviewed, hide whitespace, history sidebar.
6. Comments (threaded, line + global).
7. Agent configs + agent runner + findings → inline comments.
8. **Killer #1** Multi-agent consensus view.
9. **Killer #2** Commit time-travel scrubber.
10. **Killer #3** Risk Radar.
11. Polish: keyboard nav, dark mode, empty states, error toasts.
