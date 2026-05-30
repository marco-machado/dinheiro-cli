import { describe, it, expect, beforeEach } from 'vitest'
import { setupTestDb } from './helpers'
import { createAccount } from '../src/accounts/db'
import { createCategory, deleteCategory } from '../src/categories/db'
import {
  createTransaction,
  getTransaction,
  listTransactions,
  updateTransaction,
  deleteTransaction,
  batchCreateTransactions,
  categorizeTransactions,
  computeRowHash,
} from '../src/transactions/db'
import { AppError } from '../src/errors'

let accountId: string
let categoryId: string

beforeEach(() => {
  setupTestDb()
  accountId = createAccount({ name: 'NuConta', type: 'checking' }).id
  categoryId = createCategory({ name: 'food' }).id
})

describe('transactions', () => {
  it('creates a transaction', () => {
    const t = createTransaction({
      accountId,
      amount: -4200,
      description: 'lunch',
      occurredAt: '2026-05-01',
      categoryId,
    })
    expect(t.id).toBeTruthy()
    expect(t.amount).toBe(-4200)
    expect(t.occurredAt).toBe('2026-05-01')
  })

  it('gets a transaction by id', () => {
    const t = createTransaction({
      accountId,
      amount: -100,
      description: 'x',
      occurredAt: '2026-05-01',
      categoryId,
    })
    expect(getTransaction(t.id)?.id).toBe(t.id)
  })

  it('returns undefined for unknown id', () => {
    expect(getTransaction('none')).toBeUndefined()
  })

  it('lists all transactions', () => {
    createTransaction({
      accountId,
      amount: -100,
      description: 'a',
      occurredAt: '2026-05-01',
      categoryId,
    })
    createTransaction({
      accountId,
      amount: -200,
      description: 'b',
      occurredAt: '2026-05-02',
      categoryId,
    })
    expect(listTransactions({})).toHaveLength(2)
  })

  it('filters by account', () => {
    const other = createAccount({ name: 'Other', type: 'checking' })
    createTransaction({
      accountId,
      amount: -100,
      description: 'a',
      occurredAt: '2026-05-01',
      categoryId,
    })
    createTransaction({
      accountId: other.id,
      amount: -200,
      description: 'b',
      occurredAt: '2026-05-01',
      categoryId,
    })
    expect(listTransactions({ accountId })).toHaveLength(1)
  })

  it('filters by date range', () => {
    createTransaction({
      accountId,
      amount: -100,
      description: 'a',
      occurredAt: '2026-05-01',
      categoryId,
    })
    createTransaction({
      accountId,
      amount: -200,
      description: 'b',
      occurredAt: '2026-06-01',
      categoryId,
    })
    expect(listTransactions({ from: '2026-05-01', to: '2026-05-31' })).toHaveLength(1)
  })

  it('filters by search text', () => {
    createTransaction({
      accountId,
      amount: -100,
      description: 'iFood dinner',
      occurredAt: '2026-05-01',
      categoryId,
    })
    createTransaction({
      accountId,
      amount: -200,
      description: 'Uber',
      occurredAt: '2026-05-01',
      categoryId,
    })
    expect(listTransactions({ search: 'ifood' })).toHaveLength(1)
  })

  it('updates transaction', () => {
    const t = createTransaction({
      accountId,
      amount: -100,
      description: 'old',
      occurredAt: '2026-05-01',
      categoryId,
    })
    const updated = updateTransaction(t.id, { description: 'new' })
    expect(updated.description).toBe('new')
  })

  it('throws CONFLICT when updating a transfer row', () => {
    const t = createTransaction({
      accountId,
      amount: -100,
      description: 'x',
      occurredAt: '2026-05-01',
      transferId: 'abc',
    })
    expect(() => updateTransaction(t.id, { description: 'y' })).toThrow(AppError)
  })

  it('deletes a transaction', () => {
    const t = createTransaction({
      accountId,
      amount: -100,
      description: 'x',
      occurredAt: '2026-05-01',
      categoryId,
    })
    deleteTransaction(t.id)
    expect(getTransaction(t.id)).toBeUndefined()
  })

  it('throws CONFLICT when deleting a transfer row', () => {
    const t = createTransaction({
      accountId,
      amount: -100,
      description: 'x',
      occurredAt: '2026-05-01',
      transferId: 'abc',
    })
    expect(() => deleteTransaction(t.id)).toThrow(AppError)
  })

  it('batch creates transactions atomically', () => {
    const rows = [
      { accountId, amount: -100, description: 'a', occurredAt: '2026-05-01', categoryId },
      { accountId, amount: -200, description: 'b', occurredAt: '2026-05-02', categoryId },
    ]
    const result = batchCreateTransactions(rows)
    expect(result.inserted).toBe(2)
    expect(result.skipped).toBe(0)
    expect(listTransactions({})).toHaveLength(2)
  })

  it('batch-create skips duplicate row_hash', () => {
    const row = { accountId, amount: -100, description: 'a', occurredAt: '2026-05-01', categoryId }
    batchCreateTransactions([row])
    const result = batchCreateTransactions([row])
    expect(result.inserted).toBe(0)
    expect(result.skipped).toBe(1)
  })

  it('computeRowHash returns consistent sha256', () => {
    const h1 = computeRowHash('acc1', '2026-05-01', -100, 'lunch')
    const h2 = computeRowHash('acc1', '2026-05-01', -100, 'lunch')
    expect(h1).toBe(h2)
    expect(h1).toHaveLength(64)
  })

  it('filters by exact amount', () => {
    createTransaction({
      accountId,
      amount: -100,
      description: 'a',
      occurredAt: '2026-05-01',
      categoryId,
    })
    createTransaction({
      accountId,
      amount: -200,
      description: 'b',
      occurredAt: '2026-05-01',
      categoryId,
    })
    expect(listTransactions({ amount: -100 })).toHaveLength(1)
  })

  it('filters by amountIn list', () => {
    createTransaction({
      accountId,
      amount: -100,
      description: 'a',
      occurredAt: '2026-05-01',
      categoryId,
    })
    createTransaction({
      accountId,
      amount: -200,
      description: 'b',
      occurredAt: '2026-05-01',
      categoryId,
    })
    createTransaction({
      accountId,
      amount: -300,
      description: 'c',
      occurredAt: '2026-05-01',
      categoryId,
    })
    expect(listTransactions({ amountIn: [-100, -300] })).toHaveLength(2)
  })

  it('filters by ids list', () => {
    const a = createTransaction({
      accountId,
      amount: -100,
      description: 'a',
      occurredAt: '2026-05-01',
      categoryId,
    })
    createTransaction({
      accountId,
      amount: -200,
      description: 'b',
      occurredAt: '2026-05-01',
      categoryId,
    })
    expect(listTransactions({ ids: [a.id] })).toHaveLength(1)
  })

  describe('categorize', () => {
    let target: string
    beforeEach(() => {
      target = createCategory({ name: 'games' }).id
    })

    it('bulk-updates the matched set and returns counts', () => {
      createTransaction({
        accountId,
        amount: -100,
        description: 'PAGGO one',
        occurredAt: '2026-05-01',
        categoryId,
      })
      createTransaction({
        accountId,
        amount: -200,
        description: 'PAGGO two',
        occurredAt: '2026-05-02',
        categoryId,
      })
      createTransaction({
        accountId,
        amount: -300,
        description: 'Uber',
        occurredAt: '2026-05-03',
        categoryId,
      })

      const res = categorizeTransactions({ search: 'PAGGO' }, target, false)
      expect(res.matched).toBe(2)
      expect(res.updated).toBe(2)
      expect(res.skipped).toBe(0)
      expect(res.ids).toHaveLength(2)
      expect(listTransactions({ categoryId: target })).toHaveLength(2)
    })

    it('dry-run does not mutate', () => {
      createTransaction({
        accountId,
        amount: -100,
        description: 'PAGGO one',
        occurredAt: '2026-05-01',
        categoryId,
      })
      const res = categorizeTransactions({ search: 'PAGGO' }, target, true)
      expect(res.dryRun).toBe(true)
      expect(res.updated).toBe(0)
      expect(res.transactions).toHaveLength(1)
      expect(listTransactions({ categoryId: target })).toHaveLength(0)
    })

    it('skips transfer rows', () => {
      createTransaction({
        accountId,
        amount: -100,
        description: 'PAGGO real',
        occurredAt: '2026-05-01',
        categoryId,
      })
      createTransaction({
        accountId,
        amount: -200,
        description: 'PAGGO transfer',
        occurredAt: '2026-05-02',
        transferId: 'xfer1',
      })
      const res = categorizeTransactions({ search: 'PAGGO' }, target, false)
      expect(res.matched).toBe(2)
      expect(res.updated).toBe(1)
      expect(res.skipped).toBe(1)
      expect(listTransactions({ categoryId: target })).toHaveLength(1)
    })

    it('categorizes by amountIn for in-app-purchase tiers', () => {
      createTransaction({
        accountId,
        amount: -990,
        description: 'IAP',
        occurredAt: '2026-05-01',
        categoryId,
      })
      createTransaction({
        accountId,
        amount: -1990,
        description: 'IAP',
        occurredAt: '2026-05-02',
        categoryId,
      })
      createTransaction({
        accountId,
        amount: -5000,
        description: 'Groceries',
        occurredAt: '2026-05-03',
        categoryId,
      })
      const res = categorizeTransactions({ amountIn: [-990, -1990] }, target, false)
      expect(res.updated).toBe(2)
    })

    it('categorizes by explicit ids', () => {
      const a = createTransaction({
        accountId,
        amount: -100,
        description: 'a',
        occurredAt: '2026-05-01',
        categoryId,
      })
      createTransaction({
        accountId,
        amount: -200,
        description: 'b',
        occurredAt: '2026-05-02',
        categoryId,
      })
      const res = categorizeTransactions({ ids: [a.id] }, target, false)
      expect(res.updated).toBe(1)
      expect(getTransaction(a.id)?.categoryId).toBe(target)
    })
  })

  it('deleting a category with associated transactions throws CONFLICT', () => {
    createTransaction({
      accountId,
      amount: -1000,
      description: 'lunch',
      occurredAt: '2026-05-01',
      categoryId,
    })
    expect(() => deleteCategory(categoryId)).toThrow(AppError)
  })
})
