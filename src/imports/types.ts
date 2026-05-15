export interface Import {
  id: string
  accountId: string
  format: 'canonical' | 'nubank'
  filename: string
  rowCount: number
  createdAt: number
  updatedAt: number
}

export interface ImportRow {
  amount: number
  description: string
  occurredAt: string
  categoryId?: string | null
  statementPeriod?: string | null
}

export interface ImportResult {
  importId: string
  inserted: number
  skipped: number
}
