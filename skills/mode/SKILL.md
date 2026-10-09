---
name: mode
description: Show or switch the SeniorRouter mode (eco, normal, senior, creative) for the current project. Use when the user types /mode or asks to change router mode.
---

Run `node "$HOME/.claude/router/router.mjs" mode <name>` (no name = show current) from the project root and report the
mode's description, production band, Opus use, retries and drift interval in 2-3 lines.

- eco: no Opus, production T1-T2 (T3 if difficulty >= 0.8), 1 retry.
- normal: T2-T3, Opus for arbitration/architecture/risk, 2 retries; weak results auto-escalate a task to senior.
- senior: Opus plans and reviews, cross judge always, T5 available, production T3.
- creative: gamedev/writing, rubric + canon criteria, Gemini first draft, Opus only for canon changes.
