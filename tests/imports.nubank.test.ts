import { describe, it, expect } from 'vitest'
import { parseNubank } from '../src/imports/parsers/nubank'
import fs from 'fs'
import path from 'path'

const sample = fs.readFileSync(path.join(__dirname, 'fixtures/nubank-sample.csv'), 'utf8')

describe('nubank parser', () => {
  it('parses all rows', () => {
    const rows = parseNubank(sample)
    expect(rows).toHaveLength(4)
  })

  it('converts decimal BRL amounts to cents', () => {
    const rows = parseNubank(sample)
    const ifood = rows.find(r => r.description === 'iFood')!
    expect(ifood.amount).toBe(-4590)
  })

  it('maps positive amounts as income', () => {
    const rows = parseNubank(sample)
    const payment = rows.find(r => r.description === 'Pagamento recebido')!
    expect(payment.amount).toBe(50000)
  })

  it('uses date as occurredAt', () => {
    const rows = parseNubank(sample)
    expect(rows[0].occurredAt).toBe('2026-05-15')
  })

  it('throws on malformed CSV', () => {
    expect(() => parseNubank('not,a,valid\ncsv,row')).toThrow()
  })

  it('handles empty file', () => {
    expect(parseNubank('Data,Categoria,Título,Valor\n')).toHaveLength(0)
  })

  it('handles quoted fields with embedded commas', () => {
    const csv = `Data,Categoria,Título,Valor\n2026-05-15,Food,"Mercado, padaria",-45.90`
    const rows = parseNubank(csv)
    expect(rows).toHaveLength(1)
    expect(rows[0].description).toBe('Mercado, padaria')
    expect(rows[0].amount).toBe(-4590)
  })

  it('handles escaped double-quotes inside quoted fields', () => {
    const csv = `Data,Categoria,Título,Valor\n2026-05-15,Food,"He said ""hi""",-10.00`
    const rows = parseNubank(csv)
    expect(rows[0].description).toBe('He said "hi"')
  })
})
