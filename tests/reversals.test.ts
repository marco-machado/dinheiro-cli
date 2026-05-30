import { describe, it, expect, beforeEach } from 'vitest'
import { setupTestDb } from './helpers'
import { createAccount } from '../src/accounts/db'
import { createCategory } from '../src/categories/db'
import {
  createTransaction,
  getTransaction,
  listTransactions,
  findReversalOriginal,
  setReversalLink,
} from '../src/transactions/db'
import { createTransfer } from '../src/transfers/db'
import { createImport } from '../src/imports/db'
import { getMonthlyReport } from '../src/reports/db'
import { AppError } from '../src/errors'

let accountId: string
let otherId: string
let categoryId: string

beforeEach(() => {
  setupTestDb()
  accountId = createAccount({ name: 'NuConta', type: 'checking' }).id
  otherId = createAccount({ name: 'Other', type: 'checking' }).id
  categoryId = createCategory({ name: 'support' }).id
})

describe('findReversalOriginal', () => {
  it('matches same account, same absolute amount, original on or before', () => {
    const original = createTransaction({
      accountId,
      amount: -200000,
      description: 'PIX Pedro',
      occurredAt: '2026-03-01',
      categoryId,
    })
    const match = findReversalOriginal({
      accountId,
      amount: 200000,
      occurredAt: '2026-03-05',
    })
    expect(match?.id).toBe(original.id)
  })

  it('ignores originals on a different account', () => {
    createTransaction({
      accountId: otherId,
      amount: -200000,
      description: 'PIX Pedro',
      occurredAt: '2026-03-01',
      categoryId,
    })
    expect(
      findReversalOriginal({ accountId, amount: 200000, occurredAt: '2026-03-05' }),
    ).toBeUndefined()
  })

  it('ignores originals dated after the reversal', () => {
    createTransaction({
      accountId,
      amount: -200000,
      description: 'PIX Pedro',
      occurredAt: '2026-03-10',
      categoryId,
    })
    expect(
      findReversalOriginal({ accountId, amount: 200000, occurredAt: '2026-03-05' }),
    ).toBeUndefined()
  })

  it('does not reuse an original already linked to another reversal', () => {
    const original = createTransaction({
      accountId,
      amount: -200000,
      description: 'PIX Pedro',
      occurredAt: '2026-03-01',
      categoryId,
    })
    createTransaction({
      accountId,
      amount: 200000,
      description: 'Estorno - PIX Pedro',
      occurredAt: '2026-03-04',
      categoryId,
      reversalOf: original.id,
    })
    expect(
      findReversalOriginal({ accountId, amount: 200000, occurredAt: '2026-03-05' }),
    ).toBeUndefined()
  })

  it('picks the earliest unlinked candidate', () => {
    const first = createTransaction({
      accountId,
      amount: -200000,
      description: 'PIX Pedro',
      occurredAt: '2026-03-01',
      categoryId,
    })
    createTransaction({
      accountId,
      amount: -200000,
      description: 'PIX Pedro',
      occurredAt: '2026-03-03',
      categoryId,
    })
    const match = findReversalOriginal({
      accountId,
      amount: 200000,
      occurredAt: '2026-03-05',
    })
    expect(match?.id).toBe(first.id)
  })
})

describe('setReversalLink', () => {
  let original: string
  let reversal: string

  beforeEach(() => {
    original = createTransaction({
      accountId,
      amount: -200000,
      description: 'PIX Pedro',
      occurredAt: '2026-03-01',
      categoryId,
    }).id
    reversal = createTransaction({
      accountId,
      amount: 200000,
      description: 'Estorno - PIX Pedro',
      occurredAt: '2026-03-04',
      categoryId,
    }).id
  })

  it('links a reversal to its original', () => {
    const r = setReversalLink(reversal, original)
    expect(r.linked).toBe(true)
    expect(r.reversalOf).toBe(original)
    expect(getTransaction(reversal)!.reversalOf).toBe(original)
  })

  it('unlinks a reversal', () => {
    setReversalLink(reversal, original)
    const r = setReversalLink(reversal, null)
    expect(r.linked).toBe(false)
    expect(r.reversalOf).toBeNull()
    expect(getTransaction(reversal)!.reversalOf).toBeNull()
  })

  it('rejects unknown reversal id', () => {
    expect(() => setReversalLink('nope', original)).toThrow(AppError)
  })

  it('rejects unknown original id', () => {
    expect(() => setReversalLink(reversal, 'nope')).toThrow(AppError)
  })

  it('rejects self-reversal', () => {
    expect(() => setReversalLink(reversal, reversal)).toThrow(AppError)
  })

  it('rejects cross-account links', () => {
    const crossOriginal = createTransaction({
      accountId: otherId,
      amount: -200000,
      description: 'PIX Pedro',
      occurredAt: '2026-03-01',
      categoryId,
    }).id
    expect(() => setReversalLink(reversal, crossOriginal)).toThrow(AppError)
  })

  it('rejects reversing a transfer row', () => {
    createTransfer({
      fromAccountId: accountId,
      toAccountId: otherId,
      amount: 5000,
      occurredAt: '2026-03-02',
    })
    const transferRow = listTransactions({ accountId }).find((t) => t.transferId)!
    expect(() => setReversalLink(reversal, transferRow.id)).toThrow(AppError)
  })
})

