import { describe, it, expect } from 'vitest'
import { mapSqliteError } from '../src/errors'

function sqliteErr(code: string, message: string): Error {
  const e = new Error(message) as Error & { code: string }
  e.code = code
  return e
}

describe('mapSqliteError', () => {
  it('returns null for non-Error values', () => {
    expect(mapSqliteError('string')).toBeNull()
    expect(mapSqliteError(42)).toBeNull()
    expect(mapSqliteError(null)).toBeNull()
  })

  it('returns null for non-SQLite errors', () => {
    const e = new Error('something else')
    expect(mapSqliteError(e)).toBeNull()
  })

  it('returns null for Error without code', () => {
    expect(mapSqliteError(new Error('no code'))).toBeNull()
  })

  it('maps SQLITE_CONSTRAINT_UNIQUE to CONFLICT with parsed column', () => {
    const e = sqliteErr('SQLITE_CONSTRAINT_UNIQUE', 'UNIQUE constraint failed: accounts.name')
    const result = mapSqliteError(e)
    expect(result).not.toBeNull()
    expect(result!.code).toBe('CONFLICT')
    expect(result!.message).toBe('accounts.name already exists')
  })

  it('maps SQLITE_CONSTRAINT_UNIQUE with fallback message when parsing fails', () => {
    const e = sqliteErr('SQLITE_CONSTRAINT_UNIQUE', 'unparseable message')
    const result = mapSqliteError(e)
    expect(result).not.toBeNull()
    expect(result!.code).toBe('CONFLICT')
    expect(result!.message).toBe('unparseable message')
  })

  it('maps SQLITE_CONSTRAINT_PRIMARYKEY to CONFLICT', () => {
    const e = sqliteErr(
      'SQLITE_CONSTRAINT_PRIMARYKEY',
      'PRIMARY KEY constraint failed: accounts.id',
    )
    const result = mapSqliteError(e)
    expect(result!.code).toBe('CONFLICT')
  })

  it('maps SQLITE_CONSTRAINT_FOREIGNKEY to CONFLICT', () => {
    const e = sqliteErr('SQLITE_CONSTRAINT_FOREIGNKEY', 'FOREIGN KEY constraint failed')
    const result = mapSqliteError(e)
    expect(result!.code).toBe('CONFLICT')
    expect(result!.message).toBe('FOREIGN KEY constraint failed')
  })

  it('maps SQLITE_CONSTRAINT_NOTNULL to VALIDATION_ERROR', () => {
    const e = sqliteErr('SQLITE_CONSTRAINT_NOTNULL', 'NOT NULL constraint failed: accounts.name')
    const result = mapSqliteError(e)
    expect(result!.code).toBe('VALIDATION_ERROR')
  })

  it('maps SQLITE_CONSTRAINT_CHECK to VALIDATION_ERROR', () => {
    const e = sqliteErr('SQLITE_CONSTRAINT_CHECK', 'CHECK constraint failed: accounts')
    const result = mapSqliteError(e)
    expect(result!.code).toBe('VALIDATION_ERROR')
  })

  it('maps other SQLITE_ codes to DB_ERROR', () => {
    const e = sqliteErr('SQLITE_FULL', 'database or disk is full')
    const result = mapSqliteError(e)
    expect(result!.code).toBe('DB_ERROR')
  })
})
