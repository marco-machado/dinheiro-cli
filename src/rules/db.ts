import { eq, asc } from 'drizzle-orm'
import { ulid } from 'ulid'
import { getDb } from '../db'
import { rules } from '../schema/index'
import { AppError } from '../errors'
import { listTransactions, updateTransaction } from '../transactions/db'
import type { Rule, RuleInput, RuleMatchInput } from './types'

function toRule(row: Record<string, unknown>): Rule {
  return {
    id: row.id as string,
    match: row.match as string,
    amounts: row.amounts ? (JSON.parse(row.amounts as string) as number[]) : null,
    daysOfMonth: row.daysOfMonth ? (JSON.parse(row.daysOfMonth as string) as number[]) : null,
    accountId: (row.accountId as string | null) ?? null,
    categoryId: row.categoryId as string,
    priority: row.priority as number,
    createdAt: row.createdAt as number,
    updatedAt: row.updatedAt as number,
  }
}

function nextPriority(): number {
  const db = getDb()
  const rows = db.select({ priority: rules.priority }).from(rules).all()
  if (rows.length === 0) return 1
  return Math.max(...rows.map((r) => r.priority)) + 1
}

export function createRule(data: RuleInput): Rule {
  const db = getDb()
  const now = Date.now()
  // An empty match would make includes('') a catch-all matching every transaction.
  const match = data.match.trim()
  if (!match) throw new AppError('VALIDATION_ERROR', 'match must be a non-empty substring')
  const row = {
    id: ulid(),
    match,
    amounts: data.amounts && data.amounts.length ? JSON.stringify(data.amounts) : null,
    daysOfMonth:
      data.daysOfMonth && data.daysOfMonth.length ? JSON.stringify(data.daysOfMonth) : null,
    accountId: data.accountId ?? null,
    categoryId: data.categoryId,
    priority: data.priority ?? nextPriority(),
    createdAt: now,
    updatedAt: now,
  }
  db.insert(rules).values(row).run()
  return toRule(row)
}

export function getRule(id: string): Rule | undefined {
  const db = getDb()
  const row = db.select().from(rules).where(eq(rules.id, id)).get()
  return row ? toRule(row) : undefined
}

// Rules in evaluation order: explicit priority ascending, ties broken by creation order.
export function listRules(): Rule[] {
  const db = getDb()
  return db
    .select()
    .from(rules)
    .orderBy(asc(rules.priority), asc(rules.createdAt), asc(rules.id))
    .all()
    .map(toRule)
}

export function deleteRule(id: string): void {
  const db = getDb()
  const existing = db.select({ id: rules.id }).from(rules).where(eq(rules.id, id)).get()
  if (!existing) throw new AppError('NOT_FOUND', `rule ${id} not found`)
  db.delete(rules).where(eq(rules.id, id)).run()
}

// True when every clause present on the rule is satisfied by the transaction.
// Amount matching is sign-insensitive: a rule listing 29990 matches an expense
// of -29990, since rules are written as price magnitudes.
function ruleMatches(rule: Rule, tx: RuleMatchInput): boolean {
  if (!tx.description.toLowerCase().includes(rule.match.toLowerCase())) return false
  if (rule.amounts && rule.amounts.length) {
    const abs = Math.abs(tx.amount)
    if (!rule.amounts.some((a) => Math.abs(a) === abs)) return false
  }
  if (rule.daysOfMonth && rule.daysOfMonth.length) {
    const day = Number(tx.occurredAt.slice(8, 10))
    if (!rule.daysOfMonth.includes(day)) return false
  }
  if (rule.accountId && rule.accountId !== tx.accountId) return false
  return true
}

// First-match-wins in declaration order. Pass a preloaded list to avoid a
// per-row query when applying across many transactions.
export function matchRule(tx: RuleMatchInput, preloaded?: Rule[]): Rule | null {
  const list = preloaded ?? listRules()
  for (const rule of list) {
    if (ruleMatches(rule, tx)) return rule
  }
  return null
}

export interface ApplyScope {
  importBatch?: string
  from?: string // YYYY-MM or YYYY-MM-DD
  to?: string // YYYY-MM or YYYY-MM-DD
  accountId?: string
  dryRun?: boolean
}

export interface ApplyResult {
  scanned: number
  matched: number
  updated: number
}

// A YYYY-MM bound is widened to span the whole month so date comparisons on
// occurredAt (YYYY-MM-DD) include every day of that month.
function normalizeBound(value: string | undefined, edge: 'start' | 'end'): string | undefined {
  if (!value) return undefined
  if (/^\d{4}-\d{2}$/.test(value)) return edge === 'start' ? `${value}-01` : `${value}-31`
  return value
}

// Re-run the rules over already-imported transactions within a scope and
// recategorize the ones a rule now matches. Transfer rows are never touched.
export function applyRules(scope: ApplyScope): ApplyResult {
  if (!scope.importBatch && (!scope.from || !scope.to)) {
    throw new AppError('VALIDATION_ERROR', 'apply requires --import-batch or both --from and --to')
  }
  const list = listRules()
  const txs = listTransactions({
    importBatch: scope.importBatch,
    from: normalizeBound(scope.from, 'start'),
    to: normalizeBound(scope.to, 'end'),
    accountId: scope.accountId,
  }).filter((t) => t.transferId === null)

  let matched = 0
  let updated = 0
  for (const tx of txs) {
    const rule = matchRule(tx, list)
    if (!rule) continue
    matched++
    if (rule.categoryId === tx.categoryId) continue
    updated++
    if (!scope.dryRun) updateTransaction(tx.id, { categoryId: rule.categoryId })
  }

  return { scanned: txs.length, matched, updated }
}
