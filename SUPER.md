# Complete Workflow Using `.claude/skills/`

The skills form a single development pipeline. Here's the end-to-end flow with where each one fires.

## 0. Always-on meta-skill

**`using-superpowers`** — Invoke any matching skill via the `Skill` tool *before* responding (even for "simple" questions or clarifying questions). Process skills (brainstorming, debugging) run before implementation skills.

---

## 1. Idea → Design

**`brainstorming`** (`HARD-GATE`: no code, no other skills, until user approves design)

1. Explore project context (files, docs, recent commits).
2. Offer visual companion (own message) if visual questions are coming.
3. Clarifying questions, **one at a time**.
4. Propose 2–3 approaches with tradeoffs + recommendation.
5. Present design in sections, get section-by-section approval.
6. Write spec to `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md` and commit.
7. Spec self-review (placeholders, contradictions, ambiguity, scope) → fix inline.
8. User reviews written spec.
9. Hand off to `writing-plans` (the *only* next skill).

---

## 2. Design → Plan

**`writing-plans`**

- Save to `docs/superpowers/plans/YYYY-MM-DD-<feature>.md`.
- Required header (goal/architecture/tech stack + agentic-worker note).
- Map file structure first (responsibilities, boundaries).
- Bite-sized tasks (2–5 min steps): write failing test → run (FAIL) → minimal impl → run (PASS) → commit.
- Exact paths, full code in every step, exact commands + expected output. **No placeholders.**
- Self-review for spec coverage, placeholder scan, type/name consistency.
- Offer execution choice: **Subagent-Driven (recommended)** or **Inline Execution**.

---

## 3. Isolation

**`using-git-worktrees`** (before executing the plan)

- Step 0 detect: if `GIT_DIR != GIT_COMMON` (and not a submodule), already isolated → skip creation.
- Step 1a: prefer native worktree tool if available; otherwise…
- Step 1b: git fallback at `.worktrees/<branch>` (verify it's gitignored — add + commit if not).
- Step 3: auto-run project setup (`npm install`, `cargo build`, etc.).
- Step 4: run baseline tests; report failures before proceeding.

---

## 4. Execute the plan

### Path A — **`subagent-driven-development`** (recommended)

Per task: dispatch implementer subagent → spec-compliance reviewer → code-quality reviewer → mark complete in TodoWrite. Continuous execution; no check-ins between tasks. Handle statuses: `DONE` / `DONE_WITH_CONCERNS` / `NEEDS_CONTEXT` / `BLOCKED`. Match model to task complexity. Never start on `main`/`master`.

### Path B — **`executing-plans`** (parallel session, no subagents)

Load plan → review critically → execute steps exactly as written → stop and ask when blocked.

### Inside every task — **`test-driven-development`**

Iron Law: `NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST`.
RED (write minimal failing test) → verify RED (watch it fail for the right reason) → GREEN (minimal code) → verify GREEN → REFACTOR. If you wrote code first, **delete it** — no "keep as reference."

### When bugs surface — **`systematic-debugging`**

Iron Law: `NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST`. Four phases: Root Cause → Pattern Analysis → Hypothesis → Implementation (with failing test). If 3+ fixes failed → stop and question architecture, don't try fix #4.

### When you have independent failures — **`dispatching-parallel-agents`**

One agent per independent problem domain (different test files, different subsystems). Focused scope, self-contained context, specific output format. Don't use for related failures or shared state.

---

## 5. Quality gates

**`verification-before-completion`** — Iron Law: `NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE`. Before any "done/fixed/passes" claim: identify the proving command → run it → read full output → only then make the claim. No "should", "probably", "looks good." Regression tests need full red-green-revert-restore cycle.

**`requesting-code-review`** — After each task in subagent-driven mode, after major features, before merge. Get `BASE_SHA`/`HEAD_SHA`, dispatch a reviewer subagent with `code-reviewer.md` template. Fix Critical immediately, Important before proceeding, Minor for later.

**`receiving-code-review`** — Read → restate → verify against codebase → evaluate → respond (technical ack or reasoned pushback) → implement one at a time. **Forbidden:** "You're absolutely right!", "Great point!", any gratitude/performative agreement. Clarify *all* unclear items before implementing any. YAGNI-check "professional" features (grep for actual usage). Push back with technical reasoning when wrong.

---

## 6. Finish

**`finishing-a-development-branch`**

1. Verify tests pass (`npm test`/`cargo test`/`pytest`/`go test ./...`). Failing → stop.
2. Detect environment (`GIT_DIR` vs `GIT_COMMON`, detached HEAD).
3. Determine base branch.
4. Present **exactly 4 options** (or 3 for detached HEAD): Merge locally / Push + PR / Keep as-is / Discard.
5. Execute: merge before removing worktree; only cleanup worktrees under `.worktrees/`, `worktrees/`, or `~/.config/superpowers/worktrees/`; require typed `discard` confirmation for option 4; `cd` to main repo root before `git worktree remove`; `git worktree prune` after.

---

## 7. Meta — adding to the system

**`writing-skills`** — TDD applied to documentation. RED (baseline pressure scenario without skill, document rationalizations verbatim) → GREEN (minimal skill addressing those failures) → REFACTOR (close new loopholes until bulletproof). Description = *when to use* only, never workflow summary (workflow summaries cause Claude to shortcut past the skill body). Frontmatter ≤1024 chars; name uses letters/numbers/hyphens only.

---

## Default happy path (one line)

`using-superpowers` → `brainstorming` → `writing-plans` → `using-git-worktrees` → `subagent-driven-development` (with `test-driven-development` per task, `systematic-debugging`/`dispatching-parallel-agents` as needed, `requesting-code-review` + `verification-before-completion` between tasks) → `finishing-a-development-branch`.
