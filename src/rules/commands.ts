import { Command } from 'commander'
import { AppError } from '../errors'
import { success, isPretty, prettyTable } from '../output'
import { resolveCategory, getCategory } from '../categories/db'
import { resolveAccount, getAccount } from '../accounts/db'
import { createRule, getRule, listRules, deleteRule, matchRule, applyRules } from './db'
import type { Rule } from './types'

// Parse a comma-separated list of integers (e.g. "1,2" or "29990,59990").
function parseIntList(value: string, label: string): number[] {
  // Strict integer tokens only — reject empty entries ("100," → 0) and
  // scientific notation ("1e2"), both of which Number() would silently accept.
  return value.split(',').map((part) => {
    const token = part.trim()
    if (!/^-?\d+$/.test(token)) throw new AppError('VALIDATION_ERROR', `${label} must be integers`)
    return Number(token)
  })
}

function categoryName(id: string): string {
  return getCategory(id)?.name ?? id
}

function accountName(id: string | null): string | null {
  if (!id) return null
  return getAccount(id)?.name ?? id
}

// Public, agent-facing shape: stored fields plus resolved category/account names.
function ruleView(rule: Rule) {
  return {
    id: rule.id,
    match: rule.match,
    amounts: rule.amounts,
    daysOfMonth: rule.daysOfMonth,
    accountId: rule.accountId,
    account: accountName(rule.accountId),
    categoryId: rule.categoryId,
    category: categoryName(rule.categoryId),
    priority: rule.priority,
    createdAt: rule.createdAt,
    updatedAt: rule.updatedAt,
  }
}

export function registerRules(program: Command): void {
  const cmd = program.command('rules')

  cmd
    .command('create')
    .requiredOption('--match <str>', 'case-insensitive substring on description')
    .requiredOption('--category <name|id>', 'target category')
    .option('--amount <cents>', 'exact amount in cents')
    .option('--amount-in <list>', 'comma-separated list of amounts in cents')
    .option('--day-of-month <list>', 'comma-separated days of month (1-31)')
    .option('--account <name|id>', 'restrict to a single account')
    .option('--priority <n>', 'explicit ordering; defaults to insertion order')
    .option('--pretty')
    .action((opts) => {
      const categoryId = resolveCategory(opts.category).id
      const accountId = opts.account ? resolveAccount(opts.account).id : null

      const amounts: number[] = []
      if (opts.amount !== undefined) amounts.push(...parseIntList(opts.amount, '--amount'))
      if (opts.amountIn !== undefined) amounts.push(...parseIntList(opts.amountIn, '--amount-in'))

      let daysOfMonth: number[] | null = null
      if (opts.dayOfMonth !== undefined) {
        daysOfMonth = parseIntList(opts.dayOfMonth, '--day-of-month')
        for (const d of daysOfMonth) {
          if (d < 1 || d > 31)
            throw new AppError('VALIDATION_ERROR', '--day-of-month must be between 1 and 31')
        }
      }

      let priority: number | undefined
      if (opts.priority !== undefined) {
        priority = Number(opts.priority)
        if (!Number.isInteger(priority))
          throw new AppError('VALIDATION_ERROR', '--priority must be an integer')
      }

      const rule = createRule({
        match: opts.match,
        amounts: amounts.length ? amounts : null,
        daysOfMonth,
        accountId,
        categoryId,
        priority,
      })
      const view = ruleView(rule)
      if (isPretty(opts)) {
        prettyTable(
          ['id', 'match', 'amounts', 'days', 'account', 'category', 'priority'],
          [
            [
              view.id,
              view.match,
              view.amounts?.join(',') ?? '',
              view.daysOfMonth?.join(',') ?? '',
              view.account ?? '',
              view.category,
              view.priority,
            ],
          ],
        )
      } else {
        success(view)
      }
    })

  cmd
    .command('list')
    .option('--pretty')
    .action((opts) => {
      const list = listRules().map(ruleView)
      if (isPretty(opts)) {
        prettyTable(
          ['id', 'match', 'amounts', 'days', 'account', 'category', 'priority'],
          list.map((v) => [
            v.id,
            v.match,
            v.amounts?.join(',') ?? '',
            v.daysOfMonth?.join(',') ?? '',
            v.account ?? '',
            v.category,
            v.priority,
          ]),
        )
      } else {
        success(list)
      }
    })

  cmd
    .command('delete')
    .argument('<id>')
    .action((id) => {
      if (!getRule(id)) throw new AppError('NOT_FOUND', `rule ${id} not found`)
      deleteRule(id)
      success({ id, deleted: true })
    })

  cmd
    .command('test')
    .description('dry-run: which rule (if any) matches a hypothetical transaction')
    .requiredOption('--description <str>')
    .requiredOption('--amount <cents>', 'amount in cents (signed)')
    .requiredOption('--date <YYYY-MM-DD>')
    .option('--account <name|id>')
    .action((opts) => {
      const amount = Number(opts.amount)
      if (!Number.isInteger(amount))
        throw new AppError('VALIDATION_ERROR', '--amount must be an integer (cents)')
      if (!/^\d{4}-\d{2}-\d{2}$/.test(opts.date))
        throw new AppError('VALIDATION_ERROR', '--date must be YYYY-MM-DD')
      // Round-trip through Date to reject impossible calendar dates (e.g. 2026-13-40).
      const parsed = new Date(`${opts.date}T00:00:00.000Z`)
      if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== opts.date)
        throw new AppError('VALIDATION_ERROR', '--date must be a real calendar date (YYYY-MM-DD)')
      const accountId = opts.account ? resolveAccount(opts.account).id : ''

      const rule = matchRule({
        description: opts.description,
        amount,
        occurredAt: opts.date,
        accountId,
      })
      success({
        matched: rule !== null,
        rule: rule ? ruleView(rule) : null,
        categoryId: rule?.categoryId ?? null,
        category: rule ? categoryName(rule.categoryId) : null,
      })
    })

  cmd
    .command('apply')
    .description('re-run rules over existing transactions in a scope')
    .option('--import-batch <id>', 'restrict to one import batch')
    .option('--from <YYYY-MM>', 'start of date range (inclusive)')
    .option('--to <YYYY-MM>', 'end of date range (inclusive)')
    .option('--account <name|id>', 'restrict to a single account')
    .option('--dry-run', 'preview without writing')
    .action((opts) => {
      const accountId = opts.account ? resolveAccount(opts.account).id : undefined
      const result = applyRules({
        importBatch: opts.importBatch,
        from: opts.from,
        to: opts.to,
        accountId,
        dryRun: !!opts.dryRun,
      })
      success(result)
    })
}
