import { describe, it, expect, beforeEach } from 'vitest'
import { setupTestDb } from './helpers'
import { createAccount } from '../src/accounts/db'
import { createCategory } from '../src/categories/db'
import { createImport } from '../src/imports/db'
import { listTransactions, createTransaction } from '../src/transactions/db'
import { createRule, listRules, deleteRule, matchRule, applyRules } from '../src/rules/db'

let accountId: string
let altAccountId: string
let gaming: string
let subs: string
let utilities: string

beforeEach(() => {
  setupTestDb()
  accountId = createAccount({ name: 'NuConta', type: 'checking' }).id
  altAccountId = createAccount({ name: 'Itau', type: 'checking' }).id
  gaming = createCategory({ name: 'Mobile Gaming' }).id
  subs = createCategory({ name: 'Subscriptions' }).id
  utilities = createCategory({ name: 'Utilities' }).id
})

describe('rules CRUD', () => {
  it('creates a rule and round-trips parsed list fields', () => {
    const rule = createRule({
      match: 'Apple.Com/Bill',
      amounts: [29990],
      daysOfMonth: [1, 2],
      categoryId: subs,
    })
    expect(rule.amounts).toEqual([29990])
    expect(rule.daysOfMonth).toEqual([1, 2])
    expect(rule.accountId).toBeNull()
    const fetched = listRules()
    expect(fetched).toHaveLength(1)
    expect(fetched[0].amounts).toEqual([29990])
  })

  it('assigns incrementing priority by insertion order', () => {
    const a = createRule({ match: 'A', categoryId: gaming })
    const b = createRule({ match: 'B', categoryId: gaming })
    expect(b.priority).toBeGreaterThan(a.priority)
  })

  it('deletes a rule', () => {
    const rule = createRule({ match: 'PAGGO', categoryId: gaming })
    deleteRule(rule.id)
    expect(listRules()).toHaveLength(0)
  })
})

describe('rules matching engine', () => {
  it('matches case-insensitive substring on description', () => {
    createRule({ match: 'PAGGO SOLUCOES', categoryId: gaming })
    const rule = matchRule({
      description: 'paggo solucoes de pagamento',
      amount: -1500,
      occurredAt: '2026-04-10',
      accountId,
    })
    expect(rule?.categoryId).toBe(gaming)
  })

  it('matches amount sign-insensitively', () => {
    createRule({ match: 'Apple.Com/Bill', amounts: [29990], categoryId: subs })
    expect(
      matchRule({
        description: 'Apple.Com/Bill',
        amount: -29990,
        occurredAt: '2026-04-02',
        accountId,
      })?.categoryId,
    ).toBe(subs)
    expect(
      matchRule({
        description: 'Apple.Com/Bill',
        amount: -1190,
        occurredAt: '2026-04-02',
        accountId,
      }),
    ).toBeNull()
  })

  it('honors day-of-month constraint', () => {
    createRule({ match: 'Apple.Com/Bill', daysOfMonth: [1, 2], categoryId: subs })
    expect(
      matchRule({
        description: 'Apple.Com/Bill',
        amount: -29990,
        occurredAt: '2026-04-02',
        accountId,
      })?.categoryId,
    ).toBe(subs)
    expect(
      matchRule({
        description: 'Apple.Com/Bill',
        amount: -29990,
        occurredAt: '2026-04-15',
        accountId,
      }),
    ).toBeNull()
  })

  it('honors account scope', () => {
    createRule({ match: 'ENEL', accountId, categoryId: utilities })
    expect(
      matchRule({ description: 'ENEL SP', amount: -8000, occurredAt: '2026-04-05', accountId })
        ?.categoryId,
    ).toBe(utilities)
    expect(
      matchRule({
        description: 'ENEL SP',
        amount: -8000,
        occurredAt: '2026-04-05',
        accountId: altAccountId,
      }),
    ).toBeNull()
  })

  it('is first-match-wins in priority order', () => {
    // The narrower (priced) rule must come first to win the Apple tier split.
    createRule({ match: 'Apple.Com/Bill', amounts: [29990], daysOfMonth: [1, 2], categoryId: subs })
    createRule({ match: 'Apple.Com/Bill', categoryId: gaming })
    expect(
      matchRule({
        description: 'Apple.Com/Bill',
        amount: -29990,
        occurredAt: '2026-04-01',
        accountId,
      })?.categoryId,
    ).toBe(subs)
    expect(
      matchRule({
        description: 'Apple.Com/Bill',
        amount: -1190,
        occurredAt: '2026-04-10',
        accountId,
      })?.categoryId,
    ).toBe(gaming)
  })
})

