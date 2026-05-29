import { Command } from 'commander'
import { success, isPretty, prettyTable } from '../output'
import { resolveAccount } from '../accounts/db'
import { getMonthlyReport, getStatementReport } from './db'

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7)
}

export function registerReports(program: Command): void {
  const cmd = program.command('reports')

  cmd
    .command('monthly')
    .option('--month <YYYY-MM>')
    .option('--account <id-or-name>')
    .option('--pretty')
    .action((opts) => {
      const accountId = opts.account ? resolveAccount(opts.account).id : undefined
      const report = getMonthlyReport(opts.month ?? currentMonth(), accountId)
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
    .requiredOption('--account <id-or-name>')
    .requiredOption('--period <YYYY-MM>')
    .option('--pretty')
    .action((opts) => {
      const account = resolveAccount(opts.account)
      const rows = getStatementReport(account.id, opts.period)
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
