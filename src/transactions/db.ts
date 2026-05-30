import { and, eq, gte, lte, like, inArray, sql, type SQL } from 'drizzle-orm'
import { ulid } from 'ulid'
import crypto from 'crypto'
import { getDb } from '../db'
import { transactions, categories, accounts } from '../schema/index'
import { AppError } from '../errors'
import { normalizeMerchant } from './merchant'
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
    merchant: normalizeMerchant(data.description),
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
  merchant?: string
  amount?: number
  amountIn?: number[]
  ids?: string[]
  limit?: number
}

function buildConditions(filters: ListFilters): SQL[] {
  const conditions: SQL[] = []
  if (filters.accountId) conditions.push(eq(transactions.accountId, filters.accountId))
  if (filters.categoryId) conditions.push(eq(transactions.categoryId, filters.categoryId))
  if (filters.from) conditions.push(gte(transactions.occurredAt, filters.from))
  if (filters.to) conditions.push(lte(transactions.occurredAt, filters.to))
  if (filters.statementPeriod)
    conditions.push(eq(transactions.statementPeriod, filters.statementPeriod))
  if (filters.importBatch) conditions.push(eq(transactions.importBatchId, filters.importBatch))
  if (filters.search) conditions.push(like(transactions.description, `%${filters.search}%`))
  if (filters.merchant !== undefined) conditions.push(eq(transactions.merchant, filters.merchant))
  if (filters.amount !== undefined) conditions.push(eq(transactions.amount, filters.amount))
  if (filters.amountIn && filters.amountIn.length)
    conditions.push(inArray(transactions.amount, filters.amountIn))
  if (filters.ids && filters.ids.length) conditions.push(inArray(transactions.id, filters.ids))
  return conditions
}

export function listTransactions(filters: ListFilters): Transaction[] {
  const db = getDb()
  const conditions = buildConditions(filters)

  let q = db.select().from(transactions)
  if (conditions.length) q = q.where(and(...conditions)) as typeof q
  if (filters.limit) q = q.limit(filters.limit) as typeof q

  return q.all().map(toTransaction)
}

export type AggregateDimension = 'merchant' | 'month' | 'category' | 'account'

export interface AggregateBucket {
  key: string
  total: number
  count: number
}

export interface TransactionStats {
  count: number
  sum: number
  min: number | null
  max: number | null
  firstDate: string | null
  lastDate: string | null
}

const UNCATEGORIZED = '(uncategorized)'
const UNKNOWN_MERCHANT = '(unknown)'

export function aggregateTransactions(
  filters: ListFilters,
  dimension: AggregateDimension,
): AggregateBucket[] {
  const db = getDb()
  const conditions = buildConditions(filters)
  const where = conditions.length ? and(...conditions) : undefined

  if (dimension === 'merchant') {
    // Group by the persisted merchant column (derived at insert/update time and
    // backfilled by migration). Rows whose description normalized to nothing
    // carry a null merchant and bucket under UNKNOWN_MERCHANT.
    const rows = db
      .select({
        merchant: transactions.merchant,
        total: sql<number>`sum(${transactions.amount})`,
        count: sql<number>`count(*)`,
      })
      .from(transactions)
      .where(where)
      .groupBy(transactions.merchant)
      .all()
    const buckets = rows.map((r) => ({
      key: r.merchant ?? UNKNOWN_MERCHANT,
      total: r.total,
      count: r.count,
    }))
    return sortBuckets(buckets, 'magnitude')
  }

  if (dimension === 'month') {
    const monthExpr = sql<string>`substr(${transactions.occurredAt}, 1, 7)`
    const rows = db
      .select({
        key: monthExpr,
        total: sql<number>`sum(${transactions.amount})`,
        count: sql<number>`count(*)`,
      })
      .from(transactions)
      .where(where)
      .groupBy(monthExpr)
      .all()
    return sortBuckets(rows, 'key')
  }

  // category | account: group by the foreign key, then resolve ids to names.
  const idColumn = dimension === 'category' ? transactions.categoryId : transactions.accountId
  const rows = db
    .select({
      id: idColumn,
      total: sql<number>`sum(${transactions.amount})`,
      count: sql<number>`count(*)`,
    })
    .from(transactions)
    .where(where)
    .groupBy(idColumn)
    .all()

  const names = new Map<string, string>()
  if (dimension === 'category') {
    for (const c of db.select({ id: categories.id, name: categories.name }).from(categories).all())
      names.set(c.id, c.name)
  } else {
    for (const a of db.select({ id: accounts.id, name: accounts.name }).from(accounts).all())
      names.set(a.id, a.name)
  }

  const buckets = rows.map((r) => ({
    key: r.id == null ? UNCATEGORIZED : (names.get(r.id) ?? r.id),
    total: r.total,
    count: r.count,
  }))
  return sortBuckets(buckets, 'magnitude')
}

function sortBuckets(buckets: AggregateBucket[], by: 'key' | 'magnitude'): AggregateBucket[] {
  if (by === 'key') return buckets.sort((a, b) => a.key.localeCompare(b.key))
  return buckets.sort((a, b) => Math.abs(b.total) - Math.abs(a.total) || a.key.localeCompare(b.key))
}

export function statsTransactions(filters: ListFilters): TransactionStats {
  const db = getDb()
  const conditions = buildConditions(filters)
  const where = conditions.length ? and(...conditions) : undefined
  const row = db
    .select({
      count: sql<number>`count(*)`,
      sum: sql<number>`coalesce(sum(${transactions.amount}), 0)`,
      min: sql<number | null>`min(${transactions.amount})`,
      max: sql<number | null>`max(${transactions.amount})`,
      firstDate: sql<string | null>`min(${transactions.occurredAt})`,
      lastDate: sql<string | null>`max(${transactions.occurredAt})`,
    })
    .from(transactions)
    .where(where)
    .get()
  return row ?? { count: 0, sum: 0, min: null, max: null, firstDate: null, lastDate: null }
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
  // Re-derive merchant whenever the source description changes.
  const merchant =
    data.description !== undefined ? { merchant: normalizeMerchant(data.description) } : {}
  db.update(transactions)
    .set({ ...data, ...merchant, updatedAt: Date.now() })
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

export interface CategorizeResult {
  dryRun: boolean
  categoryId: string
  matched: number
  skipped: number
  updated: number
  ids: string[]
  transactions: Transaction[]
}

/**
 * Bulk-set the category of every transaction matching `filters`. Transfer rows
 * are never mutated (mirroring updateTransaction's guard); they are excluded
 * from the update set and reported via `skipped`. When `dryRun` is true the DB
 * is left untouched and the matched-but-eligible rows are returned for preview.
 */
export function categorizeTransactions(
  filters: ListFilters,
  categoryId: string,
  dryRun: boolean,
): CategorizeResult {
  const db = getDb()
  const matched = listTransactions(filters)
  const eligible = matched.filter((t) => !t.transferId)
  const ids = eligible.map((t) => t.id)
  const skipped = matched.length - eligible.length

  if (!dryRun && ids.length) {
    db.transaction(() => {
      db.update(transactions)
        .set({ categoryId, updatedAt: Date.now() })
        .where(inArray(transactions.id, ids))
        .run()
    })
  }

  return {
    dryRun,
    categoryId,
    matched: matched.length,
    skipped,
    updated: dryRun ? 0 : ids.length,
    ids,
    transactions: dryRun ? eligible : listTransactions({ ids }),
  }
}

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
