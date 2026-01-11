# Copilot Commenting Instructions

Hi — use this file to give input and answer the quick questions below so I can apply consistent, useful comments across the codebase.

---

## 1) Scope

- [x] Apply comments across the entire `src/` folder
- [ ] Only document public/exported APIs and complex modules (e.g., `src/lib/sosi/*`)
- [x] Exclude `public/`, `node_modules/`, and generated files

Please check one option above or add your own preference.

Answer here:

---

## 2) Language

- Preferred language for comments:
  - [x] English
  - [ ] Norwegian (Bokmål)

Answer here:

---

## 3) Style & Coverage

Choose preferred style:

- JSDoc/TSDoc on exported functions and modules (recommended) — e.g.:

  /\*\*

  - Describe the function, params, return, side effects `this`
    \*/

- Short inline // comments for non-obvious logic `this`
- File-level header comment describing the module purpose `this`

Which of the above do you prefer? Any other rules (max line length for comment, sentence style)?

Answer here:

---

## 4) Priority list / order

List modules or folders to document first (one per line):

- e.g., `src/lib/sosi/` (parsing + cleaning)
- e.g., `src/app/page.js` (UI flow)

`All files, work through and make a list as you go. Tick off when done`

Answer here:

---

## 5) Examples & Templates

Pick a small example comment template for exported functions:

- Option A (concise):
  /\*\*

  - Short one-line summary.
  - @param {Type} name - short description
  - @returns {Type} short description
    \*/

- Option B (detailed):
  /\*\*
  - One-line summary.
  -
  - Longer description explaining intent, edge-cases, and where used.
  - @param {Type} name - description, include why it might be optional
  - @throws {Error} when XYZ
  - @returns {Type} description
    \*/

Answer here: (A/B)`A`

---

## 6) Automation / Enforcement

Would you like me to also add a lightweight lint rule (or package.json script) to flag missing JSDoc on exported functions? Yes / No

Answer here: `not this time`

---

## 7) Sample file approval

I will add comments to one sample file and open a PR (or a branch) for you to review before I proceed. Which file should I use as the sample? (default: `src/lib/sosi/clean.js`)

Answer here: `don't do this`

---

## 8) Communication & PR preferences

- Open small PRs per module? (recommended) — Yes / No
- Use commit message prefix `docs:` for all comment commits? — Yes / No

Answer here: `Yes to both`

---

## Quick Notes / Constraints

- I won't change your code behavior — only add comments and docblocks.
- I will run `npm run lint` and `npm test` (if present) before creating a PR.
- If you want comments in a single language and the code has existing comments in another, I can add bilingual headers at the top of files for context (rarely needed).

---

Thanks — please edit this file in place with your choices and any extra preferences. When you confirm the sample file to start with, I'll add comments there and show a concise diff for approval.

---

## Autonomous mode (added)

- Default behaviour: proceed without asking for approval on every change.
  - Start with: `src/lib/sosi/` and then continue through `src/` in small batches.
  - PRs: small, module-scoped, branch name `docs/comments/<module>`, commit prefix `docs:`.
  - Auto-merge rule: merge a PR automatically when CI (lint + tests) passes and there are no review comments for 48 hours.
- When I will notify you:
  - Only for blocking issues, ambiguous semantics that could change behaviour, or when CI repeatedly fails.
- How to pause/stop:
  - Edit this file and set `Autonomous mode: disabled`, or
  - Post `stop` in any open PR and I will halt further work until you indicate otherwise.
- New: Do not begin executing this autonomous plan until you explicitly confirm the start by writing `start` in this file (or replying here). This request is recorded, and I will not start any PRs until you confirm.

---
