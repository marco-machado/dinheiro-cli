import { describe, it, expect, afterEach } from 'vitest'
import { initDb, getDb, closeDb } from '../src/db'

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
