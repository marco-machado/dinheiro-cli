import { and, eq, gte, lte, like } from 'drizzle-orm'
import { ulid } from 'ulid'
import crypto from 'crypto'
import { getDb, rawSqlite } from '../db'
import { transactions } from '../schema/index'
import { AppError } from '../errors'
import type { Transaction, TransactionInput } from './types'

export function computeRowHash(
  accountId: string,
  occurredAt: string,
  amount: number,
  description: string,
): string {
  return crypto
    .createHash('sha256')
    .update(`${accountId}|${occurredAt}|${amount}|${description}`)
    .digest('hex')
}

function toTransaction(row: Record<string, unknown>): Transaction {
  return row as unknown as Transaction
}

export function createTransaction(data: TransactionInput): Transaction {
  const db = getDb()
  const now = Date.now()
  const row = {
    id: ulid(),
    accountId: data.accountId,
    amount: data.amount,
    description: data.description,
    occurredAt: data.occurredAt,
    categoryId: data.categoryId ?? null,
    statementPeriod: data.statementPeriod ?? null,
    transferId: data.transferId ?? null,
    importBatchId: data.importBatchId ?? null,
    rowHash: data.rowHash ?? null,
    createdAt: now,
    updatedAt: now,
  }
  db.insert(transactions).values(row).run()
  return row
}

export function getTransaction(id: string): Transaction | undefined {
  const db = getDb()
  const row = db.select().from(transactions).where(eq(transactions.id, id)).get()
  return row ? toTransaction(row) : undefined
}

export interface ListFilters {
  accountId?: string
  categoryId?: string
  from?: string
  to?: string
  statementPeriod?: string
  importBatch?: string
  search?: string
  limit?: number
}

export function listTransactions(filters: ListFilters): Transaction[] {
  const db = getDb()
  const conditions = []
  if (filters.accountId) conditions.push(eq(transactions.accountId, filters.accountId))
  if (filters.categoryId) conditions.push(eq(transactions.categoryId, filters.categoryId))
  if (filters.from) conditions.push(gte(transactions.occurredAt, filters.from))
  if (filters.to) conditions.push(lte(transactions.occurredAt, filters.to))
  if (filters.statementPeriod)
    conditions.push(eq(transactions.statementPeriod, filters.statementPeriod))
  if (filters.importBatch) conditions.push(eq(transactions.importBatchId, filters.importBatch))
  if (filters.search) conditions.push(like(transactions.description, `%${filters.search}%`))

  let q = db.select().from(transactions)
  if (conditions.length) q = q.where(and(...conditions)) as typeof q
  if (filters.limit) q = q.limit(filters.limit) as typeof q

  return q.all().map(toTransaction)
}

export function updateTransaction(
  id: string,
  data: {
    amount?: number
    description?: string
    categoryId?: string
    occurredAt?: string
    statementPeriod?: string
  },
): Transaction {
  const db = getDb()
  const existing = getTransaction(id)
  if (!existing) throw new AppError('NOT_FOUND', `transaction ${id} not found`)
  if (existing.transferId)
    throw new AppError('CONFLICT', 'cannot update a transfer row directly; use transfers delete')
  db.update(transactions)
    .set({ ...data, updatedAt: Date.now() })
    .where(eq(transactions.id, id))
    .run()
  return getTransaction(id)!
}

export function deleteTransaction(id: string): void {
  const db = getDb()
  const existing = getTransaction(id)
  if (!existing) throw new AppError('NOT_FOUND', `transaction ${id} not found`)
  if (existing.transferId)
    throw new AppError('CONFLICT', 'cannot delete a transfer row directly; use transfers delete')
  db.delete(transactions).where(eq(transactions.id, id)).run()
}

export function batchCreateTransactions(rows: TransactionInput[]): {
  inserted: number
  skipped: number
} {
  const db = getDb()
  let inserted = 0
  let skipped = 0

  const sqlite = rawSqlite(db)

  const runBatch = sqlite.transaction(() => {
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

  runBatch()
  return { inserted, skipped }
}
