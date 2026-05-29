export interface MonthlyReport {
  month: string
  incomeTotal: number
  expenseTotal: number
  net: number
  transfersOut: number
  transfersIn: number
  byCategory: Array<{ category: string; total: number; pct: number }>
}
