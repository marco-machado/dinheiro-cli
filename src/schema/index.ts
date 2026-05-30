import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'

export const accounts = sqliteTable('accounts', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  nameNormalized: text('name_normalized').notNull().unique(),
  type: text('type', { enum: ['checking', 'credit_card'] }).notNull(),
  closeDay: integer('close_day'),
  dueDay: integer('due_day'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export const categories = sqliteTable('categories', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  nameNormalized: text('name_normalized').notNull().unique(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export const rules = sqliteTable(
  'rules',
  {
    id: text('id').primaryKey(),
    match: text('match').notNull(),
    amounts: text('amounts'),
    daysOfMonth: text('days_of_month'),
    accountId: text('account_id').references(() => accounts.id),
    categoryId: text('category_id')
      .notNull()
      .references(() => categories.id),
    priority: integer('priority').notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => ({
    priorityIdx: index('rules_priority_idx').on(t.priority),
  }),
)

export const imports = sqliteTable('imports', {
  id: text('id').primaryKey(),
  accountId: text('account_id')
    .notNull()
    .references(() => accounts.id),
  format: text('format', { enum: ['canonical', 'nubank'] }).notNull(),
  filename: text('filename').notNull(),
  rowCount: integer('row_count').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export const transactions = sqliteTable(
  'transactions',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id),
    amount: integer('amount').notNull(),
    description: text('description').notNull(),
    merchant: text('merchant'),
    occurredAt: text('occurred_at').notNull(),
    categoryId: text('category_id').references(() => categories.id),
    statementPeriod: text('statement_period'),
    transferId: text('transfer_id'),
    importBatchId: text('import_batch_id').references(() => imports.id),
    rowHash: text('row_hash').unique(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => ({
    accountIdIdx: index('tx_account_id_idx').on(t.accountId),
    occurredAtIdx: index('tx_occurred_at_idx').on(t.occurredAt),
    categoryIdIdx: index('tx_category_id_idx').on(t.categoryId),
    merchantIdx: index('tx_merchant_idx').on(t.merchant),
    statementPeriodIdx: index('tx_statement_period_idx').on(t.statementPeriod),
    transferIdIdx: index('tx_transfer_id_idx').on(t.transferId),
    importBatchIdIdx: index('tx_import_batch_id_idx').on(t.importBatchId),
    accountOccurredIdx: index('tx_account_occurred_idx').on(t.accountId, t.occurredAt),
  }),
)
