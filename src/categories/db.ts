import { eq } from 'drizzle-orm'
import { ulid } from 'ulid'
import { getDb } from '../db'
import { categories, transactions } from '../schema/index'
import { AppError } from '../errors'
import type { Category } from './types'

export function createCategory(data: { name: string }): Category {
  const db = getDb()
  const now = Date.now()
  const row = { id: ulid(), name: data.name, createdAt: now, updatedAt: now }
  db.insert(categories).values(row).run()
  return row
}

export function getCategory(id: string): Category | undefined {
  const db = getDb()
  return db.select().from(categories).where(eq(categories.id, id)).get() as Category | undefined
}

export function listCategories(): Category[] {
  const db = getDb()
  return db.select().from(categories).all() as Category[]
}

export function updateCategory(id: string, name: string): Category {
  const db = getDb()
  db.update(categories).set({ name, updatedAt: Date.now() }).where(eq(categories.id, id)).run()
  return getCategory(id)!
}

export function deleteCategory(id: string): void {
  const db = getDb()
  const used = db
    .select({ id: transactions.id })
    .from(transactions)
    .where(eq(transactions.categoryId, id))
    .get()
  if (used) throw new AppError('CONFLICT', `category ${id} has associated transactions`)
  db.delete(categories).where(eq(categories.id, id)).run()
}
