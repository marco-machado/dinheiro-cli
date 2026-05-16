import { describe, it, expect, beforeEach } from 'vitest'
import { setupTestDb } from './helpers'
import {
  createAccount,
  getAccount,
  listAccounts,
  updateAccount,
  deleteAccount,
} from '../src/accounts/db'

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
})
