import { describe, it, expect, beforeEach } from 'vitest'
import { setupTestDb } from './helpers'
import { createAccount } from '../src/accounts/db'
import { createCategory } from '../src/categories/db'
import { listTransactions } from '../src/transactions/db'
import { createImport, listImports, deleteImport } from '../src/imports/db'

let accountId: string
let categoryId: string

beforeEach(() => {
  setupTestDb()
  accountId = createAccount({ name: 'NuConta', type: 'checking' }).id
  categoryId = createCategory({ name: 'food' }).id
})

const canonicalRows = () => [
  { amount: -4200, description: 'iFood', occurredAt: '2026-05-01', categoryId },
  { amount: -2000, description: 'Uber', occurredAt: '2026-05-02', categoryId },
]

describe('imports canonical', () => {
  it('inserts all rows and returns counts', () => {
    const result = createImport({
      accountId,
      format: 'canonical',
      filename: 'test.json',
      rows: canonicalRows(),
    })
    expect(result.inserted).toBe(2)
    expect(result.skipped).toBe(0)
    expect(listTransactions({})).toHaveLength(2)
  })

  it('skips duplicate rows on reimport', () => {
    createImport({ accountId, format: 'canonical', filename: 'a.json', rows: canonicalRows() })
    const result = createImport({
      accountId,
      format: 'canonical',
      filename: 'a.json',
      rows: canonicalRows(),
    })
    expect(result.inserted).toBe(0)
    expect(result.skipped).toBe(2)
  })

  it('rolls back all rows on failure', () => {
    const badRows = [
      { amount: -1000, description: 'ok', occurredAt: '2026-05-01', categoryId },
      { amount: NaN, description: 'bad', occurredAt: 'bad-date', categoryId },
    ]
    expect(() =>
      createImport({ accountId, format: 'canonical', filename: 'bad.json', rows: badRows }),
    ).toThrow()
    expect(listTransactions({})).toHaveLength(0)
    expect(listImports()).toHaveLength(0)
  })

  it('lists imports', () => {
    createImport({ accountId, format: 'canonical', filename: 'a.json', rows: canonicalRows() })
    const list = listImports()
    expect(list).toHaveLength(1)
    expect(list[0].rowCount).toBe(2)
    expect(list[0].filename).toBe('a.json')
  })

  it('deletes import and its transactions atomically', () => {
    const result = createImport({
      accountId,
      format: 'canonical',
      filename: 'a.json',
      rows: canonicalRows(),
    })
    deleteImport(result.importId)
    expect(listTransactions({})).toHaveLength(0)
    expect(listImports()).toHaveLength(0)
  })

  it('dry-run returns counts without writing', () => {
    const result = createImport({
      accountId,
      format: 'canonical',
      filename: 'a.json',
      rows: canonicalRows(),
      dryRun: true,
    })
    expect(result.inserted).toBe(2)
    expect(listTransactions({})).toHaveLength(0)
  })
})
