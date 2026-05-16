import { afterEach } from 'vitest'
import { initDb, closeDb } from '../src/db'

afterEach(() => {
  closeDb()
})

export function setupTestDb() {
  return initDb(':memory:')
}
