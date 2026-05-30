# JSON Shape Reference

Every command prints the envelope `{ "ok": true, "data": <payload> }` to stdout on
success (exit 0), or `{ "ok": false, "error": "<message>", "code": "..." }` to stderr
on failure (exit non-zero). `--pretty` swaps the JSON for a human table and is **not**
machine-readable — never parse `--pretty` output.

This file documents the shape of the `data` payload per command, so you don't have to
discover field names by trial and error. **All keys are camelCase** (`occurredAt`,
`incomeTotal`, `byCategory`) — there are no snake_case keys in any payload.

Amounts are always signed integers in **cents** (BRL): negative = expense/outflow,
positive = income/inflow. Timestamps (`createdAt`, `updatedAt`) are epoch
milliseconds. Dates (`occurredAt`) are `YYYY-MM-DD` strings. Nullable fields are
present as `null`, not omitted.

---

## Core objects

### Account

Returned by `accounts create`, `accounts get`, `accounts update`, and as elements of
`accounts list`.

| Field            | Type                          | Notes                                  |
| ---------------- | ----------------------------- | -------------------------------------- |
| `id`             | string                        | ULID                                   |
| `name`           | string                        |                                        |
| `nameNormalized` | string                        | lowercased, used for name resolution   |
| `type`           | `"checking" \| "credit_card"` |                                        |
| `closeDay`       | number \| null                | credit cards only; informational       |
| `dueDay`         | number \| null                | credit cards only; informational       |
| `createdAt`      | number                        | epoch ms                               |
| `updatedAt`      | number                        | epoch ms                               |

### Category

Returned by `categories create`, `categories update`, and as elements of
`categories list`.

| Field            | Type   | Notes                                |
| ---------------- | ------ | ------------------------------------ |
| `id`             | string | ULID                                 |
| `name`           | string |                                      |
| `nameNormalized` | string | lowercased, used for name resolution |
| `createdAt`      | number | epoch ms                             |
| `updatedAt`      | number | epoch ms                             |

### Transaction

The row object returned by `transactions create`, `transactions get`,
`transactions update`, elements of `transactions list` (default mode),
elements of `reports statement`, and the `transactions` array inside the
`transactions categorize` result.

| Field            | Type           | Notes                                                   |
| ---------------- | -------------- | ------------------------------------------------------- |
| `id`             | string         | ULID                                                    |
| `accountId`      | string         |                                                         |
| `amount`         | number         | signed cents                                            |
| `description`    | string         |                                                         |
| `occurredAt`     | string         | `YYYY-MM-DD` — **not** `occurred_at`                    |
| `categoryId`     | string \| null | null = uncategorized                                    |
| `statementPeriod`| string \| null | `YYYY-MM`; set for credit-card rows                      |
| `transferId`     | string \| null | non-null = this row is one leg of a transfer (do not edit/delete directly) |
| `importBatchId`  | string \| null | non-null = created by an import; use as `--import-batch` |
| `rowHash`        | string \| null | dedup hash for imported rows                             |
| `createdAt`      | number         | epoch ms                                                |
| `updatedAt`      | number         | epoch ms                                                |

---

## transactions

### transactions list (default)

`data` is a `Transaction[]` (see above). Empty array when nothing matches.

