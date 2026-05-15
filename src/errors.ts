export type ErrorCode = 'VALIDATION_ERROR' | 'NOT_FOUND' | 'CONFLICT' | 'DB_ERROR'

export class AppError extends Error {
  constructor(public readonly code: ErrorCode, message: string) {
    super(message)
    this.name = 'AppError'
  }
}
