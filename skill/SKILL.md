---
name: dinheiro
description: Personal finance CLI. Manage accounts, transactions, categories, transfers, and reports via `dinheiro <noun> <verb>`. Use for logging expenses, importing bank statements, reconciling credit card bills, and generating monthly summaries.
compatibility: Requires Node 24+.
---

# dinheiro

Personal finance CLI driven by AI agents.

## Command shape

```
dinheiro <noun> <verb> [args] [flags]
```

All commands output JSON to stdout by default (exit 0). Errors are JSON to stderr (exit non-zero). Add `--pretty` to any command for human-readable tables.

## Command reference

Every command, flag, and default lives in [references/commands.md](references/commands.md).

## Output envelopes

Success:
```json
{ "ok": true, "data": <result> }
```

Error:
```json
{ "ok": false, "error": "<message>", "code": "VALIDATION_ERROR|NOT_FOUND|CONFLICT|DB_ERROR" }
```

## Key concepts

- **Amounts:** signed integers in cents. Negative = expense/outflow. Positive = income/inflow.
- **Accounts:** `checking` or `credit_card`. Credit cards have `close_day`/`due_day` (informational).
- **Statement period:** YYYY-MM string. **Required** for all credit_card transactions. Caller-supplied — read it from the bank statement.
- **Transfers:** pay a credit card bill with `transfers create`. Creates two linked rows. Never edit transfer rows directly via `transactions update/delete`.
- **Import dedup:** re-importing the same file is safe — duplicate rows are skipped (same account + date + amount + description).

## Workflow recipes

See [references/workflows.md](references/workflows.md)
