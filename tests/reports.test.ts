import { describe, it, expect, beforeEach } from 'vitest'
import { setupTestDb } from './helpers'
import { createAccount } from '../src/accounts/db'
import { createCategory } from '../src/categories/db'
import { createTransaction } from '../src/transactions/db'
import { createTransfer } from '../src/transfers/db'
import { getMonthlyReport, getStatementReport } from '../src/reports/db'

let accountId: string
let cardId: string
let foodId: string
let transportId: string

beforeEach(() => {
  setupTestDb()
  accountId = createAccount({ name: 'Checking', type: 'checking' }).id
  cardId = createAccount({ name: 'CC', type: 'credit_card', closeDay: 25, dueDay: 5 }).id
  foodId = createCategory({ name: 'food' }).id
  transportId = createCategory({ name: 'transport' }).id
})

describe('reports monthly', () => {
  it('returns zero totals for empty month', () => {
    const r = getMonthlyReport('2026-05')
    expect(r.income_total).toBe(0)
    expect(r.expense_total).toBe(0)
    expect(r.net).toBe(0)
  })

  it('sums income and expenses correctly', () => {
    createTransaction({ accountId, amount: 100000, description: 'salary', occurredAt: '2026-05-01', categoryId: foodId })
    createTransaction({ accountId, amount: -4200, description: 'lunch', occurredAt: '2026-05-02', categoryId: foodId })
    createTransaction({ accountId, amount: -2000, description: 'bus', occurredAt: '2026-05-03', categoryId: transportId })
    const r = getMonthlyReport('2026-05')
    expect(r.income_total).toBe(100000)
    expect(r.expense_total).toBe(-6200)
    expect(r.net).toBe(93800)
  })

  it('excludes transfers from income/expense but shows them separately', () => {
    createTransfer({ fromAccountId: accountId, toAccountId: cardId, amount: 50000, occurredAt: '2026-05-10' })
    const r = getMonthlyReport('2026-05', accountId)
    expect(r.income_total).toBe(0)
    expect(r.expense_total).toBe(0)
    expect(r.transfers_out).toBe(50000)
    expect(r.transfers_in).toBe(0)
  })

  it('filters by account', () => {
    createTransaction({ accountId, amount: -1000, description: 'a', occurredAt: '2026-05-01', categoryId: foodId })
    const other = createAccount({ name: 'Other', type: 'checking' }).id
    createTransaction({ accountId: other, amount: -5000, description: 'b', occurredAt: '2026-05-01', categoryId: foodId })
    const r = getMonthlyReport('2026-05', accountId)
    expect(r.expense_total).toBe(-1000)
  })

  it('returns category breakdown with percentages', () => {
    createTransaction({ accountId, amount: -4000, description: 'lunch', occurredAt: '2026-05-01', categoryId: foodId })
    createTransaction({ accountId, amount: -1000, description: 'bus', occurredAt: '2026-05-01', categoryId: transportId })
    const r = getMonthlyReport('2026-05')
    expect(r.by_category).toHaveLength(2)
    const food = r.by_category.find(c => c.category === 'food')!
    expect(food.total).toBe(-4000)
    expect(food.pct).toBeCloseTo(80, 0)
  })
})

describe('reports statement', () => {
  it('returns transactions for a statement period', () => {
    createTransaction({ accountId: cardId, amount: -4200, description: 'iFood', occurredAt: '2026-05-10', categoryId: foodId, statementPeriod: '2026-05' })
    createTransaction({ accountId: cardId, amount: -2000, description: 'Uber', occurredAt: '2026-04-28', categoryId: transportId, statementPeriod: '2026-04' })
    const rows = getStatementReport(cardId, '2026-05')
    expect(rows).toHaveLength(1)
    expect(rows[0].description).toBe('iFood')
  })
})
