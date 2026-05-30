import { eq, desc, inArray } from 'drizzle-orm'
import { ulid } from 'ulid'
import { getDb } from '../db'
import { imports, transactions } from '../schema/index'
import { AppError } from '../errors'
import { computeRowHash, REVERSAL_PREFIX, findReversalOriginal } from '../transactions/db'
import { createTransaction } from '../transactions/db'
import { listRules, matchRule } from '../rules/db'
import type { Import, ImportRow, ImportResult } from './types'

export function createImport(data: {
  accountId: string
  format: 'canonical' | 'nubank'
  filename: string
  rows: ImportRow[]
  dryRun?: boolean
  applyRules?: boolean
}): ImportResult {
  const db = getDb()
  const importId = ulid()
  let inserted = 0
  let skipped = 0
  let categorized = 0
  let reversalsLinked = 0
  // Reversal linking applies to Nubank's `Estorno - ` rows only.
  const detectReversals = data.format === 'nubank'
  // Rules fill in the category for rows that arrive without one. Loaded once;
  // first-match-wins in declaration order. Disabled via --no-rules.
  const rules = data.applyRules === false ? [] : listRules()

  if (data.dryRun) {
    // Mirror the live path's reversal linking so the preview count is accurate:
    // originals are consumed one-per-reversal, and a reversal can match an
    // earlier original from the same batch (live inserts originals as it goes).
    // Seed the candidate pool with existing, still-unlinked originals for this
    // account, then add each inserted non-reversal row as the loop proceeds.
    const pool = detectReversals ? buildReversalPool(data.accountId) : []
    // Mirror the live path's idempotent dedup, which skips a row whose hash was
    // already inserted earlier in the same batch. Without this, a file with a
    // duplicate row would over-count inserted/reversalsLinked in the preview.
    const seenHashes = new Set<string>()
    for (const row of data.rows) {
      const hash = computeRowHash(data.accountId, row.occurredAt, row.amount, row.description)
      const exists =
        seenHashes.has(hash) ||
        db
          .select({ id: transactions.id })
          .from(transactions)
          .where(eq(transactions.rowHash, hash))
          .get()
      if (exists) {
        skipped++
        continue
      }
      seenHashes.add(hash)
      inserted++
      if (!row.categoryId && resolveRowCategory(row, data.accountId, rules)) categorized++
      if (detectReversals) {
        if (row.description.startsWith(REVERSAL_PREFIX)) {
          if (consumeReversalCandidate(pool, row.amount, row.occurredAt)) reversalsLinked++
        } else {
          // A would-be-inserted original becomes a candidate for later reversals.
          pool.push({ amount: row.amount, occurredAt: row.occurredAt })
        }
      }
    }
    return { importId, inserted, skipped, categorized, reversalsLinked }
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
      let categoryId = row.categoryId ?? null
      if (!categoryId) {
        const ruleCategoryId = resolveRowCategory(row, data.accountId, rules)
        if (ruleCategoryId) {
          categoryId = ruleCategoryId
          categorized++
        }
      }
      let reversalOf: string | null = null
      if (detectReversals && row.description.startsWith(REVERSAL_PREFIX)) {
        // Match against rows already in the DB (and earlier rows in this batch,
        // which are inserted as we go). Each original links to one reversal.
        reversalOf =
          findReversalOriginal({
            accountId: data.accountId,
            amount: row.amount,
            occurredAt: row.occurredAt,
          })?.id ?? null
        if (reversalOf) reversalsLinked++
      }
      createTransaction({
        accountId: data.accountId,
        amount: row.amount,
        description: row.description,
        occurredAt: row.occurredAt,
        categoryId,
        statementPeriod: row.statementPeriod ?? null,
        reversalOf,
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

  return { importId, inserted, skipped, categorized, reversalsLinked }
}

// A candidate original a reversal could cancel, kept in memory during a dry run.
interface ReversalCandidate {
  amount: number
  occurredAt: string
}

// Existing, still-unlinked originals for an account — the dry-run starting pool.
// Mirrors findReversalOriginal's eligibility: a candidate is a row that is not a
// transfer row, not itself a reversal, and not already used as some reversal's
// original.
function buildReversalPool(accountId: string): ReversalCandidate[] {
  const db = getDb()
  const rows = db
    .select({
      id: transactions.id,
      amount: transactions.amount,
      occurredAt: transactions.occurredAt,
      transferId: transactions.transferId,
      reversalOf: transactions.reversalOf,
    })
    .from(transactions)
    .where(eq(transactions.accountId, accountId))
    .all()
  const linkedOriginals = new Set(rows.map((r) => r.reversalOf).filter((v): v is string => !!v))
  return rows
    .filter((r) => !r.transferId && !r.reversalOf && !linkedOriginals.has(r.id))
    .map((r) => ({ amount: r.amount, occurredAt: r.occurredAt }))
}

// Consume the earliest matching candidate (exactly opposite amount, original on
// or before the reversal). Removes it from the pool and returns true when
// matched. Mirrors findReversalOriginal's eligibility so the preview count and
// the live count agree.
function consumeReversalCandidate(
  pool: ReversalCandidate[],
  amount: number,
  occurredAt: string,
): boolean {
  let best = -1
  for (let i = 0; i < pool.length; i++) {
    const c = pool[i]
    if (c.amount !== -amount || c.occurredAt > occurredAt) continue
    if (best === -1 || c.occurredAt < pool[best].occurredAt) best = i
  }
  if (best === -1) return false
  pool.splice(best, 1)
  return true
}

// Returns the category a rule assigns to an uncategorized row, or null.
function resolveRowCategory(
  row: ImportRow,
  accountId: string,
  rules: ReturnType<typeof listRules>,
): string | null {
  if (rules.length === 0) return null
  const rule = matchRule(
    { description: row.description, amount: row.amount, occurredAt: row.occurredAt, accountId },
    rules,
  )
  return rule?.categoryId ?? null
}

export function listImports(): Import[] {
  const db = getDb()
  return db.select().from(imports).orderBy(desc(imports.createdAt)).all() as Import[]
}

export function deleteImport(id: string): void {
  const db = getDb()
  const existing = db.select({ id: imports.id }).from(imports).where(eq(imports.id, id)).get()
  if (!existing) throw new AppError('NOT_FOUND', `import ${id} not found`)
  db.transaction(() => {
    // Clear reversals (possibly from other batches) that point at originals in
    // this batch, so deleting the batch doesn't leave dangling reversal_of refs.
    const batchRowIds = db
      .select({ id: transactions.id })
      .from(transactions)
      .where(eq(transactions.importBatchId, id))
    db.update(transactions)
      .set({ reversalOf: null, updatedAt: Date.now() })
      .where(inArray(transactions.reversalOf, batchRowIds))
      .run()
    db.delete(transactions).where(eq(transactions.importBatchId, id)).run()
    db.delete(imports).where(eq(imports.id, id)).run()
  })
}
