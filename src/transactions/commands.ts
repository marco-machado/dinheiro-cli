import { Command } from 'commander'
import fs from 'fs'
import { z } from 'zod'
import { AppError } from '../errors'
import { success, isPretty, prettyTable } from '../output'
import { getAccount, resolveAccount } from '../accounts/db'
import { getCategory, resolveCategory } from '../categories/db'
import {
  createTransaction,
  getTransaction,
  listTransactions,
  aggregateTransactions,
  statsTransactions,
  updateTransaction,
  deleteTransaction,
  batchCreateTransactions,
  type AggregateDimension,
} from './db'

const aggregateDimensions: AggregateDimension[] = ['merchant', 'month', 'category', 'account']

const occurredAtRe = /^\d{4}-\d{2}-\d{2}$/
const periodRe = /^\d{4}-\d{2}$/

function validateInput(
  account: { type: 'checking' | 'credit_card' },
  opts: {
    categoryId?: string
    statementPeriod?: string
    occurredAt: string
    transferId?: string
  },
) {
  if (!occurredAtRe.test(opts.occurredAt)) {
    throw new AppError('VALIDATION_ERROR', 'occurred-at must be YYYY-MM-DD')
  }
  if (opts.statementPeriod && !periodRe.test(opts.statementPeriod)) {
    throw new AppError('VALIDATION_ERROR', 'statement-period must be YYYY-MM')
  }
  if (account.type === 'credit_card' && !opts.transferId && !opts.statementPeriod) {
    throw new AppError(
      'VALIDATION_ERROR',
      'statement-period is required for credit_card transactions',
    )
  }
  if (account.type === 'checking' && opts.statementPeriod) {
    throw new AppError(
      'VALIDATION_ERROR',
      'statement-period is only valid for credit_card accounts',
    )
  }
  if (!opts.transferId && !opts.categoryId) {
    throw new AppError('VALIDATION_ERROR', 'category is required for non-transfer transactions')
  }
}

const batchRowSchema = z.object({
  accountId: z.string(),
  amount: z.number().int(),
  description: z.string(),
  occurredAt: z.string().regex(occurredAtRe),
  categoryId: z.string().optional(),
  statementPeriod: z.string().regex(periodRe).optional(),
})

