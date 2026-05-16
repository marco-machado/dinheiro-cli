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
