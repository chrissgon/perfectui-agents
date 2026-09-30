# perfectui-agents

A read-only MCP server over the documentation and stylesheet of Perfect UI 1.0.0 (`@chrissgon/perfectui`). The plan lives outside this repository, in the portfolio backlog (project `T-pua`).

## Commands

| Task | Command |
|------|---------|
| Install | `npm install` (exact versions, `package-lock.json`) |
| Test | `npm test` (vitest, offline) |
| Type-check | `npm run typecheck` (source, scripts and tests) |
| Build | `npm run build` (writes `dist/`) |
| Corpus | `npm run corpus` (rebuilds `data/corpus-1.0.0.json` from the library tag and the npm package; needs network unless `.cache/` or `PERFECTUI_SOURCE` is set) |
| Run | `npm start` (stdio) |

## Rules

- Every tool is read-only: `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`, `openWorldHint: false`. No tool writes, sends, executes or reaches the network.
- The server reads only `data/corpus-<version>.json`. Every fact about Perfect UI comes from the library's documents at the pinned tag or from the published package; nothing is written by hand into the corpus.
- Tool inputs are strict zod objects (unknown keys are rejected) and every tool declares an output schema.
- Tests never use the network: the library reader takes an injectable download function and fixtures live in `tests/fixtures/`.
- Code, comments, commits and documentation in English. Conventional Commits, signed.
- Public repository `chrissgon/perfectui-agents`. `main` is protected: every change goes through a branch and a pull request, merged by squash only when the required checks `secrets` and `build` are green, with signed commits. No force push, no rule changes, no bypass.
- No `npm publish`: `"private": true` stays in `package.json` until the owner approves the publication task.
- Enable the pre-commit hook once per clone: `git config core.hooksPath .githooks`. It runs the secret scan, types, tests and the build, the same checks as CI. Never skip it.
- Credentials never enter the repository; `.env` and `.env.*` are git-ignored. Report vulnerabilities as described in `SECURITY.md`.
