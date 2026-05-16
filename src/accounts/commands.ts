import { Command } from 'commander'
import { AppError } from '../errors'
import { success, isPretty, prettyTable } from '../output'
import { createAccount, getAccount, listAccounts, updateAccount, deleteAccount } from './db'

export function registerAccounts(program: Command): void {
  const cmd = program.command('accounts')

  cmd
    .command('create')
    .requiredOption('--name <str>', 'account name')
    .requiredOption('--type <type>', 'checking or credit_card')
    .option('--close-day <n>', 'statement close day (credit_card only)', Number)
    .option('--due-day <n>', 'payment due day (credit_card only)', Number)
    .option('--pretty', 'human-readable output')
    .action((opts) => {
      if (!['checking', 'credit_card'].includes(opts.type)) {
        throw new AppError('VALIDATION_ERROR', 'type must be checking or credit_card')
      }
      if (opts.type === 'checking' && (opts.closeDay != null || opts.dueDay != null)) {
        throw new AppError(
          'VALIDATION_ERROR',
          'close-day and due-day are only valid for credit_card accounts',
        )
      }
      const account = createAccount({
        name: opts.name,
        type: opts.type as 'checking' | 'credit_card',
        closeDay: opts.closeDay ?? null,
        dueDay: opts.dueDay ?? null,
      })
      if (isPretty(opts)) {
        prettyTable(
          ['id', 'name', 'type', 'close_day', 'due_day'],
          [[account.id, account.name, account.type, account.closeDay ?? '', account.dueDay ?? '']],
        )
      } else {
        success(account)
      }
    })

  cmd
    .command('list')
    .option('--pretty', 'human-readable output')
    .action((opts) => {
      const list = listAccounts()
      if (isPretty(opts)) {
        prettyTable(
          ['id', 'name', 'type', 'close_day', 'due_day'],
          list.map((a) => [a.id, a.name, a.type, a.closeDay ?? '', a.dueDay ?? '']),
        )
      } else {
        success(list)
      }
    })

  cmd
    .command('get')
    .argument('<id>')
    .option('--pretty', 'human-readable output')
    .action((id, opts) => {
      const account = getAccount(id)
      if (!account) throw new AppError('NOT_FOUND', `account ${id} not found`)
      if (isPretty(opts)) {
        prettyTable(
          ['id', 'name', 'type', 'close_day', 'due_day'],
          [[account.id, account.name, account.type, account.closeDay ?? '', account.dueDay ?? '']],
        )
      } else {
        success(account)
      }
    })

  cmd
    .command('update')
    .argument('<id>')
    .option('--name <str>', 'new name')
    .option('--close-day <n>', 'new close day', Number)
    .option('--due-day <n>', 'new due day', Number)
    .option('--pretty', 'human-readable output')
    .action((id, opts) => {
      const existing = getAccount(id)
      if (!existing) throw new AppError('NOT_FOUND', `account ${id} not found`)
      if (existing.type === 'checking' && (opts.closeDay != null || opts.dueDay != null)) {
        throw new AppError(
          'VALIDATION_ERROR',
          'close-day and due-day are only valid for credit_card accounts',
        )
      }
      const updated = updateAccount(id, {
        name: opts.name,
        closeDay: opts.closeDay,
        dueDay: opts.dueDay,
      })
      success(updated)
    })

  cmd
    .command('delete')
    .argument('<id>')
    .action((id) => {
      if (!getAccount(id)) throw new AppError('NOT_FOUND', `account ${id} not found`)
      deleteAccount(id)
      success({ id, deleted: true })
    })
}
