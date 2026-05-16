# SKILL.md First-Time Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add first-time-setup guidance to the bundled dinheiro skill so an agent activating it against a fresh database knows how to bootstrap accounts and categories.

**Architecture:** Documentation-only change to two Markdown files in `skill/`. No source code, no tests, no schema. Prettier does **not** process Markdown — `format`/`format:check` only cover `src`/`tests` TypeScript — so there is no formatter to satisfy; just match the existing file style by hand. "Verification" for each task means re-reading the edited region. TDD does not apply — there is no executable behavior.

**Tech Stack:** Markdown only. Match the existing SKILL.md style: one unwrapped line per prose paragraph (do **not** hard-wrap prose), fenced code blocks for commands.

---

## File Structure

Two existing files, both modified:

- `skill/SKILL.md` — the skill manifest. Frontmatter + section reordering + a new `## First-time setup` section.
- `skill/references/workflows.md` — workflow recipes. A new `## Initial setup` recipe prepended before the existing recipes.

No files are created or deleted.

## Setup

Before Task 1, create a feature branch from `main`:

```bash
git checkout -b docs/skill-first-time-setup
```

---

### Task 1: Drop the `--help` verification nudge from SKILL.md

Removes the installation-check noise: the `compatibility` verification clause (spec §1.1) and the entire `## Installation check` section (spec §1.2).

**Files:**
- Modify: `skill/SKILL.md`

- [ ] **Step 1: Trim the `compatibility` frontmatter field**

Edit `skill/SKILL.md`. Replace this line:

```
compatibility: Requires Node 24+. Run `dinheiro --help` to verify installation.
```

with:

```
compatibility: Requires Node 24+.
```

- [ ] **Step 2: Remove the `## Installation check` section**

In `skill/SKILL.md`, replace this block:

````
Personal finance CLI driven by AI agents.

## Installation check

```bash
dinheiro --help
```

## Command shape
````

with:

```
Personal finance CLI driven by AI agents.

## Command shape
```

- [ ] **Step 3: Verify the edits**

Re-read `skill/SKILL.md` lines 1-20. Confirm: `compatibility` line ends at `Node 24+.`, the `## Installation check` heading and its fenced `dinheiro --help` block are gone, and `## Command shape` now follows the intro paragraph directly.

- [ ] **Step 4: Commit**

```bash
git add skill/SKILL.md
git commit -m "docs: drop --help verification nudge from dinheiro skill"
```

---

### Task 2: Surface the command reference earlier in SKILL.md

Moves the command-reference pointer up to immediately follow `## Command shape`, renames it, and rewrites its content (spec §1.3). The old `## Full command reference` section at the bottom is removed in the same task so the pointer is not duplicated.

**Files:**
- Modify: `skill/SKILL.md`

- [ ] **Step 1: Insert the new `## Command reference` section after `## Command shape`**

In `skill/SKILL.md`, replace this block:

```
All commands output JSON to stdout by default (exit 0). Errors are JSON to stderr (exit non-zero). Add `--pretty` to any command for human-readable tables.

## Output envelopes
```

with:

```
All commands output JSON to stdout by default (exit 0). Errors are JSON to stderr (exit non-zero). Add `--pretty` to any command for human-readable tables.

## Command reference

Every command, flag, and default lives in [references/commands.md](references/commands.md).

## Output envelopes
```

- [ ] **Step 2: Remove the old `## Full command reference` section**

In `skill/SKILL.md`, replace this block:

```
## Full command reference

See [references/commands.md](references/commands.md)

## Workflow recipes
```

with:

```
## Workflow recipes
```

- [ ] **Step 3: Verify the edits**

Re-read `skill/SKILL.md`. Confirm: `## Command reference` appears immediately after the `## Command shape` block and before `## Output envelopes`; there is exactly one section pointing at `references/commands.md`; `## Full command reference` no longer exists.

- [ ] **Step 4: Commit**

```bash
git add skill/SKILL.md
git commit -m "docs: surface command reference earlier in dinheiro skill"
```

---

### Task 3: Add the `## First-time setup` section to SKILL.md

Inserts the data-bootstrapping section between `## Output envelopes` and `## Key concepts` (spec §1.4), and fixes the workflow-recipes pointer link text (spec §1.5). After this task the section order is final (spec §1.6).

**Files:**
- Modify: `skill/SKILL.md`

- [ ] **Step 1: Insert the `## First-time setup` section before `## Key concepts`**

