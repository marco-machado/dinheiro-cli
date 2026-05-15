#!/usr/bin/env bash
set -euo pipefail

DB=$(mktemp /tmp/dinheiro-test-XXXXXX.db)
IMPORT_FILE=$(mktemp /tmp/dinheiro-import-XXXXXX.json)
trap 'trash "$DB" "$IMPORT_FILE" 2>/dev/null || true' EXIT

RUN="npx tsx src/index.ts"
export DINHEIRO_DB="$DB"

check() {
  local label="$1"; shift
  local output
  output=$("$@" 2>&1) || { echo "FAIL  $label" >&2; echo "$output" >&2; exit 1; }
  echo "  ok  $label" >&2
  echo "$output"
}

echo "==> accounts" >&2

CHECKING=$(check "create checking account" \
  $RUN accounts create --name "Nubank Conta" --type checking \
  | jq -r '.data.id')

CC=$(check "create credit card account" \
  $RUN accounts create --name "Nubank CC" --type credit_card --close-day 1 --due-day 8 \
  | jq -r '.data.id')

check "list accounts" $RUN accounts list | jq -r '.data[].name' >&2

echo "==> categories" >&2

CAT_FOOD=$(check "create food category" \
  $RUN categories create --name "Food" \
  | jq -r '.data.id')

CAT_TRANSPORT=$(check "create transport category" \
  $RUN categories create --name "Transport" \
  | jq -r '.data.id')

check "list categories" $RUN categories list | jq -r '.data[].name' >&2

echo "==> transactions" >&2

check "create checking transaction" \
  $RUN transactions create \
    --account "$CHECKING" \
    --amount -3500 \
    --description "Mercado" \
    --occurred-at 2026-05-10 \
    --category "$CAT_FOOD" > /dev/null

check "create cc transaction" \
  $RUN transactions create \
    --account "$CC" \
    --amount -4200 \
    --description "iFood" \
    --occurred-at 2026-05-12 \
    --category "$CAT_FOOD" \
    --statement-period 2026-05 > /dev/null

check "create cc transport transaction" \
  $RUN transactions create \
    --account "$CC" \
    --amount -1500 \
    --description "99app" \
    --occurred-at 2026-05-13 \
    --category "$CAT_TRANSPORT" \
    --statement-period 2026-05 > /dev/null

TX_ID=$(check "list cc transactions" \
  $RUN transactions list --account "$CC" --statement-period 2026-05 \
  | jq -r '.data[0].id')

check "get transaction" $RUN transactions get "$TX_ID" > /dev/null

check "update transaction description" \
  $RUN transactions update "$TX_ID" --description "iFood delivery" > /dev/null

echo "==> transfers" >&2

check "create transfer (bill payment)" \
  $RUN transfers create \
    --from "$CHECKING" \
    --to "$CC" \
    --amount 5700 \
    --occurred-at 2026-05-08 \
    --description "Nubank bill May" > /dev/null

check "list transfers" $RUN transfers list > /dev/null

echo "==> reports" >&2

check "monthly report" $RUN reports monthly --pretty >&2

check "statement report cc" \
  $RUN reports statement --account "$CC" --period 2026-05 --pretty >&2

echo "==> imports" >&2

cat > "$IMPORT_FILE" <<'JSON'
[
  { "amount": -900, "description": "Spotify", "occurredAt": "2026-05-01" },
  { "amount": -1200, "description": "Netflix", "occurredAt": "2026-05-02" }
]
JSON

check "imports dry-run" \
  $RUN imports create \
    --account "$CC" \
    --file "$IMPORT_FILE" \
    --format canonical \
    --dry-run > /dev/null

check "imports real" \
  $RUN imports create \
    --account "$CC" \
    --file "$IMPORT_FILE" \
    --format canonical > /dev/null

IMPORT_ID=$(check "list imports" \
  $RUN imports list \
  | jq -r '.data[0].id')

check "delete import (rollback)" $RUN imports delete "$IMPORT_ID" > /dev/null

echo "" >&2
echo "all checks passed" >&2
