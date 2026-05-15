export interface TransferResult {
  transferId: string
  fromAccountId: string
  toAccountId: string
  amount: number
  occurredAt: string
  description: string | null
}
