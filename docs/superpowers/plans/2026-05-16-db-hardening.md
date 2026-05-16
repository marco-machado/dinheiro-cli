# DB Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden SQLite handling — add explicit `closeDb()`, remove Drizzle internals cast, map SQLite constraint errors to typed codes, fix npm packaging, and document env vars.

**Architecture:** All changes stay within existing module boundaries. `src/db.ts` gains `closeDb()` and tracks `_sqlite` natively instead of exposing `rawSqlite`. Feature db files switch from `rawSqlite(db).transaction()` to Drizzle's own `db.transaction()`. Error mapping is a single new function in `src/errors.ts` wired into the existing catch funnel in `src/index.ts`.

**Tech Stack:** TypeScript, better-sqlite3, drizzle-orm/better-sqlite3, Vitest

---

## File map

| File | Change |
|---|---|
| `src/db.ts` | Add `_sqlite` module var, `closeDb()`, leak-safe `initDb()`, remove `rawSqlite` |
| `src/errors.ts` | Add `mapSqliteError()` |
| `src/index.ts` | Register `process.on('exit', closeDb)`, wire `mapSqliteError` before INTERNAL fallback |
| `src/transactions/db.ts` | Replace `rawSqlite` pattern with `db.transaction()` |
| `src/imports/db.ts` | Replace `rawSqlite` pattern with `db.transaction()` (two sites) |
| `src/transfers/db.ts` | Replace `rawSqlite` pattern with `db.transaction()` (two sites) |
| `tests/helpers.ts` | Import and call `closeDb()` in teardown |
| `tests/db.test.ts` | New — unit tests for `closeDb()` behaviour |
| `tests/errors.test.ts` | New — unit tests for `mapSqliteError()` |
| `package.json` | Add `files`, `prepack`, `prepublishOnly` |
| `CLAUDE.md` | Add Environment variables section |
| `README.md` | Fix `dinheiro.db` → `db.sqlite` example |

---

## Task 1: closeDb() — src/db.ts + tests

**Files:**
- Modify: `src/db.ts`
- Modify: `tests/helpers.ts`
- Create: `tests/db.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/db.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest'
import { initDb, getDb, closeDb } from '../src/db'

afterEach(() => {
  closeDb()
})

describe('db lifecycle', () => {
  it('getDb() throws before initDb()', () => {
    closeDb()
    expect(() => getDb()).toThrow('DB not initialized')
  })

  it('getDb() works after initDb()', () => {
    initDb(':memory:')
    expect(() => getDb()).not.toThrow()
  })

  it('getDb() throws after closeDb()', () => {
    initDb(':memory:')
    closeDb()
    expect(() => getDb()).toThrow('DB not initialized')
  })

  it('initDb() reopens cleanly after closeDb()', () => {
    initDb(':memory:')
    closeDb()
    initDb(':memory:')
    expect(() => getDb()).not.toThrow()
  })

  it('repeated initDb() does not throw (closes previous connection first)', () => {
    initDb(':memory:')
    expect(() => initDb(':memory:')).not.toThrow()
    expect(() => getDb()).not.toThrow()
  })

  it('closeDb() is idempotent', () => {
    initDb(':memory:')
    closeDb()
    expect(() => closeDb()).not.toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/db.test.ts
```

Expected: FAIL — `closeDb` is not exported from `../src/db`

- [ ] **Step 3: Implement closeDb() and update db.ts**

Replace the full contents of `src/db.ts` with:

```ts
import Database from 'better-sqlite3'
import { drizzle, BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from './schema/index'
import { loadConfig } from './config'
import path from 'path'
import fs from 'fs'
import os from 'os'

type Db = BetterSQLite3Database<typeof schema>

let _db: Db | null = null
let _sqlite: Database.Database | null = null

export function initDb(dbPath?: string): Db {
  if (_sqlite) {
    _sqlite.close()
    _sqlite = null
    _db = null
  }

  const config = loadConfig()
  const xdgData = process.env.XDG_DATA_HOME ?? path.join(os.homedir(), '.local', 'share')
  const defaultPath =
    process.env.DINHEIRO_DB ?? config.db ?? path.join(xdgData, 'dinheiro', 'db.sqlite')

  const resolved = dbPath ?? defaultPath

  if (resolved !== ':memory:') {
    fs.mkdirSync(path.dirname(resolved), { recursive: true })
  }

  const sqlite = new Database(resolved)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')

  const db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder: path.resolve(__dirname, '../migrations') })

  _sqlite = sqlite
  _db = db
  return db
}

export function getDb(): Db {
  if (!_db) throw new Error('DB not initialized. Call initDb() first.')
  return _db
}

export function closeDb(): void {
  if (_sqlite) {
    _sqlite.close()
    _sqlite = null
    _db = null
  }
}

export function rawSqlite(db: Db): Database.Database {
  return (db as unknown as { session: { client: Database.Database } }).session.client
}
```

