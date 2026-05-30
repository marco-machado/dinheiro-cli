import { describe, it, expect, beforeEach } from 'vitest'
import { setupTestDb } from './helpers'
import { createAccount } from '../src/accounts/db'
import { createCategory, deleteCategory } from '../src/categories/db'
import {
  createTransaction,
  getTransaction,
  listTransactions,
  aggregateTransactions,
  statsTransactions,
  updateTransaction,
  deleteTransaction,
  batchCreateTransactions,
  categorizeTransactions,
  computeRowHash,
} from '../src/transactions/db'
import { normalizeMerchant, backfillMerchants } from '../src/transactions/merchant'
import { getDb } from '../src/db'
import { transactions } from '../src/schema/index'
import { eq } from 'drizzle-orm'
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

describe('normalizeMerchant', () => {
  it('strips installment suffixes', () => {
    expect(normalizeMerchant('Amazon - Parcela 3/12')).toBe('Amazon')
    expect(normalizeMerchant('Loja X - parcela 1 / 6')).toBe('Loja X')
  })

  it('strips dedup suffixes', () => {
    expect(normalizeMerchant('Netflix #2')).toBe('Netflix')
    expect(normalizeMerchant('Netflix #10')).toBe('Netflix')
  })

  it('Title-Cases and trims', () => {
    expect(normalizeMerchant('  netflix  ')).toBe('Netflix')
    expect(normalizeMerchant('UBER EATS')).toBe('Uber Eats')
  })

  it('Title-Cases accented (Portuguese) words correctly', () => {
    expect(normalizeMerchant('PÃO DE AÇÚCAR')).toBe('Pão De Açúcar')
    expect(normalizeMerchant('lojas americanas')).toBe('Lojas Americanas')
  })

  it('collapses installment + dedup variants to one merchant', () => {
    expect(normalizeMerchant('Uber - Parcela 1/3')).toBe(normalizeMerchant('UBER #2'))
  })

  it('strips both suffixes regardless of order', () => {
    expect(normalizeMerchant('Amazon - Parcela 1/3 #2')).toBe('Amazon')
    expect(normalizeMerchant('Amazon #2 - Parcela 1/3')).toBe('Amazon')
  })

  it('strips the Nubank PIX prefix and document tail', () => {
    expect(
      normalizeMerchant('Transferência enviada pelo Pix - Fulano de Tal - 123.456.789-09'),
    ).toBe('Fulano De Tal')
    expect(
      normalizeMerchant('Transferência enviada pelo Pix - Padaria Pao 12.345.678/0001-90'),
    ).toBe('Padaria Pao')
  })

  it('strips the boleto and estorno prefixes', () => {
    expect(normalizeMerchant('Pagamento de boleto efetuado - Enel Sp')).toBe('Enel Sp')
    expect(normalizeMerchant('Estorno - Amazon')).toBe('Amazon')
  })

  it('strips the débito prefix', () => {
    expect(normalizeMerchant('Compra no débito - APPLECOMBILL')).toBe('Apple.Com/Bill')
  })

  it('applies the Apple alias to brand variants', () => {
    expect(normalizeMerchant('Apple.Com/Bill')).toBe('Apple.Com/Bill')
    expect(normalizeMerchant('Applecombill')).toBe('Apple.Com/Bill')
    expect(normalizeMerchant('APPLECOMBILL')).toBe('Apple.Com/Bill')
    expect(normalizeMerchant('Apple.Com/Bill #3')).toBe('Apple.Com/Bill')
  })

  it('applies the Spotify alias regardless of separator spacing', () => {
    expect(normalizeMerchant('Dm*Spotify')).toBe('Spotify')
    expect(normalizeMerchant('Dm *Spotify')).toBe('Spotify')
  })

  it('returns null for empty or all-noise descriptions', () => {
    expect(normalizeMerchant('   ')).toBeNull()
    expect(normalizeMerchant('Estorno - ')).toBeNull()
  })
})

