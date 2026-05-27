import { describe, it, expect, afterEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { initDb, getDb, closeDb } from '../src/db'
import { renormalizeNames } from '../src/resolve'
import { accounts, categories } from '../src/schema/index'

afterEach(() => {
  closeDb()
})

describe('db lifecycle', () => {
  it('getDb() throws before initDb()', () => {
    closeDb()
    expect(() => getDb()).toThrow('DB not initialized')
  })

  it('getDb() works after initDb()', () => {
    initDb(':memory:')
    expect(() => getDb()).not.toThrow()
  })

  it('getDb() throws after closeDb()', () => {
    initDb(':memory:')
    closeDb()
    expect(() => getDb()).toThrow('DB not initialized')
  })

  it('initDb() reopens cleanly after closeDb()', () => {
    initDb(':memory:')
    closeDb()
    initDb(':memory:')
    expect(() => getDb()).not.toThrow()
  })

  it('repeated initDb() does not throw (closes previous connection first)', () => {
    initDb(':memory:')
    expect(() => initDb(':memory:')).not.toThrow()
    expect(() => getDb()).not.toThrow()
  })

  it('closeDb() is idempotent', () => {
    initDb(':memory:')
    closeDb()
    expect(() => closeDb()).not.toThrow()
  })
})

describe('renormalizeNames', () => {
  it('rewrites placeholder name_normalized values with JS-computed ones', () => {
    const db = initDb(':memory:')
    const now = Date.now()
    // Simulate post-migration state: name_normalized seeded with id placeholder.
    db.insert(categories)
      .values({
        id: 'cat-1',
        name: 'Saúde',
        nameNormalized: 'cat-1',
        createdAt: now,
        updatedAt: now,
      })
      .run()
    db.insert(categories)
      .values({
        id: 'cat-2',
        name: 'Alimentação',
        nameNormalized: 'cat-2',
        createdAt: now,
        updatedAt: now,
      })
      .run()

    renormalizeNames(db)

    expect(
      db.select().from(categories).where(eq(categories.id, 'cat-1')).get()?.nameNormalized,
    ).toBe('saude')
    expect(
      db.select().from(categories).where(eq(categories.id, 'cat-2')).get()?.nameNormalized,
    ).toBe('alimentacao')
  })

  it('is idempotent — re-running leaves correctly normalized rows untouched', () => {
    const db = initDb(':memory:')
    const now = Date.now()
    db.insert(accounts)
      .values({
        id: 'acc-1',
        name: 'Itaú',
        nameNormalized: 'acc-1',
        type: 'checking',
        closeDay: null,
        dueDay: null,
        createdAt: now,
        updatedAt: now,
      })
      .run()

    renormalizeNames(db)
    renormalizeNames(db)

    expect(db.select().from(accounts).where(eq(accounts.id, 'acc-1')).get()?.nameNormalized).toBe(
      'itau',
    )
  })

  it('raises CONFLICT when two existing rows normalize to the same value', () => {
    const db = initDb(':memory:')
    const now = Date.now()
    db.insert(categories)
      .values({ id: 'c1', name: 'Saúde', nameNormalized: 'c1', createdAt: now, updatedAt: now })
      .run()
    db.insert(categories)
      .values({ id: 'c2', name: 'SAUDE', nameNormalized: 'c2', createdAt: now, updatedAt: now })
      .run()

    expect(() => renormalizeNames(db)).toThrow(/collides with another row/)
  })
})