The full filter flag set is the key to every "drill into a pattern" workflow —
see [the filter table below](#transactions-list-filter-flags).

### transactions list --stats

`data` is a single object summarizing the matched set (filters applied first):

| Field       | Type           | Notes                          |
| ----------- | -------------- | ------------------------------ |
| `count`     | number         | rows matched                   |
| `sum`       | number         | signed cents, total            |
| `min`       | number \| null | smallest amount (null if none) |
| `max`       | number \| null | largest amount (null if none)  |
| `firstDate` | string \| null | earliest `occurredAt`          |
| `lastDate`  | string \| null | latest `occurredAt`            |

### transactions list --aggregate-by `<dimension>`

`data` is an `AggregateBucket[]`, one bucket per group
(`dimension` = `merchant | month | category | account`):

| Field   | Type   | Notes                                                      |
| ------- | ------ | ---------------------------------------------------------- |
| `key`   | string | the group: normalized merchant, `YYYY-MM`, category name, or account name. `(uncategorized)` for null categories. |
| `total` | number | signed cents, summed over the group                       |
| `count` | number | rows in the group                                         |

`merchant`/`category`/`account` buckets are sorted by descending magnitude;
`month` buckets are sorted ascending by key. `--aggregate-by` and `--stats`
cannot be combined.

### transactions categorize

`data` is a `CategorizeResult`:

| Field          | Type            | Notes                                                  |
| -------------- | --------------- | ------------------------------------------------------ |
| `dryRun`       | boolean         | true when `--dry-run` was passed (nothing written)     |
| `categoryId`   | string          | the target category id                                 |
| `matched`      | number          | rows matched by the filters/ids                        |
| `skipped`      | number          | matched rows that are transfer legs (never mutated)    |
| `updated`      | number          | rows actually recategorized (0 on dry run)             |
| `ids`          | string[]        | ids of the eligible (non-transfer) rows                |
| `transactions` | Transaction[]   | the eligible rows (post-update unless dry run)         |

### transactions delete

`data` is `{ "id": string, "deleted": true }`.

### transactions batch-create

`data` is `{ "inserted": number, "skipped": number }` (skipped = dedup hits).

---

## reports

### reports monthly

`data` shape — **camelCase**, confirmed against the running CLI:

```json
{
  "month": "2026-05",
  "incomeTotal": 500000,
  "expenseTotal": -4200,
  "net": 495800,
  "transfersOut": 0,
  "transfersIn": 0,
  "byCategory": [{ "category": "Dining", "total": -4200, "pct": 100 }]
}
```

| Field          | Type   | Notes                                                       |
| -------------- | ------ | ---------------------------------------------------------- |
| `month`        | string | `YYYY-MM`                                                  |
| `incomeTotal`  | number | sum of positive non-transfer rows (cents)                 |
| `expenseTotal` | number | sum of negative non-transfer rows (cents, negative)       |
| `net`          | number | `incomeTotal + expenseTotal`                              |
| `transfersOut` | number | absolute total of outbound transfer legs                  |
| `transfersIn`  | number | total of inbound transfer legs                            |
| `byCategory`   | array  | expenses only, grouped: `{ category, total, pct }` per row |

`byCategory[].category` is the category **name** (falls back to id if unresolved),
`total` is signed cents, `pct` is the share of total expense rounded to one decimal.
Transfers are excluded from `incomeTotal`/`expenseTotal`/`byCategory` and reported
separately via the transfer totals.

> Note for agents who read older notes: `reports monthly` does **not** emit
> snake_case `income_total`/`expense_total`. The live payload is camelCase
> (`incomeTotal`/`expenseTotal`) as shown above.

### reports statement

`data` is a `Transaction[]` — every transaction in the given account + statement
period.

---

## transfers

### transfers create / elements of transfers list

`data` is a `Transfer` (or `Transfer[]` for `list`):

| Field           | Type           | Notes                              |
| --------------- | -------------- | ---------------------------------- |
| `transferId`    | string         | shared id of the two linked rows   |
| `fromAccountId` | string         | source (outflow leg)               |
| `toAccountId`   | string         | destination (inflow leg)           |
| `amount`        | number         | positive cents                     |
| `occurredAt`    | string         | `YYYY-MM-DD`                       |
| `description`   | string \| null |                                    |

### transfers delete

`data` confirms the deletion (both legs removed atomically).

---

## imports

### imports create

| Field         | Type   | Notes                                                 |
| ------------- | ------ | ----------------------------------------------------- |
| `importId`    | string | the batch id (use to roll back via `imports delete`)  |
| `inserted`    | number | rows written (0 on `--dry-run`)                       |
| `skipped`     | number | dedup hits (same account + date + amount + description) |
| `categorized` | number | rows auto-categorized by a matching rule at import time |

### imports list

`data` is an array of import records:

| Field       | Type   | Notes                       |
| ----------- | ------ | --------------------------- |
| `id`        | string | the batch id                |
| `accountId` | string |                             |
| `format`    | string | `"canonical" \| "nubank"`   |
| `filename`  | string | basename of the source file |
| `rowCount`  | number | rows in the source file     |
| `createdAt` | number | epoch ms                    |
| `updatedAt` | number | epoch ms                    |

### imports delete

`data` confirms the import record and all its transactions were removed atomically.

---

## rules

Persisted categorization rules applied automatically at import time and on demand.

### rules create / elements of rules list

| Field         | Type           | Notes                                                       |
| ------------- | -------------- | ---------------------------------------------------------- |
| `id`          | string         | ULID                                                       |
| `match`       | string         | substring matched against the description                  |
| `amounts`     | string \| null | optional comma list of signed cent amounts to match        |
| `daysOfMonth` | string \| null | optional comma list of days-of-month to match              |
| `accountId`   | string \| null | optional account scope                                     |
| `account`     | string \| null | resolved account name (null when unscoped)                 |
| `categoryId`  | string         | category the rule assigns                                  |
| `category`    | string         | resolved category name                                     |
| `priority`    | number         | lower number wins when multiple rules match                |
| `createdAt`   | number         | epoch ms                                                   |
| `updatedAt`   | number         | epoch ms                                                   |

### rules test / apply

`rules test` dry-runs which rule (if any) matches a hypothetical transaction.
`rules apply` re-runs rules over existing transactions in a scope and reports how
many were categorized. See `dinheiro rules <verb> --help` for the exact flags.

---

## transactions list filter flags

`transactions list` accepts the full filter set below. The same selection flags are
reused verbatim by `transactions categorize` (so you can preview with `list`, then
apply with `categorize`). `--search` is the single most useful flag for any
"drill into this pattern" workflow.

| Flag                        | Effect                                                                 |
| --------------------------- | --------------------------------------------------------------------- |
| `--search <str>`            | substring match on description (see case/accent caveat below)         |
| `--from <YYYY-MM-DD>`       | rows on or after this date                                            |
| `--to <YYYY-MM-DD>`         | rows on or before this date                                           |
| `--limit <n>`               | cap the number of rows returned                                       |
| `--category <id-or-name>`   | rows in this category (name is resolved to id)                       |
| `--account <id-or-name>`    | rows in this account (name is resolved to id)                        |
| `--statement-period <YYYY-MM>` | credit-card rows in this billing period                            |
| `--import-batch <id>`       | rows created by a specific import (the `importId` / `importBatchId`)  |
| `--amount <int>`            | exact signed cent amount                                              |
| `--amount-in <int,int,...>` | match any amount in the comma list                                   |
| `--aggregate-by <dim>`      | return `AggregateBucket[]` grouped by `merchant\|month\|category\|account` |
| `--stats`                   | return the `--stats` summary object instead of rows                  |
| `--pretty`                  | human table instead of JSON (do not parse)                           |

All filters combine with AND. **Case/accent caveat:** SQLite `LIKE` is
case-insensitive for ASCII letters only — `--search cafe` will **not** match `Café`
(accented characters only match themselves, same case). Strip accents from both the
term and the description if you need fuzzy matches.
