import { describe, it, expect, beforeEach } from 'vitest'
import { setupTestDb } from './helpers'
import { createAccount } from '../src/accounts/db'
import { createTransfer, listTransfers, deleteTransfer } from '../src/transfers/db'
import { getTransaction, listTransactions } from '../src/transactions/db'

let checkingId: string
let cardId: string

beforeEach(() => {
  setupTestDb()
  checkingId = createAccount({ name: 'Checking', type: 'checking' }).id
  cardId = createAccount({ name: 'CC', type: 'credit_card', closeDay: 25, dueDay: 5 }).id
})

describe('transfers', () => {
  it('creates two linked transaction rows', () => {
    const t = createTransfer({
      fromAccountId: checkingId,
      toAccountId: cardId,
      amount: 50000,
      occurredAt: '2026-05-15',
      description: 'CC payment',
    })
    expect(t.transferId).toBeTruthy()
    const all = listTransactions({})
    expect(all).toHaveLength(2)
    const out = all.find((r) => r.accountId === checkingId)!
    const inn = all.find((r) => r.accountId === cardId)!
    expect(out.amount).toBe(-50000)
    expect(inn.amount).toBe(50000)
    expect(out.transferId).toBe(inn.transferId)
  })

  it('lists transfers', () => {
    createTransfer({
      fromAccountId: checkingId,
      toAccountId: cardId,
      amount: 1000,
      occurredAt: '2026-05-01',
    })
    expect(listTransfers({})).toHaveLength(1)
  })

  it('filters transfers by account', () => {
    const other = createAccount({ name: 'Other', type: 'checking' }).id
    createTransfer({
      fromAccountId: checkingId,
      toAccountId: cardId,
      amount: 1000,
      occurredAt: '2026-05-01',
    })
    createTransfer({
      fromAccountId: other,
      toAccountId: checkingId,
      amount: 500,
      occurredAt: '2026-05-01',
    })
    expect(listTransfers({ accountId: cardId })).toHaveLength(1)
  })

  it('deletes both sides atomically', () => {
    const t = createTransfer({
      fromAccountId: checkingId,
      toAccountId: cardId,
      amount: 1000,
      occurredAt: '2026-05-01',
    })
    deleteTransfer(t.transferId)
    expect(listTransactions({})).toHaveLength(0)
  })
})