In `skill/SKILL.md`, replace this block:

````
Error:
```json
{ "ok": false, "error": "<message>", "code": "VALIDATION_ERROR|NOT_FOUND|CONFLICT|DB_ERROR" }
```

## Key concepts
````

with:

````
Error:
```json
{ "ok": false, "error": "<message>", "code": "VALIDATION_ERROR|NOT_FOUND|CONFLICT|DB_ERROR" }
```

## First-time setup

Before logging transactions, run `dinheiro accounts list`. If `data` is empty, this is a fresh database — set it up before continuing.

**Accounts — required.** No transaction can exist without an account. Ask the user for their real accounts: name, type (`checking` or `credit_card`), and for credit cards the `close_day` / `due_day` from their statement. Don't guess these. If the user wants to start immediately, fall back to creating one checking account named "Checking".

**Categories — strongly recommended.** A transaction _can_ be created without a category, but `reports monthly` groups spending by category — uncategorized transactions collapse into one "(uncategorized)" bucket and lose all analytical value. Treat categorizing as the default. Ask the user up front which categories they want; if they have no preference, offer the default set in [workflow recipes](references/workflows.md). When logging a transaction, always assign a category — create one if no fit exists. Also offer to create a category when importing a statement surfaces a recurring merchant with no home.

## Key concepts
````

- [ ] **Step 2: Fix the workflow-recipes pointer link text**

In `skill/SKILL.md`, replace this block:

```
## Workflow recipes

See [references/workflows.md](references/workflows.md)
```

with:

```
## Workflow recipes

See [workflow recipes](references/workflows.md)
```

- [ ] **Step 3: Verify the final section order**

Re-read all of `skill/SKILL.md`. Confirm the headings appear in exactly this order:

```
# dinheiro
## Command shape
## Command reference
## Output envelopes
## First-time setup
## Key concepts
## Workflow recipes
```

Also confirm both `references/...` links use descriptive text (`[references/commands.md]` for the command reference, `[workflow recipes]` for workflow recipes) and the link targets are unchanged.

- [ ] **Step 4: Commit**

```bash
git add skill/SKILL.md
git commit -m "docs: add first-time setup section to dinheiro skill"
```

---

### Task 4: Add the `## Initial setup` recipe to workflows.md

Prepends a concrete bootstrapping recipe before `## Log a single expense` (spec §2), including the 9-category default set used as the no-preference fallback.

**Files:**
- Modify: `skill/references/workflows.md`

- [ ] **Step 1: Insert the `## Initial setup` recipe at the top**

In `skill/references/workflows.md`, replace this block:

```
# Workflow Recipes

## Log a single expense
```

with:

````
# Workflow Recipes

## Initial setup

Run once against a fresh database, before logging any transactions.

```bash
# Create a checking account
dinheiro accounts create --name "Checking" --type checking

# Create a credit card account — close-day / due-day come from the statement
dinheiro accounts create --name "Nubank" --type credit_card --close-day 3 --due-day 10
```

Create the categories the user wants — repeat `categories create` once per category:

```bash
dinheiro categories create --name "Groceries"
```

If the user has no preference, use this default set: **Housing, Groceries, Dining, Transportation, Utilities, Healthcare, Shopping, Entertainment, Salary**.

## Log a single expense
````

- [ ] **Step 2: Verify the edit**

Re-read `skill/references/workflows.md` lines 1-25. Confirm `## Initial setup` is the first recipe (after the `# Workflow Recipes` title), the `accounts create` examples use the real flags `--name`, `--type`, `--close-day`, `--due-day`, the `categories create` example uses `--name`, and the default set lists all 9 categories.

- [ ] **Step 3: Commit**

```bash
git add skill/references/workflows.md
git commit -m "docs: add initial setup recipe to dinheiro workflows"
```

---

## Final verification

After all four tasks:

- [ ] `git log --oneline main..HEAD` shows four `docs:` commits.
- [ ] Open `skill/SKILL.md` and confirm it matches the spec §1.6 section order and contains no `dinheiro --help` reference anywhere.
- [ ] Open `skill/references/workflows.md` and confirm `## Initial setup` leads the file.

## Out of scope (do not add)

- DB schema initialization / migration guidance (`db:migrate`, `DINHEIRO_DB`).
- Install / build / `npm link` guidance.
- `--help` usage guidance — the nudge is removed but no prohibition is added.
- `--pretty` wording changes.
