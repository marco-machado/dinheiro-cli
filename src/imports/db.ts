import { eq, desc } from 'drizzle-orm'
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
    for (const row of data.rows) {
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
      inserted++
      if (!row.categoryId && resolveRowCategory(row, data.accountId, rules)) categorized++
      if (
        detectReversals &&
        row.description.startsWith(REVERSAL_PREFIX) &&
        findReversalOriginal({
          accountId: data.accountId,
          amount: row.amount,
          occurredAt: row.occurredAt,
        })
      ) {
        reversalsLinked++
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
    db.delete(transactions).where(eq(transactions.importBatchId, id)).run()
    db.delete(imports).where(eq(imports.id, id)).run()
  })
}
