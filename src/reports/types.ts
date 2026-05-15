export interface MonthlyReport {
  month: string
  income_total: number
  expense_total: number
  net: number
  transfers_out: number
  transfers_in: number
  by_category: Array<{ category: string; total: number; pct: number }>
}
