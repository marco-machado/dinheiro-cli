<div align="center">

# Dinheiro

**A personal finance CLI built for AI agents.**

Track accounts, transactions, transfers, and monthly reports through a predictable `dinheiro <noun> <verb>` interface that emits structured JSON.

[![Node](https://img.shields.io/badge/node-%E2%89%A524-43853d?logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/typescript-5.5-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![SQLite](https://img.shields.io/badge/sqlite-better--sqlite3-003b57?logo=sqlite&logoColor=white)](https://github.com/WiseLibs/better-sqlite3)
[![Drizzle ORM](https://img.shields.io/badge/drizzle-ORM-c5f74f)](https://orm.drizzle.team)
[![Agent Skill](https://img.shields.io/badge/agentskills.io-compatible-7c3aed)](https://agentskills.io/specification.md)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](#license)

</div>

---

## Why Dinheiro?

Every personal finance app is a UI. That's exactly the wrong interface for an AI agent. Dinheiro inverts the model: every operation is a single CLI call with a JSON envelope, predictable error codes, and a bundled [agentskills.io](https://agentskills.io/specification.md) skill. Point an agent at it and it can log expenses, reconcile credit card bills, and produce monthly summaries — no scraping, no flaky DOM, no API keys.

It is also a regular CLI. Append `--pretty` to anything for a human-readable table.

## Table of contents

- [Features](#features)
- [Quick demo](#quick-demo)
- [Installation](#installation)
- [Configuration](#configuration)
- [Quick start](#quick-start)
- [Command reference](#command-reference)
- [Output contract](#output-contract)
- [Key concepts](#key-concepts)
- [Workflow recipes](#workflow-recipes)
- [Using Dinheiro from an AI agent](#using-dinheiro-from-an-ai-agent)
- [Development](#development)
- [License](#license)

## Features

- **Agent-first I/O**: JSON envelopes on stdout, typed error codes on stderr, exit codes that mean what they say.
- **Multi-account**: checking accounts and credit cards with `close_day` / `due_day` metadata.
- **Transactions**: create, list, get, update, delete, batch-create, filter by account / category / period.
- **Categories**: tag spending to surface trends month over month.
- **Transfers**: pay credit card bills as a single linked operation — no double counting.
- **Imports**: ingest bank statements with idempotent dedup (account + date + amount + description). Re-running a file is safe; rolling back a batch is one command.
- **Reports**: monthly income vs. expenses with category breakdown, and per-statement views for credit cards.
- **Bundled skill**: ships with a `SKILL.md` so AI agents get the command surface and workflow recipes for free.
- **Local-first**: a single SQLite file. No accounts, no cloud, no telemetry.

## Quick demo

```console
$ dinheiro accounts create --name "Checking" --type checking --pretty
ID                          NAME      TYPE      CREATED
01JV4Q1F5RZB9X5C0K9Y3M7AT2  Checking  checking  2026-05-15

$ dinheiro transactions create \
    --account 01JV4Q1F5RZB9X5C0K9Y3M7AT2 \
    --amount -4250 \
    --description "Supermarket" \
    --occurred-at 2026-05-14
{"ok":true,"data":{"id":"01JV4Q23...","amount":-4250,"description":"Supermarket","occurredAt":"2026-05-14"}}

$ dinheiro reports monthly --month 2026-05 --pretty
MONTH    INCOME    EXPENSES   NET       TRANSFERS
2026-05  R$ 0,00   R$ 42,50   -R$ 42,50  R$ 0,00

CATEGORY     AMOUNT     %
(uncategorized)  R$ 42,50   100.0%
```

## Installation

Requires **Node.js 24+**.

```bash
git clone https://github.com/marcomachado/dinheiro-cli.git
cd dinheiro-cli
npm install
npm run build
npm link            # exposes the `dinheiro` binary globally
```

Verify:

```bash
dinheiro --help
```

## Configuration

Dinheiro stores everything in a single SQLite file. Override the default location with:

```bash
export DINHEIRO_DB="$HOME/.local/share/dinheiro/db.sqlite"
```

Initialize the schema:

```bash
npm run db:migrate
```

## Quick start

```bash
# 1. Create accounts
dinheiro accounts create --name "Checking" --type checking
dinheiro accounts create --name "Visa" --type credit_card --close-day 20 --due-day 10

# 2. Create categories
dinheiro categories create --name "Groceries"
dinheiro categories create --name "Salary"

# 3. Log a paycheck (positive = inflow) and a grocery run (negative = outflow)
dinheiro transactions create --account <checking-id> --amount 500000 \
  --description "Monthly salary" --occurred-at 2026-05-01 --category <salary-id>

dinheiro transactions create --account <checking-id> --amount -8740 \
  --description "Pão de Açúcar" --occurred-at 2026-05-14 --category <groceries-id>

# 4. Import a credit card statement
dinheiro imports create --account <cc-id> --file nubank-may.csv --format nubank

# 5. Pay the bill (single transfer, two linked rows)
dinheiro transfers create --from <checking-id> --to <cc-id> \
  --amount 85000 --occurred-at 2026-05-05 --description "Nubank bill May"

# 6. Review the month
dinheiro reports monthly --month 2026-05 --pretty
```

## Command reference

```
dinheiro <noun> <verb> [args] [flags]
```

| Noun | Verbs |
|---|---|
| `accounts` | `create`, `list`, `get`, `update`, `delete` |
| `categories` | `create`, `list`, `update`, `delete` |
| `transactions` | `create`, `list`, `get`, `update`, `delete`, `batch-create` |
| `transfers` | `create`, `list`, `delete` |
| `imports` | `create` (with `--dry-run`), `list`, `delete` |
| `reports` | `monthly`, `statement` |

Run `dinheiro <noun> <verb> --help` for flags. The full reference also lives in [`skill/references/commands.md`](skill/references/commands.md).

## Output contract

Every command writes a single JSON object to stdout on success:

```json
{ "ok": true, "data": <result> }
```

Errors go to stderr with a non-zero exit code:

```json
{ "ok": false, "error": "<message>", "code": "VALIDATION_ERROR" }
```

Error codes: `VALIDATION_ERROR`, `NOT_FOUND`, `CONFLICT`, `DB_ERROR`.

Add `--pretty` to any command for a human-readable table instead of JSON.

## Key concepts

- **Amounts are signed integers in cents.** `-4250` is an expense of R$ 42,50. `500000` is income of R$ 5.000,00. No floats, ever.
- **Statement period (`YYYY-MM`) is required for every credit card transaction.** Read it off the bank statement — Dinheiro never guesses.
- **Transfers create two linked rows.** Never `transactions update/delete` them directly; use `transfers delete` to keep both sides consistent.
- **Imports are idempotent.** Re-running the same file skips rows matching `(account, date, amount, description)`. Roll back a whole batch with `imports delete <id>`.
- **No multi-currency.** Everything is BRL today.

## Workflow recipes

End-to-end recipes for common tasks live in [`skill/references/workflows.md`](skill/references/workflows.md):

- Logging a single expense (with and without a credit card)
- Importing a Nubank export and rolling it back
- Reconciling a credit card bill against a statement
- Monthly income vs. expenses review

## Using Dinheiro from an AI agent

The [`skill/`](skill) directory follows the [agentskills.io](https://agentskills.io/specification.md) spec. Drop it into your agent's skill loader and it gets:

- A scoped description of when to invoke Dinheiro
- The full command surface
- Workflow recipes for the common flows
- The output contract and error taxonomy

Designed primarily for Claude Code and similar tool-using agents, but it's a plain CLI — any agent that can spawn a subprocess can drive it.

## Development

```bash
npm run dev          # run the CLI via tsx without building
npm test             # vitest run (single-shot)
npm run build        # tsc -> dist/
npm run db:generate  # generate a migration from schema changes
npm run db:migrate   # apply pending migrations
```

The source layout mirrors the noun structure:

```
src/
  accounts/      commands.ts, repo.ts, schema.ts
  categories/
  transactions/
  transfers/
  imports/
  reports/
  schema/        drizzle schema + zod types
  db.ts          better-sqlite3 + migration runner
  output.ts      JSON envelope helpers
  errors.ts      AppError + error codes
  index.ts       commander wiring
```

## License

MIT. See [`LICENSE`](LICENSE).
