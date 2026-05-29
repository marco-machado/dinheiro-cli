# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`dinheiro-cli` — a personal finance CLI (`dinheiro`) designed to be driven by AI agents. TypeScript + Commander, data in a single local SQLite file via Drizzle ORM.

## Commands

- `npm run dev -- <args>` — run the CLI without building (tsx)
- `npm run build` — compile TypeScript to `dist/`
- `npm test` — run the Vitest suite (single-shot)
- `npm run lint` — ESLint over `src` and `tests`
- `npm run format` — Prettier write; `npm run format:check` verifies without writing
- `npm run db:generate` — generate a migration after editing `src/schema/`
- `npm run db:migrate` — apply pending migrations
- `./test-workflow.sh` — bash integration tests against the compiled CLI

Run a single test file: `npx vitest run tests/transactions.test.ts`

Before considering a change done, run `npm run format:check`, `npm run lint`, `npm run build`, and `npm test` (or just `/verify`). The pre-commit hook blocks commits that fail `format:check` or `lint`; CI runs all four.

## Output contract

Every command emits a JSON envelope: `{ ok: true, data }` on success, `{ ok: false, error, code }` on failure. Exit code 0 = success, 1 = error. Use the helpers in `src/output.ts` — never `console.log` raw results.

## Conventions

- Amounts are signed integers in **cents** — never floats. Negative = expense, positive = income.
- Throw `AppError` (`src/errors.ts`) with a typed code: `VALIDATION_ERROR | NOT_FOUND | CONFLICT | DB_ERROR | INTERNAL`. `src/index.ts` catches it and emits the failure envelope.
- Each feature lives in its own dir as `commands.ts` / `db.ts` / `types.ts` (accounts, categories, transactions, transfers, reports, imports). Follow this layout for new features.
- BRL only; multi-currency is not supported.

## Gotchas

- After editing `src/schema/`, run `npm run db:generate` and commit the generated migration in `migrations/`.
- Transfers are atomic: one transfer = two linked transaction rows. Never `transactions delete` a transfer's row directly — use the transfers commands.
- Credit-card statement period (`YYYY-MM`) is caller-supplied, not derived.
- Imports are idempotent: dedup matches on `(account, date, amount, description)`. Re-running the same file is safe.
- `DINHEIRO_DB` overrides the database path (default: `$XDG_DATA_HOME/dinheiro/db.sqlite` or `~/.local/share/dinheiro/db.sqlite`).
- `program.exitOverride()` is in use — help/version surface as `CommanderError` and must exit 0 without a JSON error envelope.

## Environment variables

| Variable          | Effect                                                                         |
| ----------------- | ------------------------------------------------------------------------------ |
| `DINHEIRO_DB`     | SQLite DB file path. Highest precedence. `:memory:` → ephemeral in-memory DB. |
| `DINHEIRO_CONFIG` | Config JSON path. Default `$XDG_CONFIG_HOME/dinheiro/config.json`.            |
| `XDG_DATA_HOME`   | Base dir for the default DB path. Default `~/.local/share`.                   |
| `XDG_CONFIG_HOME` | Base dir for the default config path. Default `~/.config`.                    |

DB-path precedence: `DINHEIRO_DB` > config file `db` field > `$XDG_DATA_HOME/dinheiro/db.sqlite`.

## Git workflow

Work on feature branches and open PRs to `main`. Commit messages are conventional-commit, **subject line only** — no body (`feat:`, `fix:`, `docs:`, `chore:`, etc.).

## Releases

Versioning is automated with [release-please](https://github.com/googleapis/release-please). **Never hand-edit the `version` in `package.json`, write `CHANGELOG.md`, or create git tags / GitHub Releases manually** — release-please owns all of those.

How it works:

- `.github/workflows/release-please.yml` watches `main`. On every push it reads the conventional commits since the last release and maintains a standing **release PR** titled `chore(main): release X.Y.Z`, which updates `package.json`, `.release-please-manifest.json`, and `CHANGELOG.md`.
- Commit prefixes drive the bump: `fix:` → patch, `feat:` → minor, `feat!:` / `fix!:` / a `BREAKING CHANGE:` footer → major. Other types (`docs:`, `chore:`, `refactor:`, etc.) land in the changelog but don't bump on their own.
- **Pre-1.0 (we're at `0.x`):** breaking changes bump the *minor*, not the major — `bump-minor-pre-major` is set in `release-please-config.json`. To cut `1.0.0`, merge a commit with a `Release-As: 1.0.0` footer.
- **Merging the release PR is what ships a release.** On merge, release-please tags the commit and publishes a GitHub Release, which triggers `release.yml` to `npm publish` (with provenance) to npmjs.com and GitHub Packages.

Config lives in `release-please-config.json` (release-type, changelog path, bump rules) and `.release-please-manifest.json` (current version — kept in sync by the tool).

**Setup requirement:** the workflow authenticates as a **GitHub App** (not the default `GITHUB_TOKEN`) — it mints a short-lived installation token per run via `actions/create-github-app-token`. This matters because a release created with `GITHUB_TOKEN` would not trigger `release.yml`, so npm publish would silently never run. Configure once:

- Create a GitHub App (owner: your account) with repository permissions **Contents: read & write** and **Pull requests: read & write**. Generate a private key and install the App on `dinheiro-cli`.
- Store the App's numeric ID as repo **variable** `RELEASE_APP_ID` and the private key (`.pem` contents) as repo **secret** `RELEASE_APP_PRIVATE_KEY`.

The App token expires in ~1h and is regenerated each run, so there's nothing to rotate.
