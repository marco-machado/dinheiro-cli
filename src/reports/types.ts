export type ReversalsMode = 'net' | 'gross'

export interface MonthlyReport {
  month: string
  reversals: ReversalsMode
  incomeTotal: number
  expenseTotal: number
  net: number
  transfersOut: number
  transfersIn: number
  byCategory: Array<{ category: string; total: number; pct: number }>
}
