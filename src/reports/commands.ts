import { Command } from 'commander'
import { AppError } from '../errors'
import { success, isPretty, prettyTable } from '../output'
import { getAccount } from '../accounts/db'
import { getMonthlyReport, getStatementReport } from './db'

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7)
}

export function registerReports(program: Command): void {
  const cmd = program.command('reports')

  cmd
    .command('monthly')
    .option('--month <YYYY-MM>')
    .option('--account <id>')
    .option('--pretty')
    .action((opts) => {
      if (opts.account && !getAccount(opts.account)) {
        throw new AppError('NOT_FOUND', `account ${opts.account} not found`)
      }
      const report = getMonthlyReport(opts.month ?? currentMonth(), opts.account)
      if (isPretty(opts)) {
        console.log(`Month: ${report.month}`)
        console.log(`Income:       ${report.income_total}`)
        console.log(`Expenses:     ${report.expense_total}`)
        console.log(`Net:          ${report.net}`)
        console.log(`Transfers out: ${report.transfers_out}`)
        console.log(`Transfers in:  ${report.transfers_in}`)
        if (report.by_category.length) {
          console.log('')
          prettyTable(
            ['category', 'total', 'pct%'],
            report.by_category.map((c) => [c.category, c.total, c.pct]),
          )
        }
      } else {
        success(report)
      }
    })

  cmd
    .command('statement')
    .requiredOption('--account <id>')
    .requiredOption('--period <YYYY-MM>')
    .option('--pretty')
    .action((opts) => {
      if (!getAccount(opts.account))
        throw new AppError('NOT_FOUND', `account ${opts.account} not found`)
      const rows = getStatementReport(opts.account, opts.period)
      if (isPretty(opts)) {
        prettyTable(
          ['id', 'amount', 'description', 'occurred_at'],
          rows.map((t) => [t.id, t.amount, t.description, t.occurredAt]),
        )
      } else {
        success(rows)
      }
    })
}
