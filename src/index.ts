#!/usr/bin/env node
import { Command, CommanderError } from 'commander'
import { AppError } from './errors'
import { failure } from './output'
import { initDb } from './db'
import { registerAccounts } from './accounts/commands'
import { registerCategories } from './categories/commands'
import { registerTransactions } from './transactions/commands'
import { registerTransfers } from './transfers/commands'
import { registerReports } from './reports/commands'
import { registerImports } from './imports/commands'

const program = new Command()

program
  .name('dinheiro')
  .description('Personal finance CLI')
  .version('0.1.0')
  .exitOverride()
  .configureOutput({ writeErr: () => {} })

function resolveDbPath(): string | undefined {
  return process.env.DINHEIRO_DB
}

program.hook('preAction', () => {
  initDb(resolveDbPath())
})

registerAccounts(program)
registerCategories(program)
registerTransactions(program)
registerTransfers(program)
registerReports(program)
registerImports(program)

async function main() {
  try {
    await program.parseAsync()
  } catch (err) {
    if (err instanceof AppError) {
      failure(err.message, err.code)
      process.exit(1)
    }
    if (err instanceof CommanderError) {
      // Help/version are not errors — Commander throws them because of exitOverride().
      // Let them exit cleanly without emitting a JSON error envelope.
      if (
        err.code === 'commander.helpDisplayed' ||
        err.code === 'commander.version' ||
        err.exitCode === 0
      ) {
        process.exit(0)
      }
      failure(err.message, 'VALIDATION_ERROR')
      process.exit(1)
    }
    failure(err instanceof Error ? err.message : String(err), 'INTERNAL')
    process.exit(1)
  }
}

main()
