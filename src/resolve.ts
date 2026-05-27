import { AppError } from './errors'

const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/i

export const isUlid = (s: string) => ULID_RE.test(s)

// NFD + strip combining marks folds "Saúde"/"SAUDE"/"saude" to the same key.
export const normalizeName = (s: string) =>
  s.trim().normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('pt-BR')

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
