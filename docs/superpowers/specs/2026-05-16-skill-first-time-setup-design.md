# SKILL.md First-Time Setup Design Spec

**Date:** 2026-05-16

## Overview

The bundled agentskills.io skill at `skill/SKILL.md` describes the dinheiro
command surface but says nothing about getting from an empty database to a
usable state. An agent activating the skill against a fresh install has no
guidance on what data must exist before transactions can be logged.

This change adds a **First-time setup** section covering data bootstrapping —
creating the first accounts and categories — and makes two supporting edits
that reduce noise from the agent (removing the installation-check nudge,
surfacing the command reference earlier).

Scope is data bootstrapping only. DB initialization (`db:migrate`,
`DINHEIRO_DB`) and install/build/link are explicitly out of scope.

---

## 1. SKILL.md changes

### 1.1 Frontmatter

The `compatibility` field currently reads:

> `Requires Node 24+. Run \`dinheiro --help\` to verify installation.`

Drop the verification clause. New value:

> `Requires Node 24+.`

Rationale: the clause nudges the agent to shell out to `--help` for no
functional reason. Node 24+ is a genuine environment requirement and stays,
consistent with the spec guidance that `compatibility` carries environment
requirements.

### 1.2 Remove the "Installation check" section

Delete the `## Installation check` section entirely (the `dinheiro --help`
fenced block). It exists only to tell the agent to run `--help`, which is not
a setup step.

### 1.3 Surface the command reference earlier

Move the command-reference pointer up to immediately follow `## Command shape`.
Content:

> ## Command reference
>
> Every command, flag, and default lives in
> [references/commands.md](references/commands.md).

This is a pointer only — no guidance about `--help` usage in this iteration.
Placing it near the top makes the full reference visible before the agent
reaches output details or setup.

### 1.4 New "First-time setup" section

Inserted after `## Output envelopes`, before `## Key concepts`:

> ## First-time setup
>
> Before logging transactions, run `dinheiro accounts list`. If `data` is
> empty, this is a fresh database — set it up before continuing.
>
> **Accounts — required.** No transaction can exist without an account. Ask
> the user for their real accounts: name, type (`checking` or `credit_card`),
> and for credit cards the `close_day` / `due_day` from their statement.
> Don't guess these. If the user wants to start immediately, fall back to
> creating one checking account named "Checking".
>
> **Categories — strongly recommended.** A transaction *can* be created
> without a category, but `reports monthly` groups spending by category —
> uncategorized transactions collapse into one "(uncategorized)" bucket and
> lose all analytical value. Treat categorizing as the default. Ask the user
> up front which categories they want; if they have no preference, offer the
> default set in [references/workflows.md](references/workflows.md). When
> logging a transaction, always assign a category — create one if no fit
> exists. Also offer to create a category when importing a statement surfaces
> a recurring merchant with no home.

### 1.5 Link text

Fix the `Workflow recipes` pointer link text from the raw path to descriptive
text: `[references/workflows.md](references/workflows.md)` →
`[workflow recipes](references/workflows.md)`. Targets are unchanged and
already spec-compliant (relative path from skill root, one level deep). This
is a style alignment with the agentskills.io spec example, not a fix.

### 1.6 Final section order

```
# dinheiro            (title + intro)
## Command shape
## Command reference
## Output envelopes
## First-time setup
## Key concepts
## Workflow recipes
```

`Output envelopes` and `Key concepts` are otherwise unchanged. The `--pretty`
wording is left as-is in this iteration.

---

## 2. workflows.md change

Add an `## Initial setup` recipe (placed first, before `## Log a single
expense`) with concrete commands:

- `dinheiro accounts create` examples for a checking account and a credit card
  (showing `--close-day` / `--due-day`).
- A `dinheiro categories create` example, noting the loop is repeated per
  category.
- The default category set, to be used as the fallback when the user has no
  preference:

  > **Housing, Groceries, Dining, Transportation, Utilities, Healthcare,
  > Shopping, Entertainment, Salary**

The default set is derived from the categories consistently cited as core
across mainstream personal-finance budgeting guides (housing, food,
transportation, utilities, healthcare, plus common discretionary buckets and
income). Kept deliberately small — guidance across those sources is to start
minimal and refine.

---

## 3. Decision rules summary

| Situation | Behavior |
|---|---|
| `accounts list` returns empty | Treat as fresh DB; run setup before logging. |
| No accounts, user available | Ask for real account details. Don't guess credit card `close_day`/`due_day`. |
| No accounts, user wants to start fast | Fall back to one checking account named "Checking". |
| No categories, user available | Ask which categories they want. |
| No categories, user has no preference | Offer the 9-category default set. |
| Importing a statement, recurring merchant uncategorized | Offer to create a matching category. |
| Logging any transaction | Always assign a category; uncategorized is discouraged. |

---

## 4. Out of scope

- DB schema initialization / migration guidance.
- Install / build / `npm link` guidance.
- `--help` usage guidance (deferred — no prohibition added this iteration).
- `--pretty` wording changes (deferred).
