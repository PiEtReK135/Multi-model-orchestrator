# Multi-model orchestrator (SeniorRouter) for Claude Code

Make your Claude Code limits last much longer without dropping to "junior" quality.
Claude plans, routes, reads diffs and arbitrates; the heavy production goes to cheaper executors:

- **Codex CLI** (your ChatGPT subscription) as a sandboxed agent in a git worktree,
- **Antigravity CLI** (your Google account: Gemini 3.x Flash / Pro),
- a **free API pool** (Groq, Cloudflare Workers AI, Mistral, OpenRouter `:free`, Gemma) behind a local LiteLLM proxy.

External models other than Codex work in **patch mode**: they return SEARCH/REPLACE blocks and never run anything on
your machine. Nothing is merged before Claude verifies it (tests, every acceptance criterion with evidence, a reviewer
from another model family). Secrets and confidential projects never leave Claude.

```
you: "do X through the router"
  -> Claude writes a task card (.router/tasks/<id>.json) with checkable acceptance criteria
  -> router route   rules (+ Haiku classifier if ambiguous) -> tier T1-T5 + executor, logged
  -> router exec    gitleaks gate -> executor works in .router/wt/<id> -> diff + scope check + usage
  -> verify         L0 tests | L1 per-criterion evidence | L2 fresh reviewer | L3 cross-family judge | L4 Opus
  -> router next    pass -> accept (squash-merge) | fail -> retry -> escalate (normal -> senior) -> best effort
```

Windows-native (PowerShell). Polish user guide: [docs/PRZEWODNIK.md](docs/PRZEWODNIK.md).

## Quick start