describe('merchant column', () => {
  it('derives merchant from description on create', () => {
    const t = createTransaction({
      accountId,
      amount: -1000,
      description: 'APPLECOMBILL #2',
      occurredAt: '2026-05-01',
      categoryId,
    })
    expect(t.merchant).toBe('Apple.Com/Bill')
    expect(getTransaction(t.id)?.merchant).toBe('Apple.Com/Bill')
  })

  it('stores null merchant for an all-noise description', () => {
    const t = createTransaction({
      accountId,
      amount: -1000,
      description: 'Estorno - ',
      occurredAt: '2026-05-01',
      categoryId,
    })
    expect(t.merchant).toBeNull()
  })

  it('re-derives merchant when description is updated', () => {
    const t = createTransaction({
      accountId,
      amount: -1000,
      description: 'Netflix',
      occurredAt: '2026-05-01',
      categoryId,
    })
    expect(t.merchant).toBe('Netflix')
    const updated = updateTransaction(t.id, { description: 'Dm*Spotify' })
    expect(updated.merchant).toBe('Spotify')
  })

  it('leaves merchant untouched when description is not updated', () => {
    const t = createTransaction({
      accountId,
      amount: -1000,
      description: 'Netflix',
      occurredAt: '2026-05-01',
      categoryId,
    })
    const updated = updateTransaction(t.id, { amount: -2000 })
    expect(updated.merchant).toBe('Netflix')
  })

  it('filters by exact merchant match', () => {
    createTransaction({
      accountId,
      amount: -1000,
      description: 'APPLECOMBILL',
      occurredAt: '2026-05-01',
      categoryId,
    })
    createTransaction({
      accountId,
      amount: -2000,
      description: 'Netflix',
      occurredAt: '2026-05-02',
      categoryId,
    })
    const rows = listTransactions({ merchant: 'Apple.Com/Bill' })
    expect(rows).toHaveLength(1)
    expect(rows[0].description).toBe('APPLECOMBILL')
    // Exact match: the raw description substring does not match the merchant.
    expect(listTransactions({ merchant: 'apple' })).toHaveLength(0)
  })

  it('drills into null merchants via --merchant (unknown)', () => {
    createTransaction({
      accountId,
      amount: -1000,
      description: 'Netflix',
      occurredAt: '2026-05-01',
      categoryId,
    })
    const blank = createTransaction({
      accountId,
      amount: -2000,
      description: 'Estorno - ',
      occurredAt: '2026-05-02',
      categoryId,
    })
    expect(blank.merchant).toBeNull()
    const rows = listTransactions({ merchant: '(unknown)' })
    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe(blank.id)
  })

  it('backfills merchant for rows whose column is null', () => {
    const t = createTransaction({
      accountId,
      amount: -1000,
      description: 'APPLECOMBILL',
      occurredAt: '2026-05-01',
      categoryId,
    })
    // Simulate a pre-migration row: clear the merchant the insert derived.
    const db = getDb()
    db.update(transactions).set({ merchant: null }).where(eq(transactions.id, t.id)).run()
    expect(getTransaction(t.id)?.merchant).toBeNull()

    backfillMerchants(db)
    expect(getTransaction(t.id)?.merchant).toBe('Apple.Com/Bill')
  })

  it('buckets null merchants under (unknown) when aggregating', () => {
    createTransaction({
      accountId,
      amount: -1000,
      description: 'Estorno - ',
      occurredAt: '2026-05-01',
      categoryId,
    })
    const buckets = aggregateTransactions({}, 'merchant')
    expect(buckets).toEqual([{ key: '(unknown)', total: -1000, count: 1 }])
  })
})

