# DB hardening — design

**Date:** 2026-05-16
**Status:** approved

## Goal

Harden how `dinheiro-cli` handles its SQLite database: add an explicit connection
close, remove fragile coupling to Drizzle internals, stop SQLite constraint errors
from leaking as `INTERNAL`, fix npm packaging so the published package actually
works, and document the environment variables.

## Scope

In scope:

1. Explicit `closeDb()`.
2. npm packaging fix + answer on the `db:*` scripts.
3. Replace the `(db as any).session.client` transaction cast (issue A).
4. Map SQLite constraint errors to typed `AppError` codes (issue B).
5. Document environment variables in `CLAUDE.md`.

Out of scope:

- Migrate-on-every-command optimization (issue C) — accepted as-is.
- Friendly per-entity error messages at every write site — the funnel mapping in
  section 4 is the agreed safety net instead.

## Touchpoints

`src/db.ts`, `src/index.ts`, `src/errors.ts`, the five feature `db.ts` files
(`accounts`, `categories`, `transactions`, `transfers`, `imports`), `package.json`,
`CLAUDE.md`, `README.md`, tests.

## 1 — Explicit `closeDb()`

`src/db.ts` currently keeps only the Drizzle wrapper in a module singleton (`_db`)
and never closes the underlying connection.

Changes:

- Track the raw `better-sqlite3` handle in its own module variable (`_sqlite`),
  set in `initDb()` alongside `_db`. This is the single source of truth for the
  raw connection — nothing else digs it out of Drizzle internals.
- Add `closeDb()`: if `_sqlite` is open, call `_sqlite.close()`, then null both
  `_sqlite` and `_db`.
- Make `initDb()` leak-safe: if a connection is already open, close it before
  opening a new one. This matters for tests that call `initDb()` repeatedly.

Wiring:

- `src/index.ts` registers `process.on('exit', () => closeDb())` once at module
  scope. better-sqlite3's `close()` is synchronous, so it runs correctly inside an
  `exit` handler. This covers the `process.exit(1)` paths in the catch block that
  a `finally` block would skip.
- Tests call `closeDb()` directly in teardown (`afterEach`/`afterAll`).

## 2 — npm packaging

The published package is currently broken: `package.json` has no `files` field,
so npm falls back to `.gitignore`, which excludes `dist/`. `bin` points at
`./dist/index.js`, and the runtime auto-migrate reads `../migrations` — both would
be missing from the tarball.

Changes to `package.json`:

- Add `"files": ["dist", "migrations"]` — explicit publish allowlist; overrides
  the `.gitignore` fallback. `package.json` and `README.md` are always included.
- Add `"prepack": "npm run build"` — builds `dist/` into the tarball for both
  `npm pack` and `npm publish`, since `dist/` is gitignored and not in the repo.
- Add `"prepublishOnly": "npm run format:check && npm run lint && npm test"` —
  gates publish on the same checks CI runs.

The runtime migrations path `path.resolve(__dirname, '../migrations')` resolves
correctly from an installed package
(`node_modules/dinheiro-cli/dist/db.js` -> `node_modules/dinheiro-cli/migrations`)
once `migrations` is in `files`.

Decision on the `db:*` scripts: keep both `db:generate` and `db:migrate`. npm
`scripts` are never exposed to package consumers — only `bin` is — so there is
nothing to remove or hide for the published package. `db:migrate` is redundant
with the runtime auto-migrate but is a harmless dev convenience and stays.

## 3 — Replace the transaction cast (issue A)

Five sites reach into Drizzle internals:

```ts
const sqlite = (db as any).session.client as import('better-sqlite3').Database
sqlite.transaction(() => { ... })()
```

Sites: `transactions/db.ts` `batchCreateTransactions`; `imports/db.ts`
`createImport` and `deleteImport`; `transfers/db.ts` `createTransfer` and
`deleteTransfer`.

Replace each with Drizzle's own API:

```ts
db.transaction(() => { ... })
```

