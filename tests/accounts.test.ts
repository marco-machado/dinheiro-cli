import { describe, it, expect, beforeEach } from 'vitest'
import { setupTestDb } from './helpers'
import {
  createAccount,
  getAccount,
  listAccounts,
  updateAccount,
  deleteAccount,
  resolveAccount,
} from '../src/accounts/db'
import { AppError } from '../src/errors'

beforeEach(() => {
  setupTestDb()
})

describe('accounts', () => {
  it('creates a checking account', () => {
    const a = createAccount({ name: 'NuConta', type: 'checking' })
    expect(a.id).toBeTruthy()
    expect(a.name).toBe('NuConta')
    expect(a.type).toBe('checking')
    expect(a.closeDay).toBeNull()
    expect(a.dueDay).toBeNull()
  })

  it('creates a credit_card account with close/due days', () => {
    const a = createAccount({ name: 'Nubank CC', type: 'credit_card', closeDay: 25, dueDay: 5 })
    expect(a.closeDay).toBe(25)
    expect(a.dueDay).toBe(5)
  })

  it('lists all accounts', () => {
    createAccount({ name: 'A', type: 'checking' })
    createAccount({ name: 'B', type: 'checking' })
    expect(listAccounts()).toHaveLength(2)
  })

  it('gets account by id', () => {
    const a = createAccount({ name: 'Itaú', type: 'checking' })
    expect(getAccount(a.id)?.name).toBe('Itaú')
  })

  it('returns undefined for unknown id', () => {
    expect(getAccount('nonexistent')).toBeUndefined()
  })

  it('updates account name', () => {
    const a = createAccount({ name: 'Old', type: 'checking' })
    const updated = updateAccount(a.id, { name: 'New' })
    expect(updated.name).toBe('New')
  })

  it('deletes account', () => {
    const a = createAccount({ name: 'Temp', type: 'checking' })
    deleteAccount(a.id)
    expect(getAccount(a.id)).toBeUndefined()
  })

  it('throws a SQLite unique constraint error on duplicate name', () => {
    createAccount({ name: 'Duplicate', type: 'checking' })
    let thrown: unknown
    try {
      createAccount({ name: 'Duplicate', type: 'checking' })
    } catch (e) {
      thrown = e
    }
    expect(thrown).toBeInstanceOf(Error)
    const err = thrown as Error & { code?: string }
    expect(err.code).toBe('SQLITE_CONSTRAINT_UNIQUE')
  })

  it('rejects a case-variant duplicate name', () => {
    createAccount({ name: 'NuConta', type: 'checking' })
    expect(() => createAccount({ name: 'nuconta', type: 'checking' })).toThrow(
      /UNIQUE constraint failed/,
    )
  })

  it('rejects an accent-variant duplicate name', () => {
    createAccount({ name: 'Itaú', type: 'checking' })
    expect(() => createAccount({ name: 'itau', type: 'checking' })).toThrow(
      /UNIQUE constraint failed/,
    )
  })

  it('rejects renaming to a case-variant of an existing name', () => {
    createAccount({ name: 'First', type: 'checking' })
    const second = createAccount({ name: 'Second', type: 'checking' })
    expect(() => updateAccount(second.id, { name: 'FIRST' })).toThrow(/UNIQUE constraint failed/)
  })
})

describe('resolveAccount', () => {
  it('returns the account when given a ULID', () => {
    const a = createAccount({ name: 'NuConta', type: 'checking' })
    expect(resolveAccount(a.id).id).toBe(a.id)
  })

  it('matches names case-insensitively', () => {
    const a = createAccount({ name: 'NuConta', type: 'checking' })
    expect(resolveAccount('nuconta').id).toBe(a.id)
    expect(resolveAccount('NUCONTA').id).toBe(a.id)
  })

  it('matches names with accents folded', () => {
    const a = createAccount({ name: 'Itaú', type: 'checking' })
    expect(resolveAccount('itau').id).toBe(a.id)
    expect(resolveAccount('ITAÚ').id).toBe(a.id)
  })

  it('throws NOT_FOUND for an unknown name', () => {
    try {
      resolveAccount('Nope')
    } catch (e) {
      expect((e as AppError).code).toBe('NOT_FOUND')
    }
  })
})
