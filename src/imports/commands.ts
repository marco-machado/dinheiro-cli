import { Command } from 'commander'
import fs from 'fs'
import path from 'path'
import { z } from 'zod'
import { AppError } from '../errors'
import { success, isPretty, prettyTable } from '../output'
import { getAccount } from '../accounts/db'
import { getCategory } from '../categories/db'
import { createImport, listImports, deleteImport } from './db'
import { parseNubank } from './parsers/nubank'
import type { ImportRow } from './types'

const canonicalRowSchema = z.object({
  amount: z.number().int(),
  description: z.string(),
  occurredAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  categoryId: z.string().optional(),
  statementPeriod: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
})

export function registerImports(program: Command): void {
  const cmd = program.command('imports')

  cmd
    .command('create')
    .requiredOption('--account <id>')
    .requiredOption('--file <path>')
    .option('--format <format>', 'canonical or nubank', 'canonical')
    .option('--dry-run', 'preview without writing')
    .option('--pretty')
    .action((opts) => {
      if (!getAccount(opts.account))
        throw new AppError('NOT_FOUND', `account ${opts.account} not found`)
      if (!['canonical', 'nubank'].includes(opts.format)) {
        throw new AppError('VALIDATION_ERROR', 'format must be canonical or nubank')
      }

      let rows: ImportRow[]
      const fileContent = (() => {
        try {
          return fs.readFileSync(opts.file, 'utf8')
        } catch {
          throw new AppError('VALIDATION_ERROR', `cannot read file: ${opts.file}`)
        }
      })()

      if (opts.format === 'nubank') {
        rows = parseNubank(fileContent)
      } else {
        let raw: unknown
        try {
          raw = JSON.parse(fileContent)
        } catch {
          throw new AppError('VALIDATION_ERROR', 'file must be valid JSON')
        }
        if (!Array.isArray(raw)) throw new AppError('VALIDATION_ERROR', 'file must be a JSON array')
        rows = raw.map((item, i) => {
          const r = canonicalRowSchema.safeParse(item)
          if (!r.success)
            throw new AppError('VALIDATION_ERROR', `row ${i}: ${r.error.issues[0].message}`)
          return r.data
        })
      }

      const categoryIds = new Set(rows.map((r) => r.categoryId).filter((v): v is string => !!v))
      for (const id of categoryIds) {
        if (!getCategory(id)) throw new AppError('NOT_FOUND', `category ${id} not found`)
      }

      const result = createImport({
        accountId: opts.account,
        format: opts.format as 'canonical' | 'nubank',
        filename: path.basename(opts.file),
        rows,
        dryRun: !!opts.dryRun,
      })
      success(result)
    })

  cmd
    .command('list')
    .option('--pretty')
    .action((opts) => {
      const list = listImports()
      if (isPretty(opts)) {
        prettyTable(
          ['id', 'filename', 'format', 'rows', 'created_at'],
          list.map((i) => [
            i.id,
            i.filename,
            i.format,
            i.rowCount,
            new Date(i.createdAt).toISOString(),
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
      deleteImport(id)
      success({ id, deleted: true })
    })
}
