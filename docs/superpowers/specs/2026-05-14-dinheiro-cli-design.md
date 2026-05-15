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
- `commander` — CLI subcommand dispatch; configured with `exitOverride()` + `configureOutput()` so parse errors emit JSON to stderr instead of usage text

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
- `--pretty` → stdout human-readable table/summary; stderr errors remain JSON always

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

### `imports`
| Column | Type | Notes |
|---|---|---|
| `id` | text PK | ULID — also used as `import_batch_id` on transactions |
| `account_id` | text NOT NULL | FK → accounts |
| `format` | text NOT NULL | `'canonical'` \| `'nubank'` |
| `filename` | text NOT NULL | original filename for reference |
| `row_count` | int NOT NULL | number of transactions successfully imported |
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
| `statement_period` | text | YYYY-MM; REQUIRED for credit_card transactions; caller-supplied |
| `transfer_id` | text | links the two sides of a transfer pair |
| `import_batch_id` | text | FK → imports.id; groups bulk-imported rows |
| `row_hash` | text UNIQUE | SHA-256 of `account_id + occurred_at + amount + description`; used for dedup on import |
| `created_at` | int NOT NULL | unix ms |
| `updated_at` | int NOT NULL | unix ms |

**Transfer semantics:** a transfer creates two transaction rows sharing a `transfer_id`. The caller passes a positive `--amount`; the CLI writes it as negative on the `--from` account and positive on the `--to` account. Reports exclude rows where `transfer_id IS NOT NULL` from income/expense totals. Transfer rows are immutable via the `transactions` commands — `transactions update` and `transactions delete` return `CONFLICT` if the target row has a `transfer_id`. Use `transfers delete` to remove both sides atomically.

**Validation phases:**
1. **Shape validation (Zod)** — types, required fields, format (YYYY-MM-DD, YYYY-MM, positive int, etc.)
2. **Business rule validation (command handler, after DB lookup)** — checks that require fetched state:
   - `category_id` is required when `transfer_id` is null
   - `statement_period` is required when the linked account has `type = 'credit_card'`; forbidden otherwise
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
                          [--statement-period YYYY-MM] [--search <str>]
                          [--limit N]
transactions get          <id>
transactions update       <id> [--amount <int>] [--description <str>]
                               [--category <id>] [--occurred-at YYYY-MM-DD]
                               [--statement-period YYYY-MM]
                          ← returns CONFLICT if row has transfer_id
transactions delete       <id>
                          ← returns CONFLICT if row has transfer_id
transactions batch-create --file <path>
```

`--search` performs a case-insensitive LIKE match on `description`.

`batch-create` accepts a JSON array where each element matches the `create` field shape. The entire batch is wrapped in a single SQLite transaction — on any row failure the whole batch rolls back.

### `transfers`
```
transfers create --from <account-id> --to <account-id> --amount <positive int>
                 --occurred-at YYYY-MM-DD [--description <str>]
transfers list   [--account <id>] [--from YYYY-MM-DD] [--to YYYY-MM-DD]
transfers delete <transfer-id>   ← deletes both sides atomically in a single SQLite transaction
```

### `reports`
```
reports monthly   [--month YYYY-MM] [--account <id>]
reports statement --account <id> --period YYYY-MM
```

`reports monthly` defaults to the current month. When `--account` is provided, output is scoped to that account only; otherwise aggregates across all accounts. Excludes transfer rows from totals.

Output shape:
```json
{
  "month": "YYYY-MM",
  "income_total": <int>,
  "expense_total": <int>,
  "net": <int>,
  "by_category": [
    { "category": "<name>", "total": <int>, "pct": <float> }
  ]
}
```

`reports statement` lists all transactions for a credit card's billing period (filtered by `statement_period`).

### `imports`
```
imports create --account <id> --file <path> [--format canonical|nubank] [--dry-run]
imports list
```

`canonical` format: JSON array; each row uses the `transactions create` field shape without an `account` field — `--account` is authoritative for all rows.

`nubank`: built-in CSV parser for Nubank credit card exports. Additional banks added as new `--format` values over time.

`--dry-run`: validates and parses the file, prints what would be inserted (including duplicate row counts), but makes no DB writes.

**Import deduplication:** before inserting each row, the CLI computes `row_hash = SHA-256(account_id + occurred_at + amount + description)`. Rows with a hash already in the DB are silently skipped; the response includes `{ inserted, skipped }` counts.

**Import atomicity:** all inserts (including the `imports` record) are wrapped in a single SQLite transaction. On any failure the whole batch rolls back and no partial state is written.

`imports list` returns past batches ordered by `created_at` desc, with `row_count` and `filename`.

---

## 4. Data Flow, Error Handling & Testing

### Data flow
```
index.ts (commander)
  → command handler
  → Zod.parse(input)              ← shape validation
  → DB lookup (account, category) ← fetch referenced entities
  → business rule checks          ← validate against fetched state
  → Drizzle query (via feature db.ts)
  → output.ts
  → stdout JSON, exit 0
```

Top-level `catch` in `index.ts` writes error JSON to stderr and exits non-zero.

Commander is configured with `program.exitOverride()` and `program.configureOutput({ writeErr: () => {} })` so its own parse errors are caught and re-emitted as JSON — no usage text leaks to stderr.

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
| `VALIDATION_ERROR` | Zod parse failure, invalid flag values, failed business rule check |
| `NOT_FOUND` | Referenced account, category, or transaction doesn't exist |
| `CONFLICT` | Mutating a transfer row via transactions commands; deleting a category with transactions |
| `DB_ERROR` | Unexpected SQLite error |

### Testing

Runner: `vitest` via `npx vitest run`.

**Unit tests** — Zod schema validation, output formatting helpers, import parsers (nubank CSV → canonical), `row_hash` computation. No DB.

**Integration tests** — each command tested against a real in-memory `better-sqlite3` instance, seeded per test. Covers: happy path, `NOT_FOUND`, `CONFLICT`, `VALIDATION_ERROR`, transfer immutability, import dedup (skipped count), import rollback on partial failure. No mocking of the DB layer — synchronous SQLite is fast enough.

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
