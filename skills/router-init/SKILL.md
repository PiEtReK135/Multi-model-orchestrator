---
name: router-init
description: Set up SeniorRouter in the current project (.router/ config, ECC rules for the chosen stack, CLAUDE.md section, graphify graph). Use when the user types /router-init or wants to enable the router in a project.
---

1. Ask in ONE round (AskUserQuestion, with defaults) only what you cannot detect:
   - profile: `code` (detect stack from files: pyproject/requirements -> python, package.json/tsconfig -> typescript,
     *.csproj/*.sln -> csharp, CMakeLists/*.uproject/*.vcxproj -> cpp; several allowed), `general` (no code: analyses, reports,
     documentation, research notes) or `creative` (gamedev design, worldbuilding, fiction).
   - confidential? (default no; yes = no external executors at all).
   - test/lint/build commands (default: detected ones).
2. Run from project root:
   `node "$HOME/.claude/router/router.mjs" init --profile <code|general|creative> [--stack a,b] [--confidential] [--test "<cmd>"] [--lint "<cmd>"] [--build "<cmd>"]`
3. Do the `next` steps it prints: git init + first commit if needed; code: `graphify update .`; creative: `/graphify .`
   (LLM extraction of docs/canon); then `graphify hook install`.
   Offer to fill .router/prompts/common.md and <kind>.md with the project conventions (short rules, English).
4. Run `node "$HOME/.claude/router/router.mjs" doctor` and report in <= 6 lines (stack, mode, rules copied, graph, executors ready).
