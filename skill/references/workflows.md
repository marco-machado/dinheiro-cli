# Workflow Recipes

## Log a single expense

```bash
# 1. Get the account ID (do once, cache it)
dinheiro accounts list

# 2. Get the category ID
dinheiro categories list

# 3. Log the expense
dinheiro transactions create \
  --account <checking-id> \
  --amount -4200 \
  --description "iFood" \
  --occurred-at 2026-05-15 \
  --category <food-category-id>
```

For a credit card purchase, add `--statement-period YYYY-MM` (the billing period shown on the statement):
```bash
dinheiro transactions create \
  --account <cc-id> \
  --amount -4200 \
  --description "iFood" \
  --occurred-at 2026-05-15 \
  --category <food-category-id> \
  --statement-period 2026-05
```

## Import a Nubank credit card export

```bash
# 1. Ensure the credit_card account exists
dinheiro accounts list

# 2. Preview without writing
dinheiro imports create \
  --account <cc-id> \
  --file nubank-may.csv \
  --format nubank \
  --dry-run

# 3. Import for real
dinheiro imports create \
  --account <cc-id> \
  --file nubank-may.csv \
  --format nubank
# Returns: { "importId": "...", "inserted": 42, "skipped": 0 }

# 4. If something went wrong, roll back the entire batch
dinheiro imports delete <importId>
```

Note: Nubank exports don't include statement period. After importing, update transactions manually or via batch-create with statementPeriod set.

## Reconcile a credit card bill

```bash
# 1. List all transactions in the billing period
dinheiro reports statement --account <cc-id> --period 2026-05 --pretty

# 2. Verify total matches the bill (sum of amounts)
dinheiro transactions list --account <cc-id> --statement-period 2026-05

# 3. Record the bill payment as a transfer from checking
dinheiro transfers create \
  --from <checking-id> \
  --to <cc-id> \
  --amount 85000 \
  --occurred-at 2026-05-05 \
  --description "Nubank bill May"
```

## Monthly income vs. expenses review

```bash
# Full summary for current month across all accounts
dinheiro reports monthly --pretty

# Specific month
dinheiro reports monthly --month 2026-04 --pretty

# Filter to one account
dinheiro reports monthly --account <checking-id> --month 2026-05
```

Output includes income, expenses, net, transfer totals, and a category breakdown with percentages.
