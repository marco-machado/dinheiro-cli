export type ErrorCode = 'VALIDATION_ERROR' | 'NOT_FOUND' | 'CONFLICT' | 'DB_ERROR' | 'INTERNAL'

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export function mapSqliteError(err: unknown): AppError | null {
  if (!(err instanceof Error)) return null
  const code = (err as { code?: unknown }).code
  if (typeof code !== 'string' || !code.startsWith('SQLITE_')) return null

  if (code === 'SQLITE_CONSTRAINT_UNIQUE' || code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
    const match = /UNIQUE constraint failed: (.+)/.exec(err.message)
    const msg = match ? `${match[1]} already exists` : err.message
    return new AppError('CONFLICT', msg)
  }

  if (code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
    return new AppError('CONFLICT', err.message)
  }

  if (code === 'SQLITE_CONSTRAINT_NOTNULL' || code === 'SQLITE_CONSTRAINT_CHECK') {
    return new AppError('VALIDATION_ERROR', err.message)
  }

  return new AppError('DB_ERROR', err.message)
}