Note: `rawSqlite` stays for now — it will be removed in Task 3 after its callers are updated.

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/db.test.ts
```

Expected: all 6 tests PASS

- [ ] **Step 5: Update tests/helpers.ts to close the DB in teardown**

Replace the full contents of `tests/helpers.ts`:

```ts
import { afterEach } from 'vitest'
import { initDb, closeDb } from '../src/db'

export function setupTestDb() {
  afterEach(() => {
    closeDb()
  })
  return initDb(':memory:')
}
```

Note: `setupTestDb` is called in `beforeEach` in every test file (e.g. `beforeEach(() => { setupTestDb() })`). The `afterEach` registered here will run after each test, closing the connection the corresponding `beforeEach` opened.

- [ ] **Step 6: Run the full suite to verify nothing broke**

```bash
npx vitest run
```

Expected: all existing tests pass

- [ ] **Step 7: Commit**

```bash
git add src/db.ts tests/helpers.ts tests/db.test.ts
git commit -m "feat: add closeDb() and leak-safe initDb()"
```

---

## Task 2: Wire process.on('exit') — src/index.ts

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Add the exit handler**

In `src/index.ts`, add the import for `closeDb` and register the handler at module scope (right after the existing imports block, before `const program = new Command()`):

The import line changes from:
```ts
import { initDb } from './db'
```
to:
```ts
import { initDb, closeDb } from './db'
```

Then add this line immediately after the imports block (before `const program = new Command()`):

```ts
process.on('exit', () => closeDb())
```

The relevant section of `src/index.ts` should look like:

```ts
import { Command, CommanderError } from 'commander'
import { AppError } from './errors'
import { failure } from './output'
import { initDb, closeDb } from './db'
import { registerAccounts } from './accounts/commands'
import { registerCategories } from './categories/commands'
import { registerTransactions } from './transactions/commands'
import { registerTransfers } from './transfers/commands'
import { registerReports } from './reports/commands'
import { registerImports } from './imports/commands'

process.on('exit', () => closeDb())

const program = new Command()
```

- [ ] **Step 2: Build to confirm no TypeScript errors**

```bash
npm run build
```

Expected: exits 0, `dist/` updated

- [ ] **Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: close db connection on process exit"
```

---

## Task 3: Replace rawSqlite casts

**Files:**
- Modify: `src/transactions/db.ts`
- Modify: `src/imports/db.ts`
- Modify: `src/transfers/db.ts`
- Modify: `src/db.ts` (remove `rawSqlite`)

The pattern to replace in all three files:

**Old pattern A** (assign + call):
```ts
const sqlite = rawSqlite(db)
const runBatch = sqlite.transaction(() => { ... })
runBatch()
```

**New pattern A:**
```ts
db.transaction(() => { ... })
```

**Old pattern B** (inline IIFE):
```ts
const sqlite = rawSqlite(db)
sqlite.transaction(() => { ... })()
```

**New pattern B:**
```ts
db.transaction(() => { ... })
```

Drizzle's `db.transaction(cb)` on the better-sqlite3 driver is synchronous. It begins a transaction, calls `cb`, commits on return, and rolls back if `cb` throws. Inner helpers that call `getDb()` still operate on the same connection and are included in the transaction.

- [ ] **Step 1: Update src/transactions/db.ts**

Remove the `rawSqlite` import (change `import { getDb, rawSqlite }` to `import { getDb }`).

Replace `batchCreateTransactions` (lines 113–142 in the original):

