import Database from 'better-sqlite3'
import { drizzle, BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from './schema/index'
import { loadConfig } from './config'
import path from 'path'
import fs from 'fs'
import os from 'os'

type Db = BetterSQLite3Database<typeof schema>

let _db: Db | null = null
let _sqlite: Database.Database | null = null

export function initDb(dbPath?: string): Db {
  if (_sqlite) {
    _sqlite.close()
    _sqlite = null
    _db = null
  }

  const config = loadConfig()
  const xdgData = process.env.XDG_DATA_HOME ?? path.join(os.homedir(), '.local', 'share')
  const defaultPath =
    process.env.DINHEIRO_DB ?? config.db ?? path.join(xdgData, 'dinheiro', 'db.sqlite')

  const resolved = dbPath ?? defaultPath

  if (resolved !== ':memory:') {
    fs.mkdirSync(path.dirname(resolved), { recursive: true })
  }

  const sqlite = new Database(resolved)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')

  const db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder: path.resolve(__dirname, '../migrations') })

  _sqlite = sqlite
  _db = db
  return db
}

export function getDb(): Db {
  if (!_db) throw new Error('DB not initialized. Call initDb() first.')
  return _db
}

export function closeDb(): void {
  if (_sqlite) {
    _sqlite.close()
    _sqlite = null
    _db = null
  }
}

export function rawSqlite(db: Db): Database.Database {
  return (db as unknown as { session: { client: Database.Database } }).session.client
}
