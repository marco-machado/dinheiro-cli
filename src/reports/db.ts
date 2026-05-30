import { and, eq, gte, lte, like, sql, type SQL } from 'drizzle-orm'
import { getDb } from '../db'
import { transactions, categories } from '../schema/index'
import { resolveCategory } from '../categories/db'
import { normalizeMerchant } from '../transactions/db'
import type {
  MonthlyReport,
  CategoryReport,
  MerchantReport,
  MonthBucket,
  MerchantBucket,
} from './types'
import type { Transaction } from '../transactions/types'

export function getMonthlyReport(month: string, accountId?: string): MonthlyReport {
  const db = getDb()
  const conditions = [like(transactions.occurredAt, `${month}-%`)]
  if (accountId) conditions.push(eq(transactions.accountId, accountId))

  const rows = db
    .select({
      amount: transactions.amount,
      transferId: transactions.transferId,
      categoryId: transactions.categoryId,
    })
    .from(transactions)
    .where(and(...conditions))
    .all()

  const nonTransfer = rows.filter((r) => !r.transferId)
  const transferRows = rows.filter((r) => !!r.transferId)

  const incomeTotal = nonTransfer.filter((r) => r.amount > 0).reduce((s, r) => s + r.amount, 0)
  const expenseTotal = nonTransfer.filter((r) => r.amount < 0).reduce((s, r) => s + r.amount, 0)
  const transfersOut = transferRows
    .filter((r) => r.amount < 0)
    .reduce((s, r) => s + Math.abs(r.amount), 0)
  const transfersIn = transferRows.filter((r) => r.amount > 0).reduce((s, r) => s + r.amount, 0)
  const net = incomeTotal + expenseTotal

  // Category breakdown (expenses only, grouped)
  const catMap = new Map<string, number>()
  for (const r of nonTransfer.filter((r) => r.amount < 0 && r.categoryId)) {
    catMap.set(r.categoryId!, (catMap.get(r.categoryId!) ?? 0) + r.amount)
  }

  // Fetch category names
  const catNames = new Map<string, string>()
  const allCats = db.select({ id: categories.id, name: categories.name }).from(categories).all()
  for (const c of allCats) catNames.set(c.id, c.name)

  const totalExpense = Math.abs(expenseTotal) || 1
  const byCategory = Array.from(catMap.entries()).map(([id, total]) => ({
    category: catNames.get(id) ?? id,
    total,
    pct: Math.round((Math.abs(total) / totalExpense) * 100 * 10) / 10,
  }))

  return { month, incomeTotal, expenseTotal, net, transfersOut, transfersIn, byCategory }
}

// occurredAt is YYYY-MM-DD; --from/--to are YYYY-MM month bounds (inclusive).
// from clamps to the first day of the month, to clamps to the last possible day.
function monthRangeConditions(from?: string, to?: string): SQL[] {
  const conditions: SQL[] = []
  if (from) conditions.push(gte(transactions.occurredAt, `${from}-01`))
  if (to) conditions.push(lte(transactions.occurredAt, `${to}-31`))
  return conditions
}

interface CategoryReportRow {
  occurredAt: string
  amount: number
  description: string
}

function bucketByMonth(rows: CategoryReportRow[]): MonthBucket[] {
  const map = new Map<string, MonthBucket>()
  for (const r of rows) {
    const month = r.occurredAt.slice(0, 7)
    const cur = map.get(month) ?? { month, total: 0, count: 0 }
    cur.total += r.amount
    cur.count += 1
    map.set(month, cur)
  }
  return Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month))
}

function bucketByMerchant(rows: CategoryReportRow[]): MerchantBucket[] {
  const map = new Map<string, MerchantBucket>()
  for (const r of rows) {
    const merchant = normalizeMerchant(r.description)
    const cur = map.get(merchant) ?? { merchant, total: 0, count: 0 }
    cur.total += r.amount
    cur.count += 1
    map.set(merchant, cur)
  }
  return Array.from(map.values()).sort((a, b) => Math.abs(b.total) - Math.abs(a.total))
}

export function getCategoryReport(
  categoryValue: string,
  from?: string,
  to?: string,
): CategoryReport {
  const db = getDb()
  const category = resolveCategory(categoryValue)

  const conditions = [eq(transactions.categoryId, category.id), ...monthRangeConditions(from, to)]
  const rows = db
    .select({
      occurredAt: transactions.occurredAt,
      amount: transactions.amount,
      description: transactions.description,
    })
    .from(transactions)
    .where(and(...conditions))
    .all()

  const total = rows.reduce((s, r) => s + r.amount, 0)

  return {
    category: category.name,
    from: from ?? null,
    to: to ?? null,
    total,
    count: rows.length,
    byMonth: bucketByMonth(rows),
    byMerchant: bucketByMerchant(rows),
  }
}

export function getMerchantReport(search: string, from?: string, to?: string): MerchantReport {
  const db = getDb()

  const conditions = [
    like(sql`lower(${transactions.description})`, `%${search.toLowerCase()}%`),
    ...monthRangeConditions(from, to),
  ]
  const rows = db
    .select({
      occurredAt: transactions.occurredAt,
      amount: transactions.amount,
      description: transactions.description,
    })
    .from(transactions)
    .where(and(...conditions))
    .all()

  const total = rows.reduce((s, r) => s + r.amount, 0)

  return {
    search,
    from: from ?? null,
    to: to ?? null,
    total,
    count: rows.length,
    byMonth: bucketByMonth(rows),
    byMerchant: bucketByMerchant(rows),
  }
}

export function getStatementReport(accountId: string, period: string): Transaction[] {
  const db = getDb()
  return db
    .select()
    .from(transactions)
    .where(and(eq(transactions.accountId, accountId), eq(transactions.statementPeriod, period)))
    .all() as Transaction[]
}