```ts
export function batchCreateTransactions(rows: TransactionInput[]): {
  inserted: number
  skipped: number
} {
  const db = getDb()
  let inserted = 0
  let skipped = 0

  db.transaction(() => {
    for (const row of rows) {
      const hash = computeRowHash(row.accountId, row.occurredAt, row.amount, row.description)
      const existing = db
        .select({ id: transactions.id })
        .from(transactions)
        .where(eq(transactions.rowHash, hash))
        .get()
      if (existing) {
        skipped++
        continue
      }
      createTransaction({ ...row, rowHash: hash })
      inserted++
    }
  })

  return { inserted, skipped }
}
```

- [ ] **Step 2: Update src/transfers/db.ts**

Remove `rawSqlite` from the import (`import { getDb, rawSqlite }` → `import { getDb }`).

Replace `createTransfer` body (remove `const sqlite = rawSqlite(db)`, change `sqlite.transaction(...)()` to `db.transaction(...)`):

```ts
export function createTransfer(data: {
  fromAccountId: string
  toAccountId: string
  amount: number
  occurredAt: string
  description?: string
}): TransferResult {
  const db = getDb()
  const transferId = ulid()
  const description = data.description ?? 'Transfer'
  db.transaction(() => {
    createTransaction({
      accountId: data.fromAccountId,
      amount: -data.amount,
      description,
      occurredAt: data.occurredAt,
      transferId,
    })
    createTransaction({
      accountId: data.toAccountId,
      amount: data.amount,
      description,
      occurredAt: data.occurredAt,
      transferId,
    })
  })
  return {
    transferId,
    fromAccountId: data.fromAccountId,
    toAccountId: data.toAccountId,
    amount: data.amount,
    occurredAt: data.occurredAt,
    description,
  }
}
```

Replace `deleteTransfer` body:

```ts
export function deleteTransfer(transferId: string): void {
  const db = getDb()
  const rows = db.select().from(transactions).where(eq(transactions.transferId, transferId)).all()
  if (rows.length === 0) throw new AppError('NOT_FOUND', `transfer ${transferId} not found`)
  db.transaction(() => {
    db.delete(transactions).where(eq(transactions.transferId, transferId)).run()
  })
}
```

- [ ] **Step 3: Update src/imports/db.ts**

Remove `rawSqlite` from the import (`import { getDb, rawSqlite }` → `import { getDb }`).

Replace `createImport` — remove `const sqlite = rawSqlite(db)` and change `sqlite.transaction(...)()` to `db.transaction(...)`:

```ts
export function createImport(data: {
  accountId: string
  format: 'canonical' | 'nubank'
  filename: string
  rows: ImportRow[]
  dryRun?: boolean
}): ImportResult {
  const db = getDb()
  const importId = ulid()
  let inserted = 0
  let skipped = 0

  if (data.dryRun) {
    for (const row of data.rows) {
      const hash = computeRowHash(data.accountId, row.occurredAt, row.amount, row.description)
      const exists = db
        .select({ id: transactions.id })
        .from(transactions)
        .where(eq(transactions.rowHash, hash))
        .get()
      if (exists) skipped++
      else inserted++
    }
    return { importId, inserted, skipped }
  }

  db.transaction(() => {
    const now = Date.now()
    db.insert(imports)
      .values({
        id: importId,
        accountId: data.accountId,
        format: data.format,
        filename: data.filename,
        rowCount: 0,
        createdAt: now,
        updatedAt: now,
      })
      .run()

    for (const row of data.rows) {
      if (!Number.isInteger(row.amount)) {
        throw new AppError('VALIDATION_ERROR', `invalid amount: ${row.amount}`)
      }
      const hash = computeRowHash(data.accountId, row.occurredAt, row.amount, row.description)
      const exists = db
        .select({ id: transactions.id })
        .from(transactions)
        .where(eq(transactions.rowHash, hash))
        .get()
      if (exists) {
        skipped++
        continue
      }
      createTransaction({
        accountId: data.accountId,
        amount: row.amount,
        description: row.description,
        occurredAt: row.occurredAt,
        categoryId: row.categoryId ?? null,
        statementPeriod: row.statementPeriod ?? null,
        importBatchId: importId,
        rowHash: hash,
      })
      inserted++
    }

    db.update(imports)
      .set({ rowCount: inserted, updatedAt: Date.now() })
      .where(eq(imports.id, importId))
      .run()
  })

  return { importId, inserted, skipped }
}
```

