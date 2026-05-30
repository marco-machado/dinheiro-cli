import { Command } from 'commander'
import { success, isPretty, prettyTable } from '../output'
import { resolveAccount } from '../accounts/db'
import { AppError } from '../errors'
import { getMonthlyReport, getStatementReport, getCategoryReport, getMerchantReport } from './db'

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7)
}

const monthRe = /^\d{4}-(0[1-9]|1[0-2])$/

function validateMonth(value: string | undefined, flag: string): void {
  if (value !== undefined && !monthRe.test(value)) {
    throw new AppError('VALIDATION_ERROR', `${flag} must be YYYY-MM`)
  }
}

function validateMonthRange(from: string | undefined, to: string | undefined): void {
  if (from && to && from > to) {
    throw new AppError('VALIDATION_ERROR', '--from must be <= --to')
  }
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

  cmd
    .command('category')
    .argument('<name-or-id>', 'category name or id')
    .option('--from <YYYY-MM>')
    .option('--to <YYYY-MM>')
    .option('--pretty')
    .action((nameOrId, opts) => {
      validateMonth(opts.from, '--from')
      validateMonth(opts.to, '--to')
      validateMonthRange(opts.from, opts.to)
      const report = getCategoryReport(nameOrId, opts.from, opts.to)
      if (isPretty(opts)) {
        console.log(`Category: ${report.category}`)
        console.log(`Total:    ${report.total} (${report.count} tx)`)
        if (report.byMonth.length) {
          console.log('')
          prettyTable(
            ['month', 'total', 'count'],
            report.byMonth.map((m) => [m.month, m.total, m.count]),
          )
        }
        if (report.byMerchant.length) {
          console.log('')
          prettyTable(
            ['merchant', 'total', 'count'],
            report.byMerchant.map((m) => [m.merchant, m.total, m.count]),
          )
        }
      } else {
        success(report)
      }
    })

  cmd
    .command('merchant')
    .requiredOption('--search <str>')
    .option('--from <YYYY-MM>')
    .option('--to <YYYY-MM>')
    .option('--pretty')
    .action((opts) => {
      validateMonth(opts.from, '--from')
      validateMonth(opts.to, '--to')
      validateMonthRange(opts.from, opts.to)
      const report = getMerchantReport(opts.search, opts.from, opts.to)
      if (isPretty(opts)) {
        console.log(`Search: ${report.search}`)
        console.log(`Total:  ${report.total} (${report.count} tx)`)
        if (report.byMonth.length) {
          console.log('')
          prettyTable(
            ['month', 'total', 'count'],
            report.byMonth.map((m) => [m.month, m.total, m.count]),
          )
        }
        if (report.byMerchant.length) {
          console.log('')
          prettyTable(
            ['merchant', 'total', 'count'],
            report.byMerchant.map((m) => [m.merchant, m.total, m.count]),
          )
        }
      } else {
        success(report)
      }
    })
}
