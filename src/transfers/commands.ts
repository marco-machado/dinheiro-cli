import { Command } from 'commander'
import { AppError } from '../errors'
import { success, isPretty, prettyTable } from '../output'
import { resolveAccount } from '../accounts/db'
import { createTransfer, listTransfers, deleteTransfer } from './db'

export function registerTransfers(program: Command): void {
  const cmd = program.command('transfers')

  cmd
    .command('create')
    .requiredOption('--from <id-or-name>')
    .requiredOption('--to <id-or-name>')
    .requiredOption('--amount <n>', 'positive amount in cents', Number)
    .requiredOption('--occurred-at <date>')
    .option('--description <str>')
    .option('--pretty')
    .action((opts) => {
      if (opts.amount <= 0)
        throw new AppError('VALIDATION_ERROR', 'amount must be a positive integer')
      const from = resolveAccount(opts.from)
      const to = resolveAccount(opts.to)
      const result = createTransfer({
        fromAccountId: from.id,
        toAccountId: to.id,
        amount: opts.amount,
        occurredAt: opts.occurredAt,
        description: opts.description,
      })
      success(result)
    })

  cmd
    .command('list')
    .option('--account <id-or-name>')
    .option('--from <date>')
    .option('--to <date>')
    .option('--pretty')
    .action((opts) => {
      const accountId = opts.account ? resolveAccount(opts.account).id : undefined
      const list = listTransfers({ accountId, from: opts.from, to: opts.to })
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
