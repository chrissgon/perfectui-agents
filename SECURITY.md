# Security policy

## Reporting a vulnerability

Report it privately through the repository's **Security** tab, **Report a vulnerability** (GitHub private vulnerability reporting). Do not open a public issue.

Include what is affected, how to reproduce it, and what an attacker gains. You will get an answer within 7 days.

## What the repository already does

- Every push and pull request runs the project's checks (install, types, tests, build) and a secret scan of the working tree and the whole history (`.github/workflows/checks.yml`).
- A pre-commit hook runs the same checks before each commit (`.husky/pre-commit`, installed by husky on `npm install`), and a commit-msg hook checks the commit convention.
- Dependency alerts and version updates are on (`.github/dependabot.yml`).
