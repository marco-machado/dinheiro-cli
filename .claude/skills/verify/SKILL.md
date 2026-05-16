---
name: verify
description: Verify a change to dinheiro-cli is sound before declaring it done — runs the test suite and a TypeScript build, and reports pass/fail with output. Use after implementing a feature or bugfix, or when the user runs /verify.
---

Run the project's verification gate and report results. Do not claim success without showing the command output.

## Steps

1. Run the test suite:
   ```
   npm test
   ```
2. Run the TypeScript build:
   ```
   npm run build
   ```
3. If `src/schema/` was changed in this session, also confirm migrations are current:
   ```
   npm run db:generate
   ```
   If this produces a new file in `migrations/`, the schema change is missing its migration — flag it and stop.

## Reporting

- If everything passes, state it plainly with the relevant output.
- If anything fails, show the failing output and stop — do not attempt to mask or work around it. Fix the cause, then re-run from step 1.

This is additive to the bundled `verification-before-completion` skill — that one is general; this one runs dinheiro-cli's specific commands.
