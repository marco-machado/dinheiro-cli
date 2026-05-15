import { initDb } from '../src/db'

export function setupTestDb() {
  return initDb(':memory:')
}
