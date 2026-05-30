import { eq, sql } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import * as schema from '../schema/index'
import { transactions } from '../schema/index'

// Merchant normalization: collapse the same payee across the many spellings a
// bank statement produces into one canonical, Title-Cased merchant string.
//
// The raw `description` stays verbatim; this derives the `merchant` column.
// Pipeline (order matters):
//   1. strip known prefixes (Nubank PIX, boleto, estorno) and the trailing
//      CPF/CNPJ/account identifier the PIX line carries,
//   2. strip importer/installment suffixes (` #2`, ` - Parcela N/M`),
//   3. apply the brand alias map (case-insensitive, post-cleanup),
//   4. Title Case the result.
//
// Keep this file the single home for merchant heuristics so every consumer
// (rules, reports, aggregations) shares one definition.

// Prefixes that wrap the real payee. Stripped case-insensitively, in order.
const PREFIXES = [
  /^transfer[êe]ncia enviada pelo pix\s*-\s*/i,
  /^transfer[êe]ncia recebida pelo pix\s*-\s*/i,
  /^pagamento de boleto efetuado\s*-\s*/i,
  /^compra no d[ée]bito\s*-\s*/i,
  /^estorno\s*-\s*/i,
]

// Trailing CPF/CNPJ or formatted document numbers the Nubank PIX line appends
// after the payee name, e.g. "Fulano de Tal 123.456.789-09" or "... 12345678000190".
const DOC_TAIL =
  /\s*-?\s*(\d{3}\.\d{3}\.\d{3}-\d{2}|\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\d{11,14})\s*$/

// Alias map keyed on the normalization key (see aliasKey): brand variants ->
// canonical merchant string (already in final form, returned verbatim).
const ALIASES: Record<string, string> = {
  applecombill: 'Apple.Com/Bill',
  'apple.com/bill': 'Apple.Com/Bill',
  'apple.com/bill.': 'Apple.Com/Bill',
  dmspotify: 'Spotify',
  spotify: 'Spotify',
}

// Collapse a string to a comparable alias key: drop spaces, punctuation that
// varies between spellings (`Dm*Spotify` vs `Dm *Spotify`), and casefold.
function aliasKey(s: string): string {
  return s.toLowerCase().replace(/[\s*]+/g, '')
}

function stripPrefixes(s: string): string {
  let out = s
  let changed = true
  while (changed) {
    changed = false
    for (const re of PREFIXES) {
      const next = out.replace(re, '')
      if (next !== out) {
        out = next
        changed = true
      }
    }
  }
  return out
}

// Strip installment (` - Parcela N/M`) and importer dedup (` #2`) suffixes,
// repeatedly so they collapse regardless of order or repetition.
function stripSuffixes(s: string): string {
  let out = s
  let prev: string
  do {
    prev = out
    out = out.replace(/\s*-\s*parcela\s+\d+\s*\/\s*\d+\s*$/i, '').replace(/\s+#\d+\s*$/, '')
  } while (out !== prev)
  return out
}

// Title Case the canonical form: capitalize the first letter of each word while
// preserving embedded punctuation. Lowercases the rest so SCREAMING text folds.
// Uses a Unicode-aware boundary (a letter not preceded by a letter/number) so
// accented words title-case correctly, e.g. "PÃO DE AÇÚCAR" -> "Pão De Açúcar"
// instead of the broken "\b"-based result "Pão De AçúCar".
function titleCase(s: string): string {
  return s.toLowerCase().replace(/(?<![\p{L}\p{N}])\p{L}/gu, (c) => c.toUpperCase())
}

/**
 * Derive the canonical merchant for a raw description. Returns null when the
 * cleanup leaves nothing (e.g. an empty or all-punctuation description), so the
 * column stays nullable rather than storing a meaningless empty string.
 */
export function normalizeMerchant(description: string): string | null {
  let s = description.trim()
  s = stripPrefixes(s).trim()
  s = stripSuffixes(s).trim()
  s = s.replace(DOC_TAIL, '').trim()
  if (!s) return null

  const alias = ALIASES[aliasKey(s)]
  if (alias) return alias

  return titleCase(s)
}

/**
 * Populate the `merchant` column for rows that don't yet have it. The migration
 * only adds the nullable column (pure-SQL Title-Casing + alias handling isn't
 * practical in SQLite), so this JS-driven pass runs right after migrate() to
 * derive merchant from description. It only fills rows where `merchant IS NULL`;
 * it does not re-normalize rows that already have a merchant, so a later change
 * to `normalizeMerchant` will not retroactively rewrite already-populated rows
 * (re-deriving those would need an explicit re-normalize pass). This keeps a
 * fully-backfilled table doing no row work on startup.
 */
export function backfillMerchants(db: BetterSQLite3Database<typeof schema>): void {
  const rows = db
    .select({
      id: transactions.id,
      description: transactions.description,
      merchant: transactions.merchant,
    })
    .from(transactions)
    // Cheap guard so a fully-backfilled table does no row work on startup: only
    // visit rows that have never been normalized (merchant IS NULL).
    .where(sql`${transactions.merchant} is null`)
    .all()
  for (const row of rows) {
    const merchant = normalizeMerchant(row.description)
    if (merchant === null) continue
    db.update(transactions).set({ merchant }).where(eq(transactions.id, row.id)).run()
  }
}
