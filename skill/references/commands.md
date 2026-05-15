# Command Reference

## accounts

### accounts create
```
dinheiro accounts create --name <str> --type checking|credit_card [--close-day N] [--due-day N]
```
Returns: `Account` object.

### accounts list
```
dinheiro accounts list
```
Returns: `Account[]`

### accounts get
```
dinheiro accounts get <id>
```
Returns: `Account` or NOT_FOUND error.

### accounts update
```
dinheiro accounts update <id> [--name <str>] [--close-day N] [--due-day N]
```

### accounts delete
```
dinheiro accounts delete <id>
```

---

## categories

### categories create
```
dinheiro categories create --name <str>
```

### categories list
```
dinheiro categories list
```

### categories update
```
dinheiro categories update <id> --name <str>
```

### categories delete
```
dinheiro categories delete <id>
```
Returns CONFLICT if category has associated transactions.

---

## transactions

### transactions create
```
dinheiro transactions create \
  --account <id> \
  --amount <int> \
  --description <str> \
  --occurred-at YYYY-MM-DD \
  --category <id> \
  [--statement-period YYYY-MM]
```
`--statement-period` is **required** for credit_card accounts.

### transactions list
```
dinheiro transactions list \
  [--account <id>] \
  [--category <id>] \
  [--from YYYY-MM-DD] \
  [--to YYYY-MM-DD] \
  [--statement-period YYYY-MM] \
  [--import-batch <id>] \
  [--search <str>] \
  [--limit N]
```
`--search` does substring match on description. SQLite's `LIKE` is case-insensitive for ASCII letters only, so `--search cafe` will **not** match descriptions like `Café` (accented chars only match themselves, in the same case). Strip accents from the search term and the description if you need fuzzy matches.

### transactions get
```
dinheiro transactions get <id>
```

### transactions update
```
dinheiro transactions update <id> [--amount <int>] [--description <str>] [--category <id>] [--occurred-at YYYY-MM-DD] [--statement-period YYYY-MM]
```
Returns CONFLICT if the transaction is part of a transfer.

### transactions delete
```
dinheiro transactions delete <id>
```
Returns CONFLICT if the transaction is part of a transfer.

### transactions batch-create
```
dinheiro transactions batch-create --file <path>
```
File must be a JSON array. Each element: `{ accountId, amount, description, occurredAt, categoryId?, statementPeriod? }`. Entire batch is atomic.

---

## transfers

### transfers create
```
dinheiro transfers create \
  --from <account-id> \
  --to <account-id> \
  --amount <positive-int> \
  --occurred-at YYYY-MM-DD \
  [--description <str>]
```
Creates two linked transaction rows (outflow negative, inflow positive).

### transfers list
```
dinheiro transfers list [--account <id>] [--from YYYY-MM-DD] [--to YYYY-MM-DD]
```

### transfers delete
```
dinheiro transfers delete <transfer-id>
```
Deletes both sides atomically.

---

## reports

### reports monthly
```
dinheiro reports monthly [--month YYYY-MM] [--account <id>]
```
Defaults to current month. Returns:
```json
{
  "month": "YYYY-MM",
  "income_total": 0,
  "expense_total": 0,
  "net": 0,
  "transfers_out": 0,
  "transfers_in": 0,
  "by_category": [{ "category": "food", "total": -4200, "pct": 75.0 }]
}
```

### reports statement
```
dinheiro reports statement --account <id> --period YYYY-MM
```
Returns all transactions for that credit card billing period.

---

## imports

### imports create
```
dinheiro imports create \
  --account <id> \
  --file <path> \
  [--format canonical|nubank] \
  [--dry-run]
```
`--format` defaults to `canonical`. `--dry-run` validates without writing.
Returns: `{ importId, inserted, skipped }`

Canonical format: JSON array with `{ amount, description, occurredAt, categoryId?, statementPeriod? }`.
Nubank format: CSV with `Data,Categoria,Título,Valor` header.

### imports list
```
dinheiro imports list
```

### imports delete
```
dinheiro imports delete <id>
```
Atomically deletes the import record and all its transactions.