`db.transaction()` on the better-sqlite3 driver is synchronous, returns the
callback's return value, and rolls back if the callback throws. Inner helpers
(`createTransaction`) keep calling `getDb()` unchanged — better-sqlite3
transactions are connection-scoped, so statements issued through the outer `db`
inside the callback are still part of the transaction.

## 4 — Map SQLite errors (issue B)

Today a raw SQLite constraint error (e.g. duplicate account name ->
`SQLITE_CONSTRAINT_UNIQUE`) is uncaught and surfaces through the funnel as
`INTERNAL`. `CLAUDE.md` advertises a `DB_ERROR` code that is almost unused.

Add `mapSqliteError(err: unknown): AppError | null` to `src/errors.ts`:

- Returns `null` if `err` is not an `Error` with a `string` `code` starting
  with `SQLITE_` — lets the caller fall through to existing handling.
- `SQLITE_CONSTRAINT_UNIQUE` / `SQLITE_CONSTRAINT_PRIMARYKEY` -> `CONFLICT`.
  The message parses the `table.column` out of SQLite's
  `"UNIQUE constraint failed: accounts.name"` and renders
  `"accounts.name already exists"`; if parsing fails, fall back to the raw
  message.
- `SQLITE_CONSTRAINT_FOREIGNKEY` -> `CONFLICT`.
- `SQLITE_CONSTRAINT_NOTNULL` / `SQLITE_CONSTRAINT_CHECK` -> `VALIDATION_ERROR`.
- any other `SQLITE_*` -> `DB_ERROR`.

Apply it at the error funnel in `src/index.ts`, after the `AppError` and
`CommanderError` checks and before the generic `INTERNAL` fallback:

```ts
const mapped = mapSqliteError(err)
if (mapped) { failure(mapped.message, mapped.code); process.exit(1) }
```

`deleteAccount`'s existing try/catch in `src/accounts/db.ts` stays unchanged — its
message (`account <id> has associated transactions or imports`) is more specific
than the generic foreign-key message and runs before the funnel is reached.

## 5 — Document environment variables (`CLAUDE.md`)

Add an "Environment variables" section:

| Variable          | Effect                                                                            |
| ----------------- | --------------------------------------------------------------------------------- |
| `DINHEIRO_DB`     | SQLite DB file path. Highest precedence. `:memory:` -> ephemeral in-memory DB.    |
| `DINHEIRO_CONFIG` | Config JSON path. Default `$XDG_CONFIG_HOME/dinheiro/config.json`.                |
| `XDG_DATA_HOME`   | Base dir for the default DB path. Default `~/.local/share`.                       |
| `XDG_CONFIG_HOME` | Base dir for the default config path. Default `~/.config`.                        |

Also document DB-path precedence: `DINHEIRO_DB` > config file `db` field >
`$XDG_DATA_HOME/dinheiro/db.sqlite`.

Fix `README.md` (around line 98): its example uses the filename `dinheiro.db`,
which disagrees with the code default `db.sqlite`. Align the example with the
default.

## 6 — Testing

- `closeDb()`: `getDb()` throws after `closeDb()`; `initDb()` reopens cleanly
  after a close; repeated `initDb()` does not leak (the previous connection is
  closed first).
- Transaction cast: existing transfer/import atomicity tests still pass; add a
  test that a throw mid-transaction persists no rows, if not already covered.
- Error mapping: unit-test each `mapSqliteError` branch (unique, primary key,
  foreign key, not-null, check, other); integration test — creating a duplicate
  account name returns `{ ok: false, code: 'CONFLICT' }`, not `INTERNAL`.
- Packaging: `npm pack --dry-run` lists `dist/` and `migrations/`; smoke-test the
  packed tarball in a temp dir — install it, run `dinheiro --version` and one real
  command against a temp `DINHEIRO_DB`.

## Verification

`npm run format:check`, `npm run lint`, `npm run build`, `npm test` all pass
(or `/verify`).
