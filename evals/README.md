# Evaluation protocol (not run yet)

Goal: router quality >= baseline (agreed margin, proposed: acceptance rate at most 5 pp lower) with clearly lower Claude usage.

## Task set
20-30 **real** tasks from your projects, spread across modes: ~12 code (python/ts/c#/c++), ~6 docs, ~8 creative.
One file per task in `evals/tasks/<id>.json` = a router card (type, difficulty, files, checkable
acceptance_criteria) plus `"repo": "<path>"` and `"base": "<commit sha>"`. Seed examples: the three demo cards in
`demos/*/.router/tasks/` (stack-01, docs-01, faction-01).

## Variants
- **baseline**: one strong model does everything (Claude Opus session, no router), same card, same criteria.
- **router**: `/router` protocol in `normal` mode.
Run each task from a fresh worktree at `base`.

## Metrics per task
Claude tokens and calls (session usage), Codex/Gemini tokens and calls (`router usage`), accepted yes/no
(criteria verified L0/L1 by a fresh reviewer that does not know the variant), retries and escalations
(`router stats`), wall time.

## Decision
Accept the router if quality is not worse than baseline (margin above) and Claude usage is clearly lower.
Otherwise use `router stats` + decisions.jsonl to find the component that costs without adding quality
(e.g. judge on trivial tasks, T3 on low difficulty) and switch it off in the mode file.

Note: a headless baseline needs `claude -p --output-format json` (Claude Code CLI, not on PATH on this machine;
the desktop app embeds its own). Without it, baseline runs are manual sessions.
