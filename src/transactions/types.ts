export interface Transaction {
  id: string
  accountId: string
  amount: number
  description: string
  occurredAt: string
  categoryId: string | null
  statementPeriod: string | null
  transferId: string | null
  importBatchId: string | null
  rowHash: string | null
  createdAt: number
  updatedAt: number
}

export interface TransactionInput {
  accountId: string
  amount: number
  description: string
  occurredAt: string
  categoryId?: string | null
  statementPeriod?: string | null
  transferId?: string | null
  importBatchId?: string | null
  rowHash?: string | null
}