export function registerTransactions(program: Command): void {
  const cmd = program.command('transactions')

  cmd
    .command('create')
    .requiredOption('--account <id-or-name>')
    .requiredOption('--amount <n>', 'amount in cents (signed)', Number)
    .requiredOption('--description <str>')
    .requiredOption('--occurred-at <date>')
    .option('--category <id-or-name>')
    .option('--statement-period <YYYY-MM>')
    .option('--pretty')
    .action((opts) => {
      const account = resolveAccount(opts.account)
      const category = opts.category ? resolveCategory(opts.category) : null
      validateInput(account, {
        categoryId: category?.id,
        statementPeriod: opts.statementPeriod,
        occurredAt: opts.occurredAt,
      })
      const t = createTransaction({
        accountId: account.id,
        amount: opts.amount,
        description: opts.description,
        occurredAt: opts.occurredAt,
        categoryId: category?.id ?? null,
        statementPeriod: opts.statementPeriod ?? null,
      })
      success(t)
    })

  cmd
    .command('list')
    .option('--account <id-or-name>')
    .option('--category <id-or-name>')
    .option('--from <date>')
    .option('--to <date>')
    .option('--statement-period <YYYY-MM>')
    .option('--import-batch <id>')
    .option('--search <str>')
    .option('--limit <n>', 'max rows', Number)
    .option('--aggregate-by <dimension>', 'group results: merchant | month | category | account')
    .option('--stats', 'return { count, sum, min, max, firstDate, lastDate } instead of rows')
    .option('--pretty')
    .action((opts) => {
      const accountId = opts.account ? resolveAccount(opts.account).id : undefined
      const categoryId = opts.category ? resolveCategory(opts.category).id : undefined
      const filters = {
        accountId,
        categoryId,
        from: opts.from,
        to: opts.to,
        statementPeriod: opts.statementPeriod,
        importBatch: opts.importBatch,
        search: opts.search,
      }

      if (opts.aggregateBy && opts.stats) {
        throw new AppError('VALIDATION_ERROR', 'cannot combine --aggregate-by and --stats')
      }

      if (opts.stats) {
        success(statsTransactions(filters))
        return
      }

      if (opts.aggregateBy) {
        if (!aggregateDimensions.includes(opts.aggregateBy)) {
          throw new AppError(
            'VALIDATION_ERROR',
            `aggregate-by must be one of: ${aggregateDimensions.join(', ')}`,
          )
        }
        const buckets = aggregateTransactions(filters, opts.aggregateBy)
        if (isPretty(opts)) {
          prettyTable(
            ['key', 'total', 'count'],
            buckets.map((b) => [b.key, b.total, b.count]),
          )
        } else {
          success(buckets)
        }
        return
      }

      const list = listTransactions({ ...filters, limit: opts.limit })
      if (isPretty(opts)) {
        prettyTable(
          ['id', 'account', 'amount', 'description', 'occurred_at', 'category'],
          list.map((t) => [
            t.id,
            t.accountId,
            t.amount,
            t.description,
            t.occurredAt,
            t.categoryId ?? '',
          ]),
        )
      } else {
        success(list)
      }
    })

  cmd
    .command('get')
    .argument('<id>')
    .option('--pretty')
    .action((id) => {
      const t = getTransaction(id)
      if (!t) throw new AppError('NOT_FOUND', `transaction ${id} not found`)
      success(t)
    })

  cmd
    .command('update')
    .argument('<id>')
    .option('--amount <n>', 'amount in cents', Number)
    .option('--description <str>')
    .option('--category <id-or-name>')
    .option('--occurred-at <date>')
    .option('--statement-period <YYYY-MM>')
    .action((id, opts) => {
      if (opts.occurredAt && !occurredAtRe.test(opts.occurredAt)) {
        throw new AppError('VALIDATION_ERROR', 'occurred-at must be YYYY-MM-DD')
      }
      if (opts.statementPeriod && !periodRe.test(opts.statementPeriod)) {
        throw new AppError('VALIDATION_ERROR', 'statement-period must be YYYY-MM')
      }
      const categoryId = opts.category ? resolveCategory(opts.category).id : undefined
      const updated = updateTransaction(id, {
        amount: opts.amount,
        description: opts.description,
        categoryId,
        occurredAt: opts.occurredAt,
        statementPeriod: opts.statementPeriod,
      })
      success(updated)
    })

  cmd
    .command('delete')
    .argument('<id>')
    .action((id) => {
      deleteTransaction(id)
      success({ id, deleted: true })
    })

  cmd
    .command('batch-create')
    .requiredOption('--file <path>')
    .action((opts) => {
      let raw: unknown
      try {
        raw = JSON.parse(fs.readFileSync(opts.file, 'utf8'))
      } catch {
        throw new AppError('VALIDATION_ERROR', `could not read or parse file: ${opts.file}`)
      }
      if (!Array.isArray(raw))
        throw new AppError('VALIDATION_ERROR', 'file must contain a JSON array')
      const rows = raw.map((item, i) => {
        const parsed = batchRowSchema.safeParse(item)
        if (!parsed.success) {
          throw new AppError('VALIDATION_ERROR', `row ${i}: ${parsed.error.issues[0].message}`)
        }
        return parsed.data
      })
      const accountIds = new Set(rows.map((r) => r.accountId))
      for (const id of accountIds) {
        if (!getAccount(id)) throw new AppError('NOT_FOUND', `account ${id} not found`)
      }
      const categoryIds = new Set(rows.map((r) => r.categoryId).filter((v): v is string => !!v))
      for (const id of categoryIds) {
        if (!getCategory(id)) throw new AppError('NOT_FOUND', `category ${id} not found`)
      }
      const result = batchCreateTransactions(rows)
      success(result)
    })
}
