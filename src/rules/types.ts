export interface Rule {
  id: string
  match: string
  amounts: number[] | null
  daysOfMonth: number[] | null
  accountId: string | null
  categoryId: string
  priority: number
  createdAt: number
  updatedAt: number
}

export interface RuleInput {
  match: string
  amounts?: number[] | null
  daysOfMonth?: number[] | null
  accountId?: string | null
  categoryId: string
  priority?: number
}

// A transaction's relevant fields for rule matching.
export interface RuleMatchInput {
  description: string
  amount: number
  occurredAt: string // YYYY-MM-DD
  accountId: string
}
