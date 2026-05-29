import { eq } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { AppError } from './errors'
import * as schema from './schema/index'
import { accounts, categories } from './schema/index'

const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/i

export const isUlid = (s: string) => ULID_RE.test(s)

// NFD + strip combining marks folds "Saúde"/"SAUDE"/"saude" to the same key.
export const normalizeName = (s: string) =>
  s.trim().normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('pt-BR')

// Replaces any name_normalized value that disagrees with normalizeName(name).
// The 0001 migration seeds name_normalized = id as a placeholder so the UNIQUE
// index can be created atomically; this runs right after migrate() to fill in
// the JS-computed values that lookups depend on. Idempotent — equal rows skip.
export function renormalizeNames(db: BetterSQLite3Database<typeof schema>): void {
  for (const table of [accounts, categories]) {
    const rows = db
      .select({ id: table.id, name: table.name, nameNormalized: table.nameNormalized })
      .from(table)
      .all()
    for (const row of rows) {
      const correct = normalizeName(row.name)
      if (row.nameNormalized === correct) continue
      try {
        db.update(table).set({ nameNormalized: correct }).where(eq(table.id, row.id)).run()
      } catch (err) {
        const e = err as { code?: string }
        if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
          throw new AppError(
            'CONFLICT',
            `cannot normalize "${row.name}": its normalized form "${correct}" collides with another row — rename one to resolve`,
          )
        }
        throw err
      }
    }
  }
}

export function resolveByNameOrId<T>(
  value: string,
  kind: 'account' | 'category',
  getById: (id: string) => T | undefined,
  getByNormalizedName: (normalized: string) => T | undefined,
): T {
  const row = isUlid(value) ? getById(value) : getByNormalizedName(normalizeName(value))
  if (!row) throw new AppError('NOT_FOUND', `${kind} not found: ${value}`)
  return row
}
