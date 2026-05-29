import { describe, it, expect, beforeEach } from 'vitest'
import { setupTestDb } from './helpers'
import {
  createCategory,
  getCategory,
  listCategories,
  updateCategory,
  deleteCategory,
  resolveCategory,
} from '../src/categories/db'
import { AppError } from '../src/errors'

beforeEach(() => {
  setupTestDb()
})

describe('categories', () => {
  it('creates a category', () => {
    const c = createCategory({ name: 'food' })
    expect(c.name).toBe('food')
  })

  it('lists categories', () => {
    createCategory({ name: 'food' })
    createCategory({ name: 'transport' })
    expect(listCategories()).toHaveLength(2)
  })

  it('gets category by id', () => {
    const c = createCategory({ name: 'health' })
    expect(getCategory(c.id)?.name).toBe('health')
  })

  it('returns undefined for unknown id', () => {
    expect(getCategory('none')).toBeUndefined()
  })

  it('updates category name', () => {
    const c = createCategory({ name: 'old' })
    const updated = updateCategory(c.id, 'dining')
    expect(updated.name).toBe('dining')
  })

  it('deletes category with no transactions', () => {
    const c = createCategory({ name: 'temp' })
    deleteCategory(c.id)
    expect(getCategory(c.id)).toBeUndefined()
  })

  it('rejects a case-variant duplicate name with CONFLICT', () => {
    createCategory({ name: 'Healthcare' })
    expect(() => createCategory({ name: 'healthcare' })).toThrow(
      new AppError('CONFLICT', 'Category name already exists'),
    )
  })

  it('rejects an accent-variant duplicate name with CONFLICT', () => {
    createCategory({ name: 'Saúde' })
    expect(() => createCategory({ name: 'SAUDE' })).toThrow(
      new AppError('CONFLICT', 'Category name already exists'),
    )
  })

  it('rejects renaming to a case-variant of an existing name with CONFLICT', () => {
    createCategory({ name: 'Food' })
    const other = createCategory({ name: 'Transport' })
    expect(() => updateCategory(other.id, 'food')).toThrow(
      new AppError('CONFLICT', 'Category name already exists'),
    )
  })
})

describe('resolveCategory', () => {
  it('returns the category when given a ULID', () => {
    const c = createCategory({ name: 'Health' })
    expect(resolveCategory(c.id).id).toBe(c.id)
  })

  it('returns the category when given the exact name', () => {
    const c = createCategory({ name: 'Health' })
    expect(resolveCategory('Health').id).toBe(c.id)
  })

  it('matches names case-insensitively', () => {
    const c = createCategory({ name: 'Healthcare' })
    expect(resolveCategory('HEALTHCARE').id).toBe(c.id)
    expect(resolveCategory('healthcare').id).toBe(c.id)
  })

  it('matches names with accents folded', () => {
    const c = createCategory({ name: 'Saúde' })
    expect(resolveCategory('saude').id).toBe(c.id)
    expect(resolveCategory('SAÚDE').id).toBe(c.id)
  })

  it('throws NOT_FOUND for an unknown name', () => {
    expect(() => resolveCategory('Nonexistent')).toThrow(AppError)
    try {
      resolveCategory('Nonexistent')
      expect.fail('expected resolveCategory to throw')
    } catch (e) {
      if (!(e instanceof AppError)) throw e
      expect(e.code).toBe('NOT_FOUND')
    }
  })

  it('throws NOT_FOUND for a well-formed ULID that does not exist', () => {
    expect(() => resolveCategory('01ARZ3NDEKTSV4RRFFQ69G5FAV')).toThrow(AppError)
    try {
      resolveCategory('01ARZ3NDEKTSV4RRFFQ69G5FAV')
      expect.fail('expected resolveCategory to throw')
    } catch (e) {
      if (!(e instanceof AppError)) throw e
      expect(e.code).toBe('NOT_FOUND')
    }
  })
})
