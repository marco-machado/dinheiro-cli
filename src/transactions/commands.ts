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
  updateTransaction,
  deleteTransaction,
  batchCreateTransactions,
  categorizeTransactions,
} from './db'

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
    .option('--amount <n>', 'exact amount in cents (signed)', Number)
    .option('--amount-in <n,n,...>', 'comma list of exact amounts in cents')
    .option('--limit <n>', 'max rows', Number)
    .option('--pretty')
    .action((opts) => {
      const accountId = opts.account ? resolveAccount(opts.account).id : undefined
      const categoryId = opts.category ? resolveCategory(opts.category).id : undefined
      const amountIn = opts.amountIn
        ? String(opts.amountIn)
            .split(',')
            .map((s) => s.trim())
            .filter((s) => s.length)
            .map(Number)
        : undefined
      const list = listTransactions({
        accountId,
        categoryId,
        from: opts.from,
        to: opts.to,
        statementPeriod: opts.statementPeriod,
        importBatch: opts.importBatch,
        search: opts.search,
        amount: opts.amount,
        amountIn,
        limit: opts.limit,
      })
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
    .command('categorize')
    .description('bulk-set the category of every transaction matching the filters')
    .requiredOption('--category <id-or-name>', 'target category to apply')
    .option('--account <id-or-name>')
    .option('--from <date>')
    .option('--to <date>')
    .option('--statement-period <YYYY-MM>')
    .option('--import-batch <id>')
    .option('--search <str>')
    .option('--amount <n>', 'exact amount in cents (signed)', Number)
    .option('--amount-in <n,n,...>', 'comma list of exact amounts in cents')
    .option('--ids <id1,id2,...>', "comma list of ids, or '-' to read ids from stdin")
    .option('--dry-run', 'preview the matched set and resulting count without mutating')
    .option('--pretty')
    .action((opts) => {
      const category = resolveCategory(opts.category)
      const accountId = opts.account ? resolveAccount(opts.account).id : undefined

      if (opts.amount !== undefined && !Number.isInteger(opts.amount)) {
        throw new AppError('VALIDATION_ERROR', 'amount must be an integer (cents)')
      }

      let amountIn: number[] | undefined
      if (opts.amountIn !== undefined) {
        amountIn = String(opts.amountIn)
          .split(',')
          .map((s) => s.trim())
          .filter((s) => s.length)
          .map((s) => {
            const n = Number(s)
            if (!Number.isInteger(n)) {
              throw new AppError(
                'VALIDATION_ERROR',
                `amount-in values must be integers (cents): ${s}`,
              )
            }
            return n
          })
        if (!amountIn.length) amountIn = undefined
      }

      let ids: string[] | undefined
      if (opts.ids !== undefined) {
        const raw = opts.ids === '-' ? fs.readFileSync(0, 'utf8') : String(opts.ids)
        ids = raw
          .split(/[\s,]+/)
          .map((s) => s.trim())
          .filter((s) => s.length)
        if (!ids.length) {
          throw new AppError('VALIDATION_ERROR', 'no ids provided')
        }
      }

      const hasSelection =
        accountId ||
        opts.from ||
        opts.to ||
        opts.statementPeriod ||
        opts.importBatch ||
        opts.search ||
        opts.amount !== undefined ||
        amountIn ||
        ids
      if (!hasSelection) {
        throw new AppError(
          'VALIDATION_ERROR',
          'at least one filter or --ids is required to categorize',
        )
      }

      const result = categorizeTransactions(
        {
          accountId,
          from: opts.from,
          to: opts.to,
          statementPeriod: opts.statementPeriod,
          importBatch: opts.importBatch,
          search: opts.search,
          amount: opts.amount,
          amountIn,
          ids,
        },
        category.id,
        !!opts.dryRun,
      )

      if (isPretty(opts)) {
        prettyTable(
          ['id', 'account', 'amount', 'description', 'occurred_at', 'category'],
          result.transactions.map((t) => [
            t.id,
            t.accountId,
            t.amount,
            t.description,
            t.occurredAt,
            t.categoryId ?? '',
          ]),
        )
      } else {
        success(result)
      }
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
