# dinheiro-cli Design Spec

**Date:** 2026-05-14

## Overview

A personal finance CLI tool driven by AI agents. The CLI is the agent's primary interface for managing accounts, transactions, categories, transfers, and reports. All output is structured JSON by default; `--pretty` renders human-readable tables.

---

## 1. Architecture

**Runtime:** Node 24 + TypeScript, compiled to `dist/`. Entry point registered as `dinheiro` via `package.json` `bin`. Dev: `tsx src/index.ts`.

**Data:** Single SQLite file at `~/.local/share/dinheiro/db.sqlite`. Path overridable via `DINHEIRO_DB` env var. Schema managed by Drizzle ORM; migrations via `drizzle-kit generate` + `drizzle-kit migrate`.

**Stack:**
- `better-sqlite3` — synchronous SQLite driver
- `drizzle-orm` + `drizzle-kit` — schema-as-code, typed queries, migrations
- `drizzle-zod` — derives Zod schemas from Drizzle table definitions
- `zod` — runtime validation of all CLI inputs and import files
- `commander` — CLI subcommand dispatch

**Module structure:**
```
src/
  accounts/       commands.ts  db.ts  types.ts
  transactions/   commands.ts  db.ts  types.ts
  categories/     commands.ts  db.ts  types.ts
  reports/        commands.ts  db.ts  types.ts
  transfers/      commands.ts  db.ts  types.ts
  imports/        commands.ts  parsers/nubank.ts  types.ts
  schema/         index.ts     ← Drizzle table definitions
  db.ts           ← opens connection, runs migrations, exports `db`
  output.ts       ← JSON/pretty output helpers
  index.ts        ← commander wiring, entry point
skill/
  SKILL.md
  references/     commands.md  workflows.md
```

**CLI command shape:** `dinheiro <noun> <verb> [args] [flags]`

**Output contract:**
- Success → stdout JSON, exit 0
- Error → stderr JSON, exit non-zero
- `--pretty` → stdout human-readable table/summary; stderr errors remain JSON

---

## 2. Data Schema

All IDs are ULIDs. Amounts are signed integers in cents (negative = outflow/expense, positive = inflow/income). Timestamps are unix milliseconds.

### `accounts`
| Column | Type | Notes |
|---|---|---|
| `id` | text PK | ULID |
| `name` | text NOT NULL UNIQUE | |
| `type` | text NOT NULL | `'checking'` \| `'credit_card'` |
| `close_day` | int | 1–31, credit_card only, informational |
| `due_day` | int | 1–31, credit_card only, informational |
| `created_at` | int NOT NULL | unix ms |
| `updated_at` | int NOT NULL | unix ms |

### `categories`
| Column | Type | Notes |
|---|---|---|
| `id` | text PK | ULID |
| `name` | text NOT NULL UNIQUE | |
| `created_at` | int NOT NULL | unix ms |
| `updated_at` | int NOT NULL | unix ms |

### `transactions`
| Column | Type | Notes |
|---|---|---|
| `id` | text PK | ULID |
| `account_id` | text NOT NULL | FK → accounts |
| `amount` | int NOT NULL | cents, signed |
| `description` | text NOT NULL | |
| `occurred_at` | text NOT NULL | YYYY-MM-DD |
| `category_id` | text | FK → categories; NULL only for transfers |
| `statement_period` | text | YYYY-MM; credit_card only; caller-supplied |
| `transfer_id` | text | links the two sides of a transfer pair |
| `import_batch_id` | text | groups bulk-imported rows |
| `created_at` | int NOT NULL | unix ms |
| `updated_at` | int NOT NULL | unix ms |

**Transfer semantics:** a transfer creates two transaction rows sharing a `transfer_id`. Outflow side has negative `amount`, inflow side positive. Reports exclude rows where `transfer_id IS NOT NULL` from income/expense totals.

**Validation rules (enforced at Zod layer):**
- `category_id` is required when `transfer_id` is null
- `statement_period` is only valid when the linked account has `type = 'credit_card'`
- `close_day` and `due_day` are only valid on `type = 'credit_card'` accounts

---

## 3. Command Surface

All amounts are cents (signed integer). Flags use kebab-case.

