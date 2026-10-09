---
name: router
description: SeniorRouter orchestration protocol. Use in any project that has .router/config.json, or when the user asks to route/delegate work, save Claude limits, or run a task "through the router". Claude plans, routes, verifies and arbitrates; production goes to Codex (agent), Antigravity and a free API pool (patch mode) in git worktrees; research and big documents go to Antigravity.
---

# SeniorRouter protocol

Goal: Claude's limits go to planning, reading diffs and arbitration only; quality stays "senior".
`R` below means `node "$HOME/.claude/router/router.mjs"` (works in Bash and PowerShell). Run it from the project root.

## 0. Token economy for Claude (read first, applies to the whole session)
- The orchestrator runs on **Sonnet**. If this session runs on Opus and the mode is not `senior`, tell the user once:
  "switch the session to Sonnet (/model sonnet); Opus is used only for arbitration via subagents".
- Every subagent call sets `model` explicitly: `haiku` for search/lookup/classify/drift, `sonnet` for review.
  `opus` only for T4 (architecture, security, arbitration, canon) or mode `senior`. Never let research subagents inherit Opus.
- **Web research** -> `R research "<question>" [--deep]` (Antigravity, answers with sources, saved to .router/research/).
  **Big documents** (PDF, docx, datasheets, regulations) -> `R digest <files> --focus "..."` (saved to .router/digests/).
  Read only the saved answer/digest. Use WebSearch/WebFetch yourself only if `R research` fails.
- Never read a file > 300 lines whole: `graphify query`, `rg -n`, then Read with offset/limit. Never paste big tool output
  into cards: `context` is a trimmed slice (<= 40 lines).
- Batch independent `R exec` runs in parallel (run_in_background) instead of watching them one by one.

## 1. Clarification gate (every new task)
Estimate ambiguity 0-1. If missing info would change the result and ambiguity > mode `question_threshold`,
ask up to 5 questions in ONE round (AskUserQuestion), each with a proposed default. Otherwise do not ask.

## 2. Plan -> task cards (estimation drives cost: be honest, not generous)
Small task: write one card yourself. Multi-step work: `planner` agent (model sonnet) for a DAG, one card per node in
`.router/tasks/<id>.json`:

```json
{ "id": "auth-01", "type": "implement", "kind": "code", "title": "...", "goal": "what and why, 3-10 lines",
  "difficulty": 0.5, "files": ["src/x.py", "tests/test_x.py"],
  "acceptance_criteria": ["pytest tests/test_x.py passes", "x() returns 404 for unknown id"],
  "touches_secrets": false, "context": "<trimmed graphify/digest slice>", "depends_on": [] }
```
- `type`: lookup|summarize|triage|format|trivial (T1) · implement|test|docs|debug|write|draft|analysis|research (T2) ·
  feature|refactor|hard-debug|long-write|worldbuilding (T3) · architecture|security-review|arbitration|canon-change (Claude T4).
- `difficulty` scale (calibrate against this, the router learns from outcomes): 0.2 mechanical one-file edit ·
  0.4 normal change with a clear spec · 0.6 several files or non-obvious logic · 0.8 cross-cutting design, unclear root
  cause · 0.9+ only when a strong model failed or the problem is genuinely research-grade. <= 0.25 drops T2 to T1.
- Split big work so each card is one coherent change of <= 4 files; size alone sends code to T3 (>= 5 files or > 1500 lines).
- `acceptance_criteria` are mandatory and checkable (command + expected result, file:line fact, numbers with units, rubric item).
- `kind`: code | general | creative. It picks the executor role, the owner guidelines (.router/prompts/common.md + <kind>.md)
  and the learned lessons for that executor. Preview the exact executor prompt with `R prompt <id>`.
- `touches_secrets: true` for keys, tokens, .env, passwords, personal data: the task stays with Claude.

## 3. Route
`R route <id>` prints `{tier, executor, model, judge, needs_classifier, ask_user, reasons}`; reasons show size, learned
calibration ("learned: ..."), load balancing ("balance: ...") and the hard-T3 model when used.
- `needs_classifier: true`: `router-classifier` agent (model haiku) with the card, then `R route <id> --classified '<json>'`.
- `ask_user: true`: ask (step 1) before executing.
- `executor: claude`: do it yourself (subagent with the given model only if isolation helps).

## 4. Execute (external)
`R exec <id>`: secret scan, then the executor works in `.router/wt/<id>`; diff in `.router/tasks/<id>.attemptN.diff`.
Exit code 3 = blocked by the secret scanner: do it yourself. Provider limited/unavailable: `R route <id>` again.
- `codex`: sandboxed agent (can run tests). T3 uses gpt-6.1-sol; the frontier model only after a T3 failure, difficulty >= 0.9 or senior.
- `agy` (Antigravity) and `free` (LiteLLM pool): patch mode, they cannot run tests, so L0 is always on you.
- The router spreads load over codex/agy/free by 24h weighted tokens; do not override it without a reason.

## 5. Verify (cheapest first, stop at first failure)
- **L0** in the worktree: tests/lint/types/build from `config.verify`. For code, TDD evidence RED -> GREEN.
- **L1** each criterion separately with evidence (file:line, command output). Read the diff, not whole files.
- **L2** (risky or large diffs) `code-reviewer` / stack reviewer agent (model sonnet) in fresh context.
- **L3** cross-family judge on the diff only. External diff -> you judge (Sonnet; Opus if `judge.model` says opus).
  Claude-written diff -> `R judge <id> --by codex` (blocked for secrets: use a fresh Claude subagent).
- **L4** Opus arbitrates only on disagreement or high risk.
- `out_of_scope` files in exec output = automatic fail unless justified.

## 6. Decide and teach
`R next <id> --verdict pass` -> `R accept <id>` (squash-merge staged; you commit).
`R next <id> --verdict fail --notes "unmet 1; unmet 2" --lesson "<general rule>"` -> `retry | escalate | best_effort`.
- `--notes`: task-specific, goes into the retry prompt.
- `--lesson`: ONE general, reusable rule the executor broke (imperative, <= 20 words, no task details), e.g.
  "Append new test methods at the end of the class; never inside another method." It is stored in the global playbook for
  that executor and kind and injected into its future prompts. Add it only when the mistake could repeat elsewhere.
- `--infra`: the failure was the provider (timeout, outage), not quality: not counted by the learner.
- escalate: `R route <id>` then exec. In `normal`, the first escalation moves the task to `senior` automatically.
- best_effort: stop, report result + uncertainty flag + open criteria. `R reject <id>` to discard the worktree.

## 7. Watchdog / drift
Every mode `drift_interval` steps of a long task, `drift-check` agent (model haiku) with goal, criteria, last K actions only.
`on_track: no` -> stop and re-plan; `unclear` -> ask the user. Identical diff twice -> `R next` escalates.

## 8. After a batch (living improvement)
- `R learn` shows first-try pass rates per kind/type/tier; routing adapts automatically (config `learning`: auto|propose|off).
- `R lesson list`: merge near-duplicates, delete stale ones (`R lesson rm <n>`), keep each executor/kind <= 8 strong lessons.
  When a lesson keeps recurring, propose to the user a precise edit to `.router/prompts/<kind>.md` or to the agent file.
- `R usage` / `R stats`: report tokens per provider and where Claude's own tokens went (subagents, documents).
- `graphify update .` after larger code changes; durable decisions: `ecc memory save --kind decision ...`.
