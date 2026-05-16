import { describe, it, expect, beforeEach } from 'vitest'
import { setupTestDb } from './helpers'
import {
  createCategory,
  getCategory,
  listCategories,
  updateCategory,
  deleteCategory,
} from '../src/categories/db'

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
})
