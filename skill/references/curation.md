# Curating an existing database

This is the workflow that takes the most time in practice: after an import (or after a
while of logging), spending is miscategorized, and you need to **find the bad rows,
understand the pattern, and fix them in bulk** — without hand-editing one transaction at
a time.

The loop is: **report → drill → group → bulk-fix → persist a rule.**

For the exact field names of every payload below, see
[json-shape.md](json-shape.md). For the full flag list of `transactions list`, see the
[filter flag table](json-shape.md#transactions-list-filter-flags).

---

## 1. Find the suspicious category

Run the monthly report and look for a category that dominates unexpectedly, or for the
`(uncategorized)` bucket being large.

```bash
dinheiro reports monthly --month 2026-05
```

`byCategory` is sorted by spend; the first entry with a surprising `total` or `pct` is
your target. Note its `category` name.

You can also aggregate the whole table without picking a month:

```bash
# Which categories carry the most spend?
dinheiro transactions list --aggregate-by category
```

## 2. Drill into the category

List that category, optionally narrowing by date, then group mentally by payee. Use
`--search` to chase a specific merchant string.

```bash
# Everything in the category, most recent window
dinheiro transactions list --category "Shopping" --from 2026-05-01 --to 2026-05-31

# Chase a single merchant pattern
dinheiro transactions list --search "Amazon"
```

Let the tool do the grouping for you — `--aggregate-by merchant` collapses installment
suffixes (`- Parcela 1/3`) and dedup suffixes (`#2`) into one normalized payee key:

```bash
dinheiro transactions list --category "Shopping" --aggregate-by merchant
```

Each bucket is `{ key, total, count }`. A high `count` on one `key` is a recurring
merchant; a one-off large `total` with `count: 1` is often a transfer or an anomaly.

## 3. Separate recurring merchants from one-off transfers

Transfer legs have a non-null `transferId` and must **never** be edited or deleted
directly (use `transfers delete`). They are also automatically skipped by
`transactions categorize`. If a big line item turns out to be a transfer, leave it —
fix the account/category mix elsewhere.

Quick sanity check on a candidate set before you touch it:

```bash
dinheiro transactions list --search "Amazon" --stats
```

`{ count, sum, min, max, firstDate, lastDate }` tells you how many rows and how much
money the fix will move, at a glance.

## 4. Preview, then bulk-recategorize

`transactions categorize` reuses the exact same selection flags as
`transactions list`, so you can preview the match with `--dry-run` first, then drop the
flag to apply. At least one filter (or `--ids`) is required — it refuses to touch the
whole table.

```bash
# Preview: what would move, and how many?
dinheiro transactions categorize --category "Online Shopping" --search "Amazon" --dry-run

# Apply once the matched/skipped counts look right
dinheiro transactions categorize --category "Online Shopping" --search "Amazon"
```

The result reports `matched`, `skipped` (transfer legs left untouched), and `updated`.
If you curated the ids by hand (e.g. piped from a `list`), pass them directly:

```bash
dinheiro transactions list --search "Amazon" --limit 100 \
  | jq -r '.data[].id' \
  | dinheiro transactions categorize --category "Online Shopping" --ids -
```

`--ids -` reads ids from stdin, one per line.

## 5. Persist the pattern as a rule

So the next import categorizes the merchant automatically, save a rule. Rules run at
import time and can also be applied to existing rows.

```bash
# Create a rule: anything matching "Amazon" -> Online Shopping
dinheiro rules create --match "Amazon" --category "Online Shopping"

# Dry-run a rule against a hypothetical transaction before trusting it
dinheiro rules test --description "Amazon BR" --amount -9900

# Back-apply the rule set over existing transactions in a scope
dinheiro rules apply --from 2026-01-01
```

After this, re-running an import auto-categorizes matching rows (the
`imports create` result reports a `categorized` count), so the drill-and-fix loop gets
shorter every time you curate.

---

## Why bulk beats per-row edits

`transactions update <id>` is fine for a one-off correction, but a typical import
surfaces dozens of rows from the same merchant. Doing them one at a time is N calls and
N chances to miss one. The `list --aggregate-by merchant` → `categorize --search` →
`rules create` path collapses that into three calls and leaves a rule behind so you
never repeat it.
