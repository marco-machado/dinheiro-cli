---
name: address-review
description: >-
  Take a pull request with outstanding review feedback to a clean,
  all-threads-resolved state, then report merge readiness and recommend a merge
  method. Works for feedback from any reviewer. TRIGGER on requests like
  "address the review", "handle the comments on PR #N", or "respond to the
  review feedback". Does NOT run verification (CI is the gate) and does NOT
  merge — it ends by recommending squash vs merge and hands the merge to the
  user.
---

# address-review

Drive the review-response loop on a pull request to completion: ensure the work
is actually on GitHub, work through every reviewer comment, push fixes, reply,
confirm the PR is clean, and finish with a merge-method recommendation. This
skill never verifies (the repo's pre-commit hook and CI are the gate) and never
merges (the merge decision stays with the user).

## Steps

### 0. State guard — run first, re-check before finishing

Never assume the work reached GitHub. Assert each, in order, and fix it before
continuing:

- **Committed** — `git status --porcelain` is empty. If not, the changes aren't
  real yet; commit them. (This is the failure mode where work silently never
  got committed.)
- **Pushed** — there are no commits ahead of the upstream and an upstream
  exists: `git rev-list --count @{u}..HEAD` is `0`. If not, push.
- **PR open** — `gh pr view --json number,state` resolves to an OPEN PR. If
  none exists, open one. Capture the number as `#N`.

### 1. Gather feedback

Collect feedback from every reviewer (human or automated):

- Inline comments: `gh api repos/{owner}/{repo}/pulls/{N}/comments`
- Submitted reviews: `gh api repos/{owner}/{repo}/pulls/{N}/reviews`
- Summary / issue comments: `gh pr view {N} --json comments`

If a review is still pending (requested, or a review check is running) and you
are meant to wait for it, see [Waiting for a pending review](#waiting-for-a-pending-review).

### 2. Triage skeptically

For each item:

- Verify it against the **current** code — suggestions go stale.
- Fix valid ones minimally.
- Skip wrong or stale ones, recording a one-line reason (you'll use it in the
  reply).
- Add or adjust a test for each behavioral fix.

Do not reflexively apply every suggestion.

### 3. Commit + push

Make one focused commit (e.g. `address review`) and push it. There is **no
verify step here** — the pre-commit hook and CI are the gate.

### 4. Reply to each thread

Reply on each thread (`gh api repos/{owner}/{repo}/pulls/{N}/comments/{id}/replies`)
stating how it was addressed, or why it was skipped. Resolve the threads you've
handled (see [Gotchas](#gotchas) — resolution is a GraphQL mutation).

### 5. Confirm clean

If a follow-up review is expected, wait for it (see
[Waiting for a pending review](#waiting-for-a-pending-review)). Confirm there are
no new items and that all review threads are resolved.

### 6. Report + recommend

Print a readiness report and a merge-method recommendation, then hand the merge
to the user:

- Readiness: `gh pr view {N} --json mergeStateStatus,reviewDecision,statusCheckRollup`
- Merge recommendation: see [Merge recommendation](#merge-recommendation).

## Waiting for a pending review

This is where a naive poll breaks. Follow these rules:

- **Don't scrape rendered comment Markdown** for "done" markers or an echoed
  commit SHA — reviewers don't format consistently and the SHA isn't always
  echoed. That's exactly what fails.
- **Key off structured signals** instead: a PR status check transitioning to a
  terminal state, or a new review/comment whose timestamp is newer than your
  last push. Record the push time first (`gh pr view {N} --json
  statusCheckRollup` for checks; `pulls/{N}/reviews[].submitted_at` for reviews).
- **Bound the wait and report on timeout** — e.g. "still pending after N min" —
  instead of exiting silently as if complete.
- **Don't rely on a long detached background `sleep` loop.** It dies if the job
  is interrupted. Use short, bounded polls in explicit `bash -c`, keyed on the
  structured signal, so each poll is cheap and idempotent.

## Merge recommendation

Suggest only — never merge. Choose between squash and merge:

- **Single logical change, or history padded with fixup / "address review"
  commits** → **squash**. One clean, typed commit; tidy changelog.
- **Multiple meaningful, independently-revertible commits worth keeping** →
  **merge commit**. Preserves granularity and atomic whole-PR revert.

Output the pick and a one-line why.

## Gotchas

- **Thread resolution is GraphQL**, not REST. Query state via
  `reviewThreads.nodes[].isResolved`; resolve via the `resolveReviewThread`
  mutation.
- **Default shell is zsh.** Avoid bash-isms like `${!arr[@]}` (associative-array
  key expansion) — they error in zsh. Use explicit calls or wrap in `bash -c`.
