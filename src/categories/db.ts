import { eq } from 'drizzle-orm'
import { ulid } from 'ulid'
import { getDb } from '../db'
import { categories, transactions } from '../schema/index'
import { AppError } from '../errors'
import { normalizeName, resolveByNameOrId } from '../resolve'
import type { Category } from './types'

function translateWriteError(err: unknown): AppError {
  const e = err as { code?: string; message?: string }
  if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
    return new AppError('CONFLICT', 'Category name already exists')
  }
  return new AppError('DB_ERROR', e.message ?? 'Database operation failed')
}

export function createCategory(data: { name: string }): Category {
  const db = getDb()
  const now = Date.now()
  const row = {
    id: ulid(),
    name: data.name,
    nameNormalized: normalizeName(data.name),
    createdAt: now,
    updatedAt: now,
  }
  try {
    db.insert(categories).values(row).run()
  } catch (err) {
    throw translateWriteError(err)
  }
  return row
}

export function getCategory(id: string): Category | undefined {
  const db = getDb()
  return db.select().from(categories).where(eq(categories.id, id)).get() as Category | undefined
}

function getCategoryByNormalizedName(normalized: string): Category | undefined {
  const db = getDb()
  return db.select().from(categories).where(eq(categories.nameNormalized, normalized)).get() as
    | Category
    | undefined
}

export function resolveCategory(value: string): Category {
  return resolveByNameOrId(value, 'category', getCategory, getCategoryByNormalizedName)
}

export function listCategories(): Category[] {
  const db = getDb()
  return db.select().from(categories).all() as Category[]
}

export function updateCategory(id: string, name: string): Category {
  const db = getDb()
  try {
    db.update(categories)
      .set({ name, nameNormalized: normalizeName(name), updatedAt: Date.now() })
      .where(eq(categories.id, id))
      .run()
  } catch (err) {
    throw translateWriteError(err)
  }
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
