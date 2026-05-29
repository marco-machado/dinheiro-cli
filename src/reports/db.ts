import { and, eq, like } from 'drizzle-orm'
import { getDb } from '../db'
import { transactions, categories } from '../schema/index'
import type { MonthlyReport } from './types'
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

export function getStatementReport(accountId: string, period: string): Transaction[] {
  const db = getDb()
  return db
    .select()
    .from(transactions)
    .where(and(eq(transactions.accountId, accountId), eq(transactions.statementPeriod, period)))
    .all() as Transaction[]
}
