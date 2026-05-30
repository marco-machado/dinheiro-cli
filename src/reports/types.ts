export interface MonthlyReport {
  month: string
  incomeTotal: number
  expenseTotal: number
  net: number
  transfersOut: number
  transfersIn: number
  byCategory: Array<{ category: string; total: number; pct: number }>
}

export interface MonthBucket {
  month: string
  total: number
  count: number
}

export interface MerchantBucket {
  merchant: string
  total: number
  count: number
}

export interface CategoryReport {
  category: string
  from: string | null
  to: string | null
  total: number
  count: number
  byMonth: MonthBucket[]
  byMerchant: MerchantBucket[]
}

export interface MerchantOccurrence {
  id: string
  occurredAt: string
  description: string
  amount: number
}

export interface MerchantReport {
  search: string
  from: string | null
  to: string | null
  total: number
  count: number
  byMonth: MonthBucket[]
  byMerchant: MerchantBucket[]
}