describe('import reversal linking (nubank)', () => {
  const nubankRows = () => [
    {
      amount: -200000,
      description: 'PIX Pedro',
      occurredAt: '2026-03-01',
      categoryId,
    },
    {
      amount: 200000,
      description: 'Estorno - PIX Pedro',
      occurredAt: '2026-03-04',
      categoryId,
    },
  ]

  it('links Estorno rows to a matching original during import', () => {
    const result = createImport({
      accountId,
      format: 'nubank',
      filename: 'nu.csv',
      rows: nubankRows(),
    })
    expect(result.reversalsLinked).toBe(1)
    const original = listTransactions({ search: 'PIX Pedro' }).find(
      (t) => t.description === 'PIX Pedro',
    )!
    const reversal = listTransactions({ search: 'Estorno' })[0]
    expect(reversal.reversalOf).toBe(original.id)
  })

  it('reflects net vs gross after import', () => {
    createImport({ accountId, format: 'nubank', filename: 'nu.csv', rows: nubankRows() })
    const gross = getMonthlyReport('2026-03', accountId, 'gross')
    expect(gross.expenseTotal).toBe(-200000)
    expect(gross.incomeTotal).toBe(200000)
    const net = getMonthlyReport('2026-03', accountId, 'net')
    expect(net.expenseTotal).toBe(0)
    expect(net.incomeTotal).toBe(0)
  })

  it('does not link reversals for canonical format', () => {
    const result = createImport({
      accountId,
      format: 'canonical',
      filename: 'c.json',
      rows: nubankRows(),
    })
    expect(result.reversalsLinked).toBe(0)
  })

  it('only links each original once when multiple reversals arrive', () => {
    const rows = [
      { amount: -200000, description: 'PIX Pedro', occurredAt: '2026-03-01', categoryId },
      { amount: -200000, description: 'PIX Pedro', occurredAt: '2026-03-02', categoryId },
      { amount: 200000, description: 'Estorno - PIX Pedro', occurredAt: '2026-03-04', categoryId },
      { amount: 200000, description: 'Estorno - PIX Pedro', occurredAt: '2026-03-05', categoryId },
    ]
    const result = createImport({ accountId, format: 'nubank', filename: 'nu.csv', rows })
    expect(result.reversalsLinked).toBe(2)
  })
})

describe('reports monthly reversals mode', () => {
  beforeEach(() => {
    const original = createTransaction({
      accountId,
      amount: -200000,
      description: 'PIX Pedro',
      occurredAt: '2026-03-01',
      categoryId,
    })
    createTransaction({
      accountId,
      amount: 200000,
      description: 'Estorno - PIX Pedro',
      occurredAt: '2026-03-04',
      categoryId,
      reversalOf: original.id,
    })
    createTransaction({
      accountId,
      amount: -5000,
      description: 'Coffee',
      occurredAt: '2026-03-06',
      categoryId,
    })
  })

  it('net (default) excludes both reversal and original', () => {
    const r = getMonthlyReport('2026-03', accountId)
    expect(r.reversals).toBe('net')
    expect(r.expenseTotal).toBe(-5000)
    expect(r.incomeTotal).toBe(0)
  })

  it('gross includes both rows', () => {
    const r = getMonthlyReport('2026-03', accountId, 'gross')
    expect(r.reversals).toBe('gross')
    expect(r.expenseTotal).toBe(-205000)
    expect(r.incomeTotal).toBe(200000)
  })

  it('net keeps the category breakdown free of the cancelled pair', () => {
    const r = getMonthlyReport('2026-03', accountId)
    const support = r.byCategory.find((c) => c.category === 'support')!
    expect(support.total).toBe(-5000)
  })
})
