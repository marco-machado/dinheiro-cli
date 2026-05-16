import { afterEach } from 'vitest'
import { initDb, closeDb } from '../src/db'

export function setupTestDb() {
  afterEach(() => {
    closeDb()
  })
  return initDb(':memory:')
}
