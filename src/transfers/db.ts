import { eq, and, gte, lte, isNotNull } from 'drizzle-orm'
import { ulid } from 'ulid'
import { getDb } from '../db'
import { transactions } from '../schema/index'
import { AppError } from '../errors'
import { createTransaction } from '../transactions/db'
import type { TransferResult } from './types'

export function createTransfer(data: {
  fromAccountId: string
  toAccountId: string
  amount: number
  occurredAt: string
  description?: string
}): TransferResult {
  const db = getDb()
  const transferId = ulid()
  const description = data.description ?? 'Transfer'
  const sqlite = (db as any).session.client as import('better-sqlite3').Database
  sqlite.transaction(() => {
    createTransaction({
      accountId: data.fromAccountId,
      amount: -data.amount,
      description,
      occurredAt: data.occurredAt,
      transferId,
    })
    createTransaction({
      accountId: data.toAccountId,
      amount: data.amount,
      description,
      occurredAt: data.occurredAt,
      transferId,
    })
  })()
  return {
    transferId,
    fromAccountId: data.fromAccountId,
    toAccountId: data.toAccountId,
    amount: data.amount,
    occurredAt: data.occurredAt,
    description,
  }
}

export interface TransferFilters {
  accountId?: string
  from?: string
  to?: string
}

export function listTransfers(filters: TransferFilters): TransferResult[] {
  const db = getDb()
  const conditions = [isNotNull(transactions.transferId)]
  if (filters.from) conditions.push(gte(transactions.occurredAt, filters.from))
  if (filters.to) conditions.push(lte(transactions.occurredAt, filters.to))

  const rows = db.select().from(transactions).where(and(...conditions)).all()

  const seen = new Map<string, TransferResult>()
  for (const row of rows) {
    if (!row.transferId || seen.has(row.transferId)) continue
    const pair = rows.filter(r => r.transferId === row.transferId)
    const outRow = pair.find(r => r.amount < 0)
    const inRow = pair.find(r => r.amount > 0)
    if (!outRow || !inRow) continue
    if (filters.accountId && outRow.accountId !== filters.accountId && inRow.accountId !== filters.accountId) continue
    seen.set(row.transferId, {
      transferId: row.transferId,
      fromAccountId: outRow.accountId,
      toAccountId: inRow.accountId,
      amount: inRow.amount,
      occurredAt: row.occurredAt,
      description: row.description,
    })
  }
  return Array.from(seen.values())
}

export function deleteTransfer(transferId: string): void {
  const db = getDb()
  const rows = db.select().from(transactions).where(eq(transactions.transferId, transferId)).all()
  if (rows.length === 0) throw new AppError('NOT_FOUND', `transfer ${transferId} not found`)
  const sqlite = (db as any).session.client as import('better-sqlite3').Database
  sqlite.transaction(() => {
    db.delete(transactions).where(eq(transactions.transferId, transferId)).run()
  })()
}
