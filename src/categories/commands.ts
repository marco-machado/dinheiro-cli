import { Command } from 'commander'
import { AppError } from '../errors'
import { success, isPretty, prettyTable } from '../output'
import { createCategory, getCategory, listCategories, updateCategory, deleteCategory } from './db'

export function registerCategories(program: Command): void {
  const cmd = program.command('categories')

  cmd
    .command('create')
    .requiredOption('--name <str>', 'category name')
    .option('--pretty')
    .action((opts) => {
      const cat = createCategory({ name: opts.name })
      if (isPretty(opts)) {
        prettyTable(['id', 'name'], [[cat.id, cat.name]])
      } else {
        success(cat)
      }
    })

  cmd
    .command('list')
    .option('--pretty')
    .action((opts) => {
      const list = listCategories()
      if (isPretty(opts)) {
        prettyTable(
          ['id', 'name'],
          list.map((c) => [c.id, c.name]),
        )
      } else {
        success(list)
      }
    })

  cmd
    .command('update')
    .argument('<id>')
    .requiredOption('--name <str>', 'new name')
    .action((id, opts) => {
      if (!getCategory(id)) throw new AppError('NOT_FOUND', `category ${id} not found`)
      success(updateCategory(id, opts.name))
    })

  cmd
    .command('delete')
    .argument('<id>')
    .action((id) => {
      if (!getCategory(id)) throw new AppError('NOT_FOUND', `category ${id} not found`)
      deleteCategory(id)
      success({ id, deleted: true })
    })
}
