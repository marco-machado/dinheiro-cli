import { loadConfig } from './config'

export function success(data: unknown): void {
  process.stdout.write(JSON.stringify({ ok: true, data }) + '\n')
}

export function failure(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ ok: false, error, code }) + '\n')
}

export function isPretty(opts: { pretty?: boolean }): boolean {
  return !!(opts.pretty ?? loadConfig().pretty)
}

export function prettyTable(headers: string[], rows: (string | number | null)[][]): void {
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map(r => String(r[i] ?? '').length))
  )
  const divider = widths.map(w => '-'.repeat(w)).join('-+-')
  const fmt = (cells: (string | number | null)[]) =>
    cells.map((v, i) => String(v ?? '').padEnd(widths[i])).join(' | ')
  console.log(fmt(headers))
  console.log(divider)
  rows.forEach(row => console.log(fmt(row)))
}
