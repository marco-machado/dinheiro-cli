#!/usr/bin/env node
import { Command } from 'commander'
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

registerAccounts(program)
registerCategories(program)
registerTransactions(program)
registerTransfers(program)
registerReports(program)
registerImports(program)

try {
  initDb(resolveDbPath())
  program.parse()
} catch (err) {
  if (err instanceof AppError) {
    failure(err.message, err.code)
    process.exit(1)
  }
  const isCommanderError = err && typeof err === 'object' && 'code' in err && 'exitCode' in err
  if (isCommanderError) {
    const ce = err as { code: string; exitCode: number; message: string }
    // Help/version are not errors — Commander throws them because of exitOverride().
    // Let them exit cleanly without emitting a JSON error envelope.
    if (ce.code === 'commander.helpDisplayed' || ce.code === 'commander.version' || ce.exitCode === 0) {
      process.exit(0)
    }
    failure(ce.message, 'VALIDATION_ERROR')
    process.exit(1)
  }
  failure(err instanceof Error ? err.message : String(err), 'DB_ERROR')
  process.exit(1)
}
