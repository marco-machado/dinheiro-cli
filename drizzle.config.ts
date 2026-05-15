import { defineConfig } from 'drizzle-kit'
import path from 'path'
import os from 'os'

const defaultDb = process.env.DINHEIRO_DB
  ?? path.join(process.env.XDG_DATA_HOME ?? path.join(os.homedir(), '.local', 'share'), 'dinheiro', 'db.sqlite')

export default defineConfig({
  schema: './src/schema/index.ts',
  out: './migrations',
  dialect: 'sqlite',
  dbCredentials: { url: defaultDb },
})