describe('rules applied at import time', () => {
  it('fills category for uncategorized rows', () => {
    createRule({ match: 'PAGGO', categoryId: gaming })
    const result = createImport({
      accountId,
      format: 'canonical',
      filename: 'a.json',
      rows: [{ amount: -1500, description: 'PAGGO SOLUCOES', occurredAt: '2026-04-10' }],
    })
    expect(result.categorized).toBe(1)
    expect(listTransactions({})[0].categoryId).toBe(gaming)
  })

  it('does not override a row that already has a category', () => {
    createRule({ match: 'PAGGO', categoryId: gaming })
    createImport({
      accountId,
      format: 'canonical',
      filename: 'a.json',
      rows: [
        {
          amount: -1500,
          description: 'PAGGO SOLUCOES',
          occurredAt: '2026-04-10',
          categoryId: subs,
        },
      ],
    })
    expect(listTransactions({})[0].categoryId).toBe(subs)
  })

  it('skips rules when applyRules is false', () => {
    createRule({ match: 'PAGGO', categoryId: gaming })
    const result = createImport({
      accountId,
      format: 'canonical',
      filename: 'a.json',
      rows: [{ amount: -1500, description: 'PAGGO SOLUCOES', occurredAt: '2026-04-10' }],
      applyRules: false,
    })
    expect(result.categorized).toBe(0)
    expect(listTransactions({})[0].categoryId).toBeNull()
  })
})

describe('rules apply backfill', () => {
  it('recategorizes existing transactions in an import batch', () => {
    const result = createImport({
      accountId,
      format: 'canonical',
      filename: 'a.json',
      rows: [{ amount: -1500, description: 'PAGGO SOLUCOES', occurredAt: '2026-04-10' }],
    })
    createRule({ match: 'PAGGO', categoryId: gaming })
    const applied = applyRules({ importBatch: result.importId })
    expect(applied.matched).toBe(1)
    expect(applied.updated).toBe(1)
    expect(listTransactions({})[0].categoryId).toBe(gaming)
  })

  it('backfills a date range and dry-run leaves data untouched', () => {
    createTransaction({
      accountId,
      amount: -8000,
      description: 'ENEL SP',
      occurredAt: '2026-02-05',
    })
    createTransaction({
      accountId,
      amount: -8000,
      description: 'ENEL SP',
      occurredAt: '2026-09-05',
    })
    createRule({ match: 'ENEL', categoryId: utilities })

    const preview = applyRules({ from: '2026-01', to: '2026-04', dryRun: true })
    expect(preview.matched).toBe(1)
    expect(preview.updated).toBe(1)
    expect(listTransactions({ from: '2026-02-01', to: '2026-02-28' })[0].categoryId).toBeNull()

    const applied = applyRules({ from: '2026-01', to: '2026-04' })
    expect(applied.updated).toBe(1)
    expect(listTransactions({ from: '2026-02-01', to: '2026-02-28' })[0].categoryId).toBe(utilities)
    // Out-of-range September row is untouched.
    expect(listTransactions({ from: '2026-09-01', to: '2026-09-30' })[0].categoryId).toBeNull()
  })

  it('requires a scope', () => {
    expect(() => applyRules({})).toThrow()
  })
})