Replace `deleteImport` body — remove `const sqlite = rawSqlite(db)`, change `sqlite.transaction(...)()` to `db.transaction(...)`:

```ts
export function deleteImport(id: string): void {
  const db = getDb()
  const existing = db.select({ id: imports.id }).from(imports).where(eq(imports.id, id)).get()
  if (!existing) throw new AppError('NOT_FOUND', `import ${id} not found`)
  db.transaction(() => {
    db.delete(transactions).where(eq(transactions.importBatchId, id)).run()
    db.delete(imports).where(eq(imports.id, id)).run()
  })
}
```

- [ ] **Step 4: Remove rawSqlite from src/db.ts**

Delete the `rawSqlite` export from `src/db.ts` — remove these lines:

```ts
export function rawSqlite(db: Db): Database.Database {
  return (db as unknown as { session: { client: Database.Database } }).session.client
}
```

- [ ] **Step 5: Run the full suite to verify atomicity tests still pass**

```bash
npx vitest run
```

Expected: all tests PASS. Key tests to watch: `imports.test.ts` "rolls back all rows on failure", `transfers.test.ts` "deletes both sides atomically".

- [ ] **Step 6: Build**

```bash
npm run build
```

Expected: exits 0 with no TypeScript errors

- [ ] **Step 7: Commit**

```bash
git add src/db.ts src/transactions/db.ts src/imports/db.ts src/transfers/db.ts
git commit -m "refactor: replace rawSqlite internals cast with db.transaction()"
```

---

## Task 4: mapSqliteError — src/errors.ts

**Files:**
- Modify: `src/errors.ts`
- Create: `tests/errors.test.ts`

- [ ] **Step 1: Write the failing unit tests**

Create `tests/errors.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mapSqliteError } from '../src/errors'

function sqliteErr(code: string, message: string): Error {
  const e = new Error(message) as Error & { code: string }
  e.code = code
  return e
}

describe('mapSqliteError', () => {
  it('returns null for non-Error values', () => {
    expect(mapSqliteError('string')).toBeNull()
    expect(mapSqliteError(42)).toBeNull()
    expect(mapSqliteError(null)).toBeNull()
  })

  it('returns null for non-SQLite errors', () => {
    const e = new Error('something else')
    expect(mapSqliteError(e)).toBeNull()
  })

  it('returns null for Error without code', () => {
    expect(mapSqliteError(new Error('no code'))).toBeNull()
  })

  it('maps SQLITE_CONSTRAINT_UNIQUE to CONFLICT with parsed column', () => {
    const e = sqliteErr('SQLITE_CONSTRAINT_UNIQUE', 'UNIQUE constraint failed: accounts.name')
    const result = mapSqliteError(e)
    expect(result).not.toBeNull()
    expect(result!.code).toBe('CONFLICT')
    expect(result!.message).toBe('accounts.name already exists')
  })

  it('maps SQLITE_CONSTRAINT_UNIQUE with fallback message when parsing fails', () => {
    const e = sqliteErr('SQLITE_CONSTRAINT_UNIQUE', 'unparseable message')
    const result = mapSqliteError(e)
    expect(result).not.toBeNull()
    expect(result!.code).toBe('CONFLICT')
    expect(result!.message).toBe('unparseable message')
  })

  it('maps SQLITE_CONSTRAINT_PRIMARYKEY to CONFLICT', () => {
    const e = sqliteErr('SQLITE_CONSTRAINT_PRIMARYKEY', 'PRIMARY KEY constraint failed: accounts.id')
    const result = mapSqliteError(e)
    expect(result!.code).toBe('CONFLICT')
  })

  it('maps SQLITE_CONSTRAINT_FOREIGNKEY to CONFLICT', () => {
    const e = sqliteErr('SQLITE_CONSTRAINT_FOREIGNKEY', 'FOREIGN KEY constraint failed')
    const result = mapSqliteError(e)
    expect(result!.code).toBe('CONFLICT')
    expect(result!.message).toBe('FOREIGN KEY constraint failed')
  })

  it('maps SQLITE_CONSTRAINT_NOTNULL to VALIDATION_ERROR', () => {
    const e = sqliteErr('SQLITE_CONSTRAINT_NOTNULL', 'NOT NULL constraint failed: accounts.name')
    const result = mapSqliteError(e)
    expect(result!.code).toBe('VALIDATION_ERROR')
  })

  it('maps SQLITE_CONSTRAINT_CHECK to VALIDATION_ERROR', () => {
    const e = sqliteErr('SQLITE_CONSTRAINT_CHECK', 'CHECK constraint failed: accounts')
    const result = mapSqliteError(e)
    expect(result!.code).toBe('VALIDATION_ERROR')
  })

  it('maps other SQLITE_ codes to DB_ERROR', () => {
    const e = sqliteErr('SQLITE_FULL', 'database or disk is full')
    const result = mapSqliteError(e)
    expect(result!.code).toBe('DB_ERROR')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/errors.test.ts
```