### `accounts`
```
accounts create --name <str> --type checking|credit_card [--close-day N] [--due-day N]
accounts list
accounts get    <id>
accounts update <id> [--name <str>] [--close-day N] [--due-day N]
accounts delete <id>
```

### `categories`
```
categories create --name <str>
categories list
categories update <id> --name <str>
categories delete <id>
```

### `transactions`
```
transactions create       --account <id> --amount <int> --description <str>
                          --occurred-at YYYY-MM-DD --category <id>
                          [--statement-period YYYY-MM]
transactions list         [--account <id>] [--category <id>]
                          [--from YYYY-MM-DD] [--to YYYY-MM-DD]
                          [--statement-period YYYY-MM] [--limit N]
transactions get          <id>
transactions update       <id> [--amount <int>] [--description <str>]
                               [--category <id>] [--occurred-at YYYY-MM-DD]
                               [--statement-period YYYY-MM]
transactions delete       <id>
transactions batch-create --file <path>
```

`batch-create` accepts a JSON array where each element matches the `create` field shape.

### `transfers`
```
transfers create --from <account-id> --to <account-id> --amount <positive int>
                 --occurred-at YYYY-MM-DD [--description <str>]
transfers list   [--account <id>] [--from YYYY-MM-DD] [--to YYYY-MM-DD]
transfers delete <transfer-id>   ← deletes both sides atomically in a transaction
```

### `reports`
```
reports monthly   [--month YYYY-MM] [--account <id>]
reports statement --account <id> --period YYYY-MM
```

`reports monthly` defaults to the current month. Excludes transfer rows from totals.
`reports statement` lists all transactions for a credit card's billing period.

### `imports`
```
imports create --account <id> --file <path> [--format canonical|nubank]
imports list
```

`canonical` format: JSON array matching the `transactions create` field shape.
`nubank`: built-in CSV parser for Nubank credit card exports.
Additional banks added as new `--format` values over time.
`imports list` returns past batches with row counts and created_at.

---

## 4. Data Flow, Error Handling & Testing

### Data flow
```
index.ts (commander)
  → command handler
  → Zod.parse(input)
  → Drizzle query (via feature db.ts)
  → output.ts
  → stdout JSON, exit 0
```

Top-level `catch` in `index.ts` writes error JSON to stderr and exits non-zero.

### Output envelopes

Success (stdout):
```json
{ "ok": true, "data": <result> }
```

Error (stderr):
```json
{ "ok": false, "error": "<message>", "code": "<ERROR_CODE>" }
```

### Error codes
| Code | Meaning |
|---|---|
| `VALIDATION_ERROR` | Zod parse failure, invalid flag values |
| `NOT_FOUND` | Referenced account, category, or transaction doesn't exist |
| `CONFLICT` | e.g. deleting a category that has transactions |
| `DB_ERROR` | Unexpected SQLite error |

### Testing

Runner: `vitest` via `npx vitest run`.

**Unit tests** — Zod schema validation, output formatting helpers, import parsers (nubank CSV → canonical). No DB.

**Integration tests** — each command tested against a real in-memory `better-sqlite3` instance, seeded per test. Covers: happy path, `NOT_FOUND`, `CONFLICT`, `VALIDATION_ERROR`. No mocking of the DB layer — synchronous SQLite is fast enough.

---

## 5. Bundled Skill

Location: `skill/SKILL.md` (agentskills.io format).

**Structure:**
```
skill/
  SKILL.md              ← frontmatter + overview; < 500 lines
  references/
    commands.md         ← full command reference with flag details and JSON output shapes
    workflows.md        ← opinionated recipes for common tasks
```

**SKILL.md frontmatter:**
```yaml
name: dinheiro
description: Personal finance CLI. Manage accounts, transactions, categories, transfers, and reports via `dinheiro <noun> <verb>`. Use for logging expenses, importing bank statements, reconciling credit card bills, and generating monthly summaries.
compatibility: Requires Node 24+. Run `dinheiro --help` to verify installation.
```

**`workflows.md` covers:**
- Log a single expense
- Import a Nubank credit card export
- Reconcile a credit card bill (list statement, verify total, record payment transfer)
- Monthly income vs. expenses review
