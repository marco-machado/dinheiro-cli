import { Command } from 'commander'
import { AppError } from '../errors'
import { success, isPretty, prettyTable } from '../output'
import { getAccount } from '../accounts/db'
import { createTransfer, listTransfers, deleteTransfer } from './db'

export function registerTransfers(program: Command): void {
  const cmd = program.command('transfers')

  cmd
    .command('create')
    .requiredOption('--from <account-id>')
    .requiredOption('--to <account-id>')
    .requiredOption('--amount <n>', 'positive amount in cents', Number)
    .requiredOption('--occurred-at <date>')
    .option('--description <str>')
    .option('--pretty')
    .action((opts) => {
      if (opts.amount <= 0)
        throw new AppError('VALIDATION_ERROR', 'amount must be a positive integer')
      if (!getAccount(opts.from)) throw new AppError('NOT_FOUND', `account ${opts.from} not found`)
      if (!getAccount(opts.to)) throw new AppError('NOT_FOUND', `account ${opts.to} not found`)
      const result = createTransfer({
        fromAccountId: opts.from,
        toAccountId: opts.to,
        amount: opts.amount,
        occurredAt: opts.occurredAt,
        description: opts.description,
      })
      success(result)
    })

  cmd
    .command('list')
    .option('--account <id>')
    .option('--from <date>')
    .option('--to <date>')
    .option('--pretty')
    .action((opts) => {
      const list = listTransfers({ accountId: opts.account, from: opts.from, to: opts.to })
      if (isPretty(opts)) {
        prettyTable(
          ['transfer_id', 'from', 'to', 'amount', 'date'],
          list.map((t) => [t.transferId, t.fromAccountId, t.toAccountId, t.amount, t.occurredAt]),
        )
      } else {
        success(list)
      }
    })

  cmd
    .command('delete')
    .argument('<transfer-id>')
    .action((transferId) => {
      deleteTransfer(transferId)
      success({ transferId, deleted: true })
    })
}