Expected: FAIL — `mapSqliteError` is not exported from `../src/errors`

- [ ] **Step 3: Implement mapSqliteError in src/errors.ts**

Append to `src/errors.ts`:

```ts
export function mapSqliteError(err: unknown): AppError | null {
  if (!(err instanceof Error)) return null
  const code = (err as { code?: unknown }).code
  if (typeof code !== 'string' || !code.startsWith('SQLITE_')) return null

  if (code === 'SQLITE_CONSTRAINT_UNIQUE' || code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
    const match = /UNIQUE constraint failed: (.+)/.exec(err.message)
    const msg = match ? `${match[1]} already exists` : err.message
    return new AppError('CONFLICT', msg)
  }

  if (code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
    return new AppError('CONFLICT', err.message)
  }

  if (code === 'SQLITE_CONSTRAINT_NOTNULL' || code === 'SQLITE_CONSTRAINT_CHECK') {
    return new AppError('VALIDATION_ERROR', err.message)
  }

  return new AppError('DB_ERROR', err.message)
}
```

- [ ] **Step 4: Run unit tests to verify they pass**

```bash
npx vitest run tests/errors.test.ts
```

Expected: all 10 tests PASS

- [ ] **Step 5: Add an integration test for duplicate account name**

In `tests/accounts.test.ts`, add inside the `describe('accounts', ...)` block:

```ts
it('throws a SQLite unique constraint error on duplicate name', () => {
  createAccount({ name: 'Duplicate', type: 'checking' })
  let thrown: unknown
  try {
    createAccount({ name: 'Duplicate', type: 'checking' })
  } catch (e) {
    thrown = e
  }
  expect(thrown).toBeInstanceOf(Error)
  const err = thrown as Error & { code?: string }
  expect(err.code).toBe('SQLITE_CONSTRAINT_UNIQUE')
})
```

This verifies that the raw SQLite error surfaced by Drizzle has the right `code` property, which `mapSqliteError` will consume in the funnel.

- [ ] **Step 6: Run accounts tests to confirm**

```bash
npx vitest run tests/accounts.test.ts
```

Expected: all tests PASS including the new one

- [ ] **Step 7: Commit**

```bash
git add src/errors.ts tests/errors.test.ts tests/accounts.test.ts
git commit -m "feat: add mapSqliteError to map SQLite constraint errors to typed AppError codes"
```

---

## Task 5: Wire mapSqliteError in src/index.ts

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Update the import and the catch block**

In `src/index.ts`, update the errors import:

```ts
import { AppError, mapSqliteError } from './errors'
```

In the `main()` catch block, add the `mapSqliteError` check between the `CommanderError` check and the `INTERNAL` fallback:

```ts
async function main() {
  try {
    await program.parseAsync()
  } catch (err) {
    if (err instanceof AppError) {
      failure(err.message, err.code)
      process.exit(1)
    }
    if (err instanceof CommanderError) {
      if (
        err.code === 'commander.helpDisplayed' ||
        err.code === 'commander.version' ||
        err.exitCode === 0
      ) {
        process.exit(0)
      }
      failure(err.message, 'VALIDATION_ERROR')
      process.exit(1)
    }
    const mapped = mapSqliteError(err)
    if (mapped) {
      failure(mapped.message, mapped.code)
      process.exit(1)
    }
    failure(err instanceof Error ? err.message : String(err), 'INTERNAL')
    process.exit(1)
  }
}
```

- [ ] **Step 2: Run full test suite**

```bash
npx vitest run
```

Expected: all tests PASS

- [ ] **Step 3: Build**

```bash
npm run build
```

Expected: exits 0

