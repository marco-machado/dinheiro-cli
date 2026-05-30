import { Command } from 'commander'
import { AppError } from '../errors'
import { success, isPretty, prettyTable } from '../output'
import { resolveAccount } from '../accounts/db'
import { getMonthlyReport, getStatementReport } from './db'
import type { ReversalsMode } from './types'

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7)
}

export function registerReports(program: Command): void {
  const cmd = program.command('reports')

  cmd
    .command('monthly')
    .option('--month <YYYY-MM>')
    .option('--account <id-or-name>')
    .option('--reversals <mode>', 'net (default, both rows excluded) or gross', 'net')
    .option('--pretty')
    .action((opts) => {
      const accountId = opts.account ? resolveAccount(opts.account).id : undefined
      const reversals = opts.reversals as ReversalsMode
      if (reversals !== 'net' && reversals !== 'gross') {
        throw new AppError('VALIDATION_ERROR', 'reversals must be net or gross')
      }
      const report = getMonthlyReport(opts.month ?? currentMonth(), accountId, reversals)
      if (isPretty(opts)) {
        console.log(`Month: ${report.month}`)
        console.log(`Income:       ${report.incomeTotal}`)
        console.log(`Expenses:     ${report.expenseTotal}`)
        console.log(`Net:          ${report.net}`)
        console.log(`Transfers out: ${report.transfersOut}`)
        console.log(`Transfers in:  ${report.transfersIn}`)
        if (report.byCategory.length) {
          console.log('')
          prettyTable(
            ['category', 'total', 'pct%'],
            report.byCategory.map((c) => [c.category, c.total, c.pct]),
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
