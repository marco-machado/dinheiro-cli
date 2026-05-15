import { eq, desc } from 'drizzle-orm'
import { ulid } from 'ulid'
import { getDb } from '../db'
import { imports, transactions } from '../schema/index'
import { AppError } from '../errors'
import { computeRowHash } from '../transactions/db'
import { createTransaction } from '../transactions/db'
import type { Import, ImportRow, ImportResult } from './types'

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

  const sqlite = (db as any).session.client as import('better-sqlite3').Database

  if (data.dryRun) {
    for (const row of data.rows) {
      const hash = computeRowHash(data.accountId, row.occurredAt, row.amount, row.description)
      const exists = db.select({ id: transactions.id }).from(transactions)
        .where(eq(transactions.rowHash, hash)).get()
      exists ? skipped++ : inserted++
    }
    return { importId, inserted, skipped }
  }

  sqlite.transaction(() => {
    const now = Date.now()
    db.insert(imports).values({
      id: importId,
      accountId: data.accountId,
      format: data.format,
      filename: data.filename,
      rowCount: 0,
      createdAt: now,
      updatedAt: now,
    }).run()

    for (const row of data.rows) {
      if (!Number.isInteger(row.amount)) {
        throw new AppError('VALIDATION_ERROR', `invalid amount: ${row.amount}`)
      }
      const hash = computeRowHash(data.accountId, row.occurredAt, row.amount, row.description)
      const exists = db.select({ id: transactions.id }).from(transactions)
        .where(eq(transactions.rowHash, hash)).get()
      if (exists) { skipped++; continue }
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

    db.update(imports).set({ rowCount: inserted, updatedAt: Date.now() }).where(eq(imports.id, importId)).run()
  })()

  return { importId, inserted, skipped }
}

export function listImports(): Import[] {
  const db = getDb()
  return db.select().from(imports).orderBy(desc(imports.createdAt)).all() as Import[]
}

export function deleteImport(id: string): void {
  const db = getDb()
  const existing = db.select({ id: imports.id }).from(imports).where(eq(imports.id, id)).get()
  if (!existing) throw new AppError('NOT_FOUND', `import ${id} not found`)
  const sqlite = (db as any).session.client as import('better-sqlite3').Database
  sqlite.transaction(() => {
    db.delete(transactions).where(eq(transactions.importBatchId, id)).run()
    db.delete(imports).where(eq(imports.id, id)).run()
  })()
}
