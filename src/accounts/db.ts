import { eq } from 'drizzle-orm'
import { ulid } from 'ulid'
import { getDb } from '../db'
import { accounts } from '../schema/index'
import { AppError } from '../errors'
import type { Account } from './types'

export function createAccount(data: {
  name: string
  type: 'checking' | 'credit_card'
  closeDay?: number | null
  dueDay?: number | null
}): Account {
  const db = getDb()
  const now = Date.now()
  const row = {
    id: ulid(),
    name: data.name,
    type: data.type,
    closeDay: data.closeDay ?? null,
    dueDay: data.dueDay ?? null,
    createdAt: now,
    updatedAt: now,
  }
  db.insert(accounts).values(row).run()
  return row
}

export function getAccount(id: string): Account | undefined {
  const db = getDb()
  return db.select().from(accounts).where(eq(accounts.id, id)).get() as Account | undefined
}

export function listAccounts(): Account[] {
  const db = getDb()
  return db.select().from(accounts).all() as Account[]
}

export function updateAccount(
  id: string,
  data: {
    name?: string
    closeDay?: number | null
    dueDay?: number | null
  },
): Account {
  const db = getDb()
  db.update(accounts)
    .set({ ...data, updatedAt: Date.now() })
    .where(eq(accounts.id, id))
    .run()
  return getAccount(id)!
}

export function deleteAccount(id: string): void {
  const db = getDb()
  try {
    db.delete(accounts).where(eq(accounts.id, id)).run()
  } catch (err: any) {
    // foreign_keys = ON means SQLite raises SQLITE_CONSTRAINT_FOREIGNKEY when transactions/imports reference this account.
    if (err?.code === 'SQLITE_CONSTRAINT_FOREIGNKEY' || /FOREIGN KEY/i.test(err?.message ?? '')) {
      throw new AppError('CONFLICT', `account ${id} has associated transactions or imports`)
    }
    throw err
  }
}