describe('aggregateTransactions', () => {
  it('groups by merchant, normalizing descriptions', () => {
    createTransaction({
      accountId,
      amount: -1000,
      description: 'Amazon - Parcela 1/3',
      occurredAt: '2026-05-01',
      categoryId,
    })
    createTransaction({
      accountId,
      amount: -2000,
      description: 'Amazon #2',
      occurredAt: '2026-05-02',
      categoryId,
    })
    createTransaction({
      accountId,
      amount: -500,
      description: 'Netflix',
      occurredAt: '2026-05-03',
      categoryId,
    })
    const buckets = aggregateTransactions({}, 'merchant')
    // Sorted by absolute total descending: Amazon (3000) before Netflix (500).
    expect(buckets).toEqual([
      { key: 'Amazon', total: -3000, count: 2 },
      { key: 'Netflix', total: -500, count: 1 },
    ])
  })

  it('groups by month (chronological)', () => {
    createTransaction({
      accountId,
      amount: -100,
      description: 'a',
      occurredAt: '2026-04-15',
      categoryId,
    })
    createTransaction({
      accountId,
      amount: -200,
      description: 'b',
      occurredAt: '2026-05-10',
      categoryId,
    })
    createTransaction({
      accountId,
      amount: -300,
      description: 'c',
      occurredAt: '2026-05-20',
      categoryId,
    })
    expect(aggregateTransactions({}, 'month')).toEqual([
      { key: '2026-04', total: -100, count: 1 },
      { key: '2026-05', total: -500, count: 2 },
    ])
  })

  it('groups by category, resolving names and uncategorized', () => {
    const other = createCategory({ name: 'travel' }).id
    createTransaction({
      accountId,
      amount: -100,
      description: 'a',
      occurredAt: '2026-05-01',
      categoryId,
    })
    createTransaction({
      accountId,
      amount: -900,
      description: 'b',
      occurredAt: '2026-05-02',
      categoryId: other,
    })
    createTransaction({
      accountId,
      amount: -50,
      description: 'uncat',
      occurredAt: '2026-05-03',
      categoryId: null,
    })
    const buckets = aggregateTransactions({}, 'category')
    expect(buckets).toEqual([
      { key: 'travel', total: -900, count: 1 },
      { key: 'food', total: -100, count: 1 },
      { key: '(uncategorized)', total: -50, count: 1 },
    ])
  })

  it('groups by account, resolving names', () => {
    const other = createAccount({ name: 'Wallet', type: 'checking' }).id
    createTransaction({
      accountId,
      amount: -100,
      description: 'a',
      occurredAt: '2026-05-01',
      categoryId,
    })
    createTransaction({
      accountId: other,
      amount: -700,
      description: 'b',
      occurredAt: '2026-05-02',
      categoryId,
    })
    const buckets = aggregateTransactions({}, 'account')
    expect(buckets).toEqual([
      { key: 'Wallet', total: -700, count: 1 },
      { key: 'NuConta', total: -100, count: 1 },
    ])
  })

  it('honors filters', () => {
    createTransaction({
      accountId,
      amount: -100,
      description: 'a',
      occurredAt: '2026-04-30',
      categoryId,
    })
    createTransaction({
      accountId,
      amount: -200,
      description: 'b',
      occurredAt: '2026-05-01',
      categoryId,
    })
    expect(aggregateTransactions({ from: '2026-05-01' }, 'month')).toEqual([
      { key: '2026-05', total: -200, count: 1 },
    ])
  })

  it('returns an empty array when nothing matches', () => {
    expect(aggregateTransactions({ search: 'nope' }, 'merchant')).toEqual([])
  })
})

describe('statsTransactions', () => {
  it('computes count, sum, min, max and date range', () => {
    createTransaction({
      accountId,
      amount: -1000,
      description: 'a',
      occurredAt: '2026-05-10',
      categoryId,
    })
    createTransaction({
      accountId,
      amount: 3000,
      description: 'b',
      occurredAt: '2026-03-01',
      categoryId,
    })
    createTransaction({
      accountId,
      amount: -500,
      description: 'c',
      occurredAt: '2026-07-20',
      categoryId,
    })
    expect(statsTransactions({})).toEqual({
      count: 3,
      sum: 1500,
      min: -1000,
      max: 3000,
      firstDate: '2026-03-01',
      lastDate: '2026-07-20',
    })
  })

  it('returns zero/null shape for an empty result set', () => {
    expect(statsTransactions({ search: 'nope' })).toEqual({
      count: 0,
      sum: 0,
      min: null,
      max: null,
      firstDate: null,
      lastDate: null,
    })
  })
})
