import fs from 'fs'
import path from 'path'
import os from 'os'

interface Config {
  db?: string
  pretty?: boolean
  currencySymbol?: string
}

const DEFAULTS: Required<Config> = {
  db: defaultDbPath(),
  pretty: false,
  currencySymbol: 'R$',
}

function defaultDbPath(): string {
  const xdgData = process.env.XDG_DATA_HOME ?? path.join(os.homedir(), '.local', 'share')
  return path.join(xdgData, 'dinheiro', 'db.sqlite')
}

function configPath(): string {
  const xdgConfig = process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config')
  return process.env.DINHEIRO_CONFIG ?? path.join(xdgConfig, 'dinheiro', 'config.json')
}

let _config: Required<Config> | null = null

export function loadConfig(): Required<Config> {
  if (_config) return _config
  try {
    const raw = fs.readFileSync(configPath(), 'utf8')
    _config = { ...DEFAULTS, ...JSON.parse(raw) }
  } catch {
    _config = { ...DEFAULTS }
  }
  return _config!
}

export function resetConfig(): void {
  _config = null
}
