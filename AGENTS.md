# perfectui-mcp

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
| Package | `npm pack --dry-run` (ships `dist/`, `data/`, `README.md`, `LICENSE`, `package.json`; `prepack` runs the build) |

## Rules

- Every tool is read-only: `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`, `openWorldHint: false`. No tool writes, sends, executes or reaches the network.
- Two entries: the bin `dist/server.js` (stdio) and the library entry `dist/index.js` (`exports["."]`, with types), which exports `buildServer` and `loadCorpus` and starts nothing when imported. `tests/package.test.ts` packs the package and imports it by name.
- The server reads only `data/corpus-<version>.json`. Every fact about Perfect UI comes from the library's documents at the pinned tag or from the published package; nothing is written by hand into the corpus.
- Tool inputs are strict zod objects (unknown keys are rejected) and every tool declares an output schema.
- Tests never use the network: the library reader takes an injectable download function and fixtures live in `tests/fixtures/`.
- Code, comments, commits and documentation in English. Conventional Commits, signed.
- Public repository `chrissgon/perfectui-mcp`. `main` is protected: every change goes through a branch and a pull request, merged by squash only when the required checks `secrets` and `build` are green, with signed commits. No force push, no rule changes, no bypass.
- Never run `npm publish`, push a `v*` tag or create a GitHub release. A release is a tag `v<version>` matching `package.json`, pushed by the owner after approving the exact payload; `.github/workflows/publish.yml` publishes it with npm trusted publishing (OIDC, provenance) and creates the release. No npm token exists in the repository or its secrets. npm accepts a trusted publisher only for a package that already exists, so the owner publishes the first version by hand.
- Git hooks live in `.husky/` and are installed by husky on `npm install` (`"prepare": "husky"`); a clone that still has `core.hooksPath` set to `.githooks` runs `git config --unset core.hooksPath` and `npm install` once. `pre-commit` runs the secret scan, types, tests and the build, the same checks as CI; `commit-msg` runs commitlint. Never skip them.
- The commit convention is `commitlint.config.js` (Conventional Commits): the `commit-msg` hook checks each local commit and the `pr-title` workflow checks each pull request title, which becomes the commit title on `main` and a line of `CHANGELOG.md`.
- A release is prepared on a branch with `npm run release:prepare` (changelogen: bumps `package.json` from the commits since the last tag and writes the new section of `CHANGELOG.md`; no commit, no tag; `-- -r <version>` for a chosen version), then `npm install --package-lock-only`, and a pull request titled `chore(release): vX.Y.Z`. The tag still follows the rule above. `npm run changelog` prints the changes since the last tag without writing anything.
- Credentials never enter the repository; `.env` and `.env.*` are git-ignored. Report vulnerabilities as described in `SECURITY.md`.