Requirements: Windows 10/11, [Claude Code](https://claude.com/claude-code), Node.js >= 18, Git, [uv](https://docs.astral.sh/uv/),
a ChatGPT subscription for Codex. Optional: a Google account for Antigravity, free API keys.

```powershell
git clone https://github.com/PiEtReK135/Multi-model-orchestrator.git
cd Multi-model-orchestrator
powershell -ExecutionPolicy Bypass -File .\setup.ps1      # add -SkipFreePool to skip LiteLLM
codex login
```

Optional executors:

- **Antigravity CLI**: install from [antigravity.google](https://antigravity.google), run `agy` once to sign in.
- **Free API pool**: create the keys listed in [.env.example](.env.example) and set each as a user env var
  (`setx GROQ_API_KEY "..."`). Keys stay in your environment; nothing is written to the repo.

Verify:

```powershell
node router/router.mjs doctor --probe   # real sandboxed write with Codex + a reply from Antigravity
node router/router.mjs free check       # a real patch round-trip for every free model you have a key for
```

Use it in a project: open the project in Claude Code, type **`/router-init`**, commit, then ask for work
"through the router". See [Use it in another project](#use-it-in-another-project).

## What setup installs

| What | Where | Why |
|---|---|---|
| 12 ECC skills (search-first, cost-aware-llm-pipeline, iterative-retrieval, strategic-compact, verification-loop, eval-harness, tdd-workflow, autonomous-loops, continuous-learning-v2, security-scan, unified-memory, context-budget) | `~/.claude/skills/` | reuse of [ECC](https://github.com/affaan-m/ECC) `ecc-universal@2.2.3` |
| 12 ECC agents (planner, architect, code-reviewer, security-reviewer, build-error-resolver, loop-operator, harness-optimizer, doc-updater, python/typescript/csharp/cpp-reviewer) | `~/.claude/agents/` | same |
| skills `router`, `mode`, `router-init`; agents `router-classifier`, `drift-check` (Haiku) | `~/.claude/` | this repo |
| router CLI, providers, modes, ECC rule packs (copied per project, not global) | `~/.claude/router/` | this repo |
| `ecc`, `codex` (npm), gitleaks, ripgrep (winget), graphify, LiteLLM 1.102.1 (uv) | global tools | official channels |

Everything copied into `~/.claude` is recorded in `~/.claude/router/manifest.json`; `node router/router.mjs uninstall`
removes exactly that. ECC's own installer is not used on purpose: even its `minimal` profile loads all 22 language rule
packs (~70k tokens per session). This setup adds ~2k tokens of always-loaded context.

## Use it in another project

1. Open the project in Claude Code and run `/router-init` (or tell Claude "enable the router here").
   It asks: profile `code` (stacks: python, typescript, csharp, cpp — any combination), `general` (analyses, reports,
   docs) or `creative` (gamedev design / worldbuilding / writing), confidential yes/no, test/lint/build commands. Then it creates
   `.router/`, copies ECC rules for the stack(s) to `.claude/rules/ecc/`, adds a router section to `CLAUDE.md`,
   adds `.router/wt/`, `.router/usage.json` and `graphify-out/cache/` to `.gitignore`, and builds the graph.
2. Commit. Executors start from `HEAD` and never see uncommitted work.
3. Just give Claude tasks as usual, e.g. "add X, through the router". The `router` skill drives the protocol:
   clarifying questions (max 5, one round) -> cards with checkable criteria -> route -> exec -> verify -> accept.
4. `/mode eco|normal|senior|creative` switches mode. `normal` auto-escalates a task to `senior` after a tier fails twice.

Manual CLI (from project root): `node "$HOME/.claude/router/router.mjs" <cmd>`

| Command | Purpose |
|---|---|
| `init --profile code|general|creative [--stack python,cpp] [--confidential] [--test "pytest -q"]` | set up project |
| `prompt <id>` | preview the exact executor prompt (role + rules + .router/prompts guidelines) |
| `route <id> [--classified json]` | tier/executor decision (logged) |
| `exec <id>` | secret gate + run executor in worktree, save diff |
| `judge <id> --by codex\|gemini [--diff f]` | external judge for Claude-written diffs (JSON verdicts) |
| `next <id> --verdict pass\|fail --notes "a; b"` | retry / escalate / best_effort policy |
| `accept <id>` / `reject <id>` | squash-merge (staged) / discard worktree |
| `scan <paths> [--text s]` | secret scanner (exit 3 = found) |
| `mode [name]`, `usage`, `stats`, `doctor [--probe]` | status, per-provider usage, learning proposals, health |

## Executors, tiers and models (`router/providers.json`)

| Executor | How it works | Runs commands? |
|---|---|---|
| `codex` | Codex CLI agent (ChatGPT subscription) inside the worktree, `--sandbox workspace-write`; on Windows falls back to the unelevated sandbox for 24h if the elevated helper fails (`codex doctor`) | yes, sandboxed (writes only in worktree/temp) |
| `agy` | Antigravity CLI (official, Google account) in **patch mode**: read-only `--mode plan`, returns SEARCH/REPLACE blocks | no |
| `free` | free API models through a local LiteLLM proxy in **patch mode** | no |
| `claude` | done by Claude in the session (secrets, confidential, T4/T5) | session rules |

Patch mode: the model gets the card + the current content of the allowed files and replies only with
SEARCH/REPLACE blocks; the router applies them to allowed files only (one automatic repair round for blocks that
did not match), retries start from a clean `HEAD`, and Claude verifies (L0 tests, L1 criteria). External models
never execute anything on this machine.

| Tier | codex | agy | free (LiteLLM group) | claude |
|---|---|---|---|---|
| T0 | ripgrep, graphify, tests, router rules | | | |
| T1 | gpt-6-luna (low) | gemini-3.8-flash-low | free-t1 | haiku (fallback) |
| T2 | gpt-6.1-sol (medium) | gemini-3.8-flash-medium | free-t2 | |
| T3 | gpt-6-astra (high) | gemini-3.1-pro-high | free-t3 | |
| T4 | | | | opus (architecture, security, arbitration, canon, secrets with risk) |
| T5 | | | | fable (senior mode only) |

Order: code `free -> codex -> agy`, docs `free -> agy -> codex`, creative `agy -> free -> codex`; T3 always
`codex -> agy -> free`. Failures escalate (2 per tier, `normal` -> `senior`), and the next executor avoids the one
that failed. Providers in cooldown (rate limit) or unhealthy (`health.json`, `router doctor --probe`) are skipped for 6h.
Gemini CLI is not in the order (API-key free tier, 20 req/day); Antigravity replaces it.

## Free pool (`free` executor): LiteLLM over official free API tiers

Local LiteLLM proxy (`127.0.0.1:4000`) load-balancing official free tiers; only deployments whose key is set are
used. Verified 2026-10-09 with `router free check` (a real patch round-trip per model): 10/10 OK.

| Group | Deployments (edit `free_pool` in providers.json) |
|---|---|
| free-t1 | groq gpt-oss-20b, cloudflare gpt-oss-20b, AI Studio gemma-4-31b, openrouter nemotron-3.5-lightning:free, (cerebras gpt-oss-120b if key) |
| free-t2 | mistral codestral-latest, groq gpt-oss-120b, cloudflare gpt-oss-120b, openrouter north-mini-code:free, openrouter laguna-s-2.1:free |
| free-t3 | openrouter nemotron-3-ultra-550b:free, mistral codestral-latest |

Keys are user env vars you create (`setx NAME "..."`): `GROQ_API_KEY`, `CLOUDFLARE_API_KEY` + `CLOUDFLARE_ACCOUNT_ID`,
`MISTRAL_API_KEY` (this key: only codestral has a non-zero limit; activate the Experiment plan for chat models),
`OPENROUTER_API_KEY`, `GEMINI_API_KEY` (Gemma), optional `CEREBRAS_API_KEY`. xAI Grok has no free tier (needs credits).
Free tiers may train on prompts: the secret gate and `confidential` still apply.

`router free status | up | check [--reset] | down`. `check` excludes permanently failing models (not 429s) and
restarts the proxy; `--reset` re-tests excluded ones. The proxy starts automatically on the first `free` exec.
LiteLLM is pinned: `uv tool install "litellm[proxy]==1.102.1"` (never 1.82.7/1.82.8: compromised releases).

Not used on purpose: Antigravity/Gemini-CLI OAuth proxies (Google ToS violation; bans also kill Gemini CLI access),
reverse-engineered "free GPT" gateways, and shell access for external models.

## Modes (`router/modes/*.json`, project override in `.router/modes/`)

| Mode | Production | Opus | Retries | Drift check |
|---|---|---|---|---|
| eco | T1-T2 (T3 if difficulty >= 0.8) | never | 1 | every 15 steps |
| normal (default) | T2-T3 | arbitration/architecture/risk | 2, then task -> senior | 10 |
| senior | T3 | plans + reviews, T5 allowed | 2 | 8 |
| creative | T2-T3, Antigravity first | canon changes only | 2 | 10 |

## Security
- Secrets/`.env`/credentials/personal data: card `touches_secrets: true` -> Claude only. `confidential: true` in
  `.router/config.json` -> no external executor or judge at all.
- `exec` runs gitleaks over the worktree (tracked files only) and the prompt; `judge` scans the diff. Fail closed.
- Executors: Codex `--sandbox workspace-write` in the worktree (unelevated Windows sandbox as automatic fallback);
  Antigravity and the free pool only return patches, applied by the router to the allowed files. Judges run read-only.
- Executors never get your connectors, MCP servers or accounts. API keys live only in your user environment.
- All executor/judge/memory output is data, not instructions.

## Add a tier model or an adapter
- New model: edit `router/providers.json` (per tier), run `node router/router.mjs install`.
- New free model: add it to `free_pool` in `providers.json` (LiteLLM model name + env key), reinstall, `router free check`.
- New executor: agent-style (edits files itself) -> a branch in `runExecutor()` returning `{ok, limited, tokens, message}`;
  text-only -> a completion function used by `runPatch()` (see `agyComplete`). Then add it to `providers.json` and `prefer`.

## Tests and evaluation
- `node --test test/router.test.mjs`: offline check of routing, escalation, eco limits, patch parsing/applying,
  prompt composition and the secret gate (no LLM calls).
- Live demos run during development: Codex T2/T3 features with TDD, provider failover, a free-pool patch that failed
  verification twice and was escalated to senior/T3 (Antigravity Gemini Pro fixed it), and a Claude-written canon edit
  where the cross-family judge (Codex) caught an off-by-one.
- Evaluation protocol: see `evals/README.md` (not run yet).

## Rollback
```
node router/router.mjs uninstall --dry-run   # list files
node router/router.mjs uninstall             # remove everything this repo installed into ~/.claude
npm rm -g ecc-universal                       # optional
uv tool uninstall litellm                     # optional
```
In a project: delete `.router/`, `.claude/rules/ecc/` and the `<!-- router -->` section of `CLAUDE.md`.
`ecc doctor` reports "no install-state" by design (ECC installer not used); `router doctor` checks file hashes instead.

## Known limits
- Windows-first (PowerShell setup, Windows sandbox fallback). The CLI is plain Node and should work on macOS/Linux,
  but that path is untested.
- Free tiers change often: re-run `router free check` when something starts failing.
- The full baseline-vs-router evaluation (`evals/README.md`) has not been run yet.