- [ ] **Step 4: Commit**

```bash
git add src/index.ts
git commit -m "feat: wire mapSqliteError into error funnel before INTERNAL fallback"
```

---

## Task 6: npm packaging — package.json

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add files, prepack, and prepublishOnly**

Update `package.json`. Add `"files"` at the top level and two new scripts:

The `scripts` section becomes:

```json
"scripts": {
  "build": "tsc",
  "dev": "tsx src/index.ts",
  "test": "vitest run",
  "format": "prettier --write \"src/**/*.ts\" \"tests/**/*.ts\"",
  "format:check": "prettier --check \"src/**/*.ts\" \"tests/**/*.ts\"",
  "lint": "eslint src tests",
  "db:generate": "drizzle-kit generate",
  "db:migrate": "drizzle-kit migrate",
  "prepare": "husky",
  "prepack": "npm run build",
  "prepublishOnly": "npm run format:check && npm run lint && npm test"
},
```

Add `"files"` after `"engines"`:

```json
"files": [
  "dist",
  "migrations"
],
```

- [ ] **Step 2: Verify dry-run includes the right files**

```bash
npm pack --dry-run 2>&1 | grep -E "^npm notice"
```

Expected output includes lines for files in `dist/` and `migrations/`. Confirm `package.json` and `README.md` are also listed (npm always includes them).

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore: fix npm packaging — add files allowlist, prepack, prepublishOnly"
```

---

## Task 7: Docs — CLAUDE.md + README.md

**Files:**
- Modify: `CLAUDE.md`
- Modify: `README.md`

- [ ] **Step 1: Add Environment variables section to CLAUDE.md**

Append a new section after the existing `## Gotchas` section in `CLAUDE.md`:

```markdown
## Environment variables

| Variable          | Effect                                                                         |
| ----------------- | ------------------------------------------------------------------------------ |
| `DINHEIRO_DB`     | SQLite DB file path. Highest precedence. `:memory:` → ephemeral in-memory DB. |
| `DINHEIRO_CONFIG` | Config JSON path. Default `$XDG_CONFIG_HOME/dinheiro/config.json`.            |
| `XDG_DATA_HOME`   | Base dir for the default DB path. Default `~/.local/share`.                   |
| `XDG_CONFIG_HOME` | Base dir for the default config path. Default `~/.config`.                    |

DB-path precedence: `DINHEIRO_DB` > config file `db` field > `$XDG_DATA_HOME/dinheiro/db.sqlite`.
```

- [ ] **Step 2: Fix README.md filename mismatch**

In `README.md` around line 98, the example uses `dinheiro.db`. Change it to `db.sqlite` to match the code default:

Old:
```bash
export DINHEIRO_DB="$HOME/.local/share/dinheiro/dinheiro.db"
```

New:
```bash
export DINHEIRO_DB="$HOME/.local/share/dinheiro/db.sqlite"
```

- [ ] **Step 3: Run format check and lint**

```bash
npm run format:check && npm run lint
```

Expected: both pass (markdown files are not in the prettier/eslint scope, so this verifies the TS files are still clean)

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md README.md
git commit -m "docs: add environment variables section to CLAUDE.md, fix README db filename"
```

---

## Task 8: Final verification

- [ ] **Step 1: Full quality gate**

```bash
npm run format:check && npm run lint && npm run build && npx vitest run
```

Expected: all four pass

- [ ] **Step 2: Verify dry-run manifest**

```bash
npm pack --dry-run 2>&1 | grep -E "(dist/|migrations/)" | head -20
```

Expected: lists files from both `dist/` and `migrations/`

- [ ] **Step 3: Smoke-test the packed tarball**

```bash
npm pack
TARBALL=$(ls dinheiro-cli-*.tgz | tail -1)
TMPDIR=$(mktemp -d)
cd "$TMPDIR"
npm init -y
npm install "$OLDPWD/$TARBALL"
DINHEIRO_DB=":memory:" ./node_modules/.bin/dinheiro --version
DINHEIRO_DB=":memory:" ./node_modules/.bin/dinheiro accounts list
cd "$OLDPWD"
trash "$TMPDIR" "$TARBALL"
```

Expected: `--version` prints the version string, `accounts list` prints `{"ok":true,"data":[]}`, no errors about missing `dist/` or `migrations/`.
