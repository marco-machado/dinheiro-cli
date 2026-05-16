import { AppError } from '../../errors'
import type { ImportRow } from '../types'

const REQUIRED_HEADERS = ['Data', 'Categoria', 'Título', 'Valor']

function parseCsvLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  result.push(current)
  return result
}

export function parseNubank(csvContent: string): ImportRow[] {
  const lines = csvContent
    .trim()
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  if (lines.length === 0) return []

  const headers = parseCsvLine(lines[0]).map((h) => h.trim())
  for (const required of REQUIRED_HEADERS) {
    if (!headers.includes(required)) {
      throw new AppError('VALIDATION_ERROR', `Nubank CSV missing required column: ${required}`)
    }
  }

  const idx = {
    date: headers.indexOf('Data'),
    category: headers.indexOf('Categoria'),
    title: headers.indexOf('Título'),
    value: headers.indexOf('Valor'),
  }

  return lines.slice(1).map((line, i) => {
    const cols = parseCsvLine(line).map((c) => c.trim())
    const dateStr = cols[idx.date]
    const title = cols[idx.title]
    const valueStr = cols[idx.value]

    if (!dateStr || !title || !valueStr) {
      throw new AppError('VALIDATION_ERROR', `Nubank CSV row ${i + 2}: missing required fields`)
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      throw new AppError('VALIDATION_ERROR', `Nubank CSV row ${i + 2}: invalid date "${dateStr}"`)
    }

    const valueFloat = parseFloat(valueStr)
    if (isNaN(valueFloat)) {
      throw new AppError(
        'VALIDATION_ERROR',
        `Nubank CSV row ${i + 2}: invalid amount "${valueStr}"`,
      )
    }

    const amount = Math.round(valueFloat * 100)

    return {
      occurredAt: dateStr,
      description: title,
      amount,
      categoryId: undefined,
    } satisfies ImportRow
  })
}
