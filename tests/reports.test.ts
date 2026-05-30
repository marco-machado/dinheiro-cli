import { describe, it, expect, beforeEach } from 'vitest'
import { setupTestDb } from './helpers'
import { createAccount } from '../src/accounts/db'
import { createCategory } from '../src/categories/db'
import { createTransaction } from '../src/transactions/db'
import { createTransfer } from '../src/transfers/db'
import { AppError } from '../src/errors'
import {
  getMonthlyReport,
  getStatementReport,
  getCategoryReport,
  getMerchantReport,
} from '../src/reports/db'

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
    expect(r.incomeTotal).toBe(0)
    expect(r.expenseTotal).toBe(0)
    expect(r.net).toBe(0)
  })

  it('sums income and expenses correctly', () => {
    createTransaction({
      accountId,
      amount: 100000,
      description: 'salary',
      occurredAt: '2026-05-01',
      categoryId: foodId,
    })
    createTransaction({
      accountId,
      amount: -4200,
      description: 'lunch',
      occurredAt: '2026-05-02',
      categoryId: foodId,
    })
    createTransaction({
      accountId,
      amount: -2000,
      description: 'bus',
      occurredAt: '2026-05-03',
      categoryId: transportId,
    })
    const r = getMonthlyReport('2026-05')
    expect(r.incomeTotal).toBe(100000)
    expect(r.expenseTotal).toBe(-6200)
    expect(r.net).toBe(93800)
  })

  it('excludes transfers from income/expense but shows them separately', () => {
    createTransfer({
      fromAccountId: accountId,
      toAccountId: cardId,
      amount: 50000,
      occurredAt: '2026-05-10',
    })
    const r = getMonthlyReport('2026-05', accountId)
    expect(r.incomeTotal).toBe(0)
    expect(r.expenseTotal).toBe(0)
    expect(r.transfersOut).toBe(50000)
    expect(r.transfersIn).toBe(0)
  })

  it('filters by account', () => {
    createTransaction({
      accountId,
      amount: -1000,
      description: 'a',
      occurredAt: '2026-05-01',
      categoryId: foodId,
    })
    const other = createAccount({ name: 'Other', type: 'checking' }).id
    createTransaction({
      accountId: other,
      amount: -5000,
      description: 'b',
      occurredAt: '2026-05-01',
      categoryId: foodId,
    })
    const r = getMonthlyReport('2026-05', accountId)
    expect(r.expenseTotal).toBe(-1000)
  })

  it('returns category breakdown with percentages', () => {
    createTransaction({
      accountId,
      amount: -4000,
      description: 'lunch',
      occurredAt: '2026-05-01',
      categoryId: foodId,
    })
    createTransaction({
      accountId,
      amount: -1000,
      description: 'bus',
      occurredAt: '2026-05-01',
      categoryId: transportId,
    })
    const r = getMonthlyReport('2026-05')
    expect(r.byCategory).toHaveLength(2)
    const food = r.byCategory.find((c) => c.category === 'food')!
    expect(food.total).toBe(-4000)
    expect(food.pct).toBeCloseTo(80, 0)
  })
})

describe('reports category', () => {
  it('groups one category by month and merchant across a range', () => {
    createTransaction({
      accountId,
      amount: -10000,
      description: 'Spotify',
      occurredAt: '2025-12-05',
      categoryId: foodId,
    })
    createTransaction({
      accountId,
      amount: -10000,
      description: 'Spotify',
      occurredAt: '2026-01-05',
      categoryId: foodId,
    })
    createTransaction({
      accountId,
      amount: -5000,
      description: 'Netflix',
      occurredAt: '2026-01-10',
      categoryId: foodId,
    })
    // out of range and other category should be excluded
    createTransaction({
      accountId,
      amount: -9999,
      description: 'Spotify',
      occurredAt: '2026-03-05',
      categoryId: foodId,
    })
    createTransaction({
      accountId,
      amount: -7777,
      description: 'bus',
      occurredAt: '2026-01-15',
      categoryId: transportId,
    })

    const r = getCategoryReport('food', '2025-12', '2026-02')
    expect(r.category).toBe('food')
    expect(r.from).toBe('2025-12')
    expect(r.to).toBe('2026-02')
    expect(r.total).toBe(-25000)
    expect(r.count).toBe(3)

    expect(r.byMonth).toEqual([
      { month: '2025-12', total: -10000, count: 1 },
      { month: '2026-01', total: -15000, count: 2 },
    ])

    expect(r.byMerchant).toEqual([
      { merchant: 'Spotify', total: -20000, count: 2 },
      { merchant: 'Netflix', total: -5000, count: 1 },
    ])
  })

  it('resolves the category by id', () => {
    createTransaction({
      accountId,
      amount: -3000,
      description: 'lunch',
      occurredAt: '2026-05-01',
      categoryId: foodId,
    })
    const r = getCategoryReport(foodId)
    expect(r.category).toBe('food')
    expect(r.total).toBe(-3000)
    expect(r.from).toBeNull()
    expect(r.to).toBeNull()
  })

  it('throws NOT_FOUND for an unknown category', () => {
    try {
      getCategoryReport('nope')
      throw new Error('expected getCategoryReport to throw')
    } catch (err) {
      expect(err).toBeInstanceOf(AppError)
      expect((err as AppError).code).toBe('NOT_FOUND')
    }
  })
})

describe('reports merchant', () => {
  it('matches a merchant pattern case-insensitively and groups it', () => {
    createTransaction({
      accountId,
      amount: -10000,
      description: 'APPLE.COM/BILL',
      occurredAt: '2025-12-05',
      categoryId: foodId,
    })
    createTransaction({
      accountId,
      amount: -20000,
      description: 'Apple.com/Bill - Parcela 1/3',
      occurredAt: '2026-01-05',
      categoryId: foodId,
    })
    createTransaction({
      accountId,
      amount: -5000,
      description: 'Spotify',
      occurredAt: '2026-01-10',
      categoryId: foodId,
    })

    const r = getMerchantReport('apple', '2025-12', '2026-02')
    expect(r.search).toBe('apple')
    expect(r.total).toBe(-30000)
    expect(r.count).toBe(2)
    expect(r.byMonth).toEqual([
      { month: '2025-12', total: -10000, count: 1 },
      { month: '2026-01', total: -20000, count: 1 },
    ])
    // installment suffix is stripped so both rows collapse to one merchant
    expect(r.byMerchant).toEqual([{ merchant: 'Apple.Com/Bill', total: -30000, count: 2 }])
  })

  it('returns zero totals when nothing matches', () => {
    const r = getMerchantReport('ghost')
    expect(r.total).toBe(0)
    expect(r.count).toBe(0)
    expect(r.byMonth).toEqual([])
    expect(r.byMerchant).toEqual([])
  })
})

describe('reports statement', () => {
  it('returns transactions for a statement period', () => {
    createTransaction({
      accountId: cardId,
      amount: -4200,
      description: 'iFood',
      occurredAt: '2026-05-10',
      categoryId: foodId,
      statementPeriod: '2026-05',
    })
    createTransaction({
      accountId: cardId,
      amount: -2000,
      description: 'Uber',
      occurredAt: '2026-04-28',
      categoryId: transportId,
      statementPeriod: '2026-04',
    })
    const rows = getStatementReport(cardId, '2026-05')
    expect(rows).toHaveLength(1)
    expect(rows[0].description).toBe('iFood')
  })
})
