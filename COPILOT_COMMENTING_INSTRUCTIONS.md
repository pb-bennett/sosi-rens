# Copilot Commenting Instructions

Hi — use this file to give input and answer the quick questions below so I can apply consistent, useful comments across the codebase.

---

## 1) Scope

- [x] Apply comments across the entire `src/` folder
- [ ] Only document public/exported APIs and complex modules (e.g., `src/lib/sosi/*`)
- [x] Exclude `public/`, `node_modules/`, and generated files

Notes:

- Excluding `public/` and `node_modules/` is compatible with commenting all of `src/`.

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

- JSDoc/TSDoc on exported functions and modules (recommended)
- Short inline `//` comments only for non-obvious logic
- File-level header comment describing the module purpose

Rules (important):

- Do **not** narrate the code (avoid: "increment i" / "loop over items").
- Prefer describing _intent_, _invariants_, _why_, edge-cases, and constraints.
- Comment tricky regexes, parsing rules, protocol/format rules (SOSI), and any surprising behavior.
- Keep comments short; add longer explanations only at module level.

Which of the above do you prefer? Any other rules (max line length for comment, sentence style)?

Answer here:

---

## 4) Priority list / order

List modules or folders to document first (one per line):

- e.g., `src/lib/sosi/` (parsing + cleaning)
- e.g., `src/app/page.js` (UI flow)

`All files, work through and make a list as you go. Tick off when done`

### Completed files

- [x] `src/lib/sosi/analyze.js`
- [x] `src/lib/sosi/browserEncoding.js`
- [x] `src/lib/sosi/clean.js`
- [x] `src/lib/sosi/encoding.js`
- [x] `src/app/api/analyze/route.js`
- [x] `src/app/api/clean/route.js`
- [x] `src/app/api/version/route.js`
- [x] `src/app/layout.js`
- [x] `src/app/page.js`

Answer here:

---

## 5) Examples & Templates

Pick a small example comment template for exported functions:

- Option A (concise):

  ```js
  /**
   * Short one-line summary.
   * @param {Type} name - Short description.
   * @returns {Type} Short description.
   */
  ```

- Option B (detailed):

  ```js
  /**
   * One-line summary.
   *
   * Longer description explaining intent, edge-cases, and where used.
   * @param {Type} name - Description (include why it might be optional).
   * @throws {Error} When XYZ.
   * @returns {Type} Description.
   */
  ```

Answer here: (A/B)`A`

---

## 6) Automation / Enforcement

Would you like me to also add a lightweight lint rule (or package.json script) to flag missing JSDoc on exported functions? Yes / No

Answer here: `not this time`

---

## 7) Sample file approval

I will add comments to one sample file and open a PR (or a branch) for you to review before I proceed. Which file should I use as the sample? (default: `src/lib/sosi/clean.js`)

Answer here: `don't do this`

Interpretation: proceed without a “sample approval” checkpoint.

---

## 8) Communication & PR preferences

- Open small PRs per module? (recommended) — Yes / No
- Use commit message prefix `docs:` for all comment commits? — Yes / No

Answer here: `Yes to both`

---

## Quick Notes / Constraints

- I won't change your code behavior — only add comments and docblocks.
- I will run `npm run lint` and `npm run build` (and `npm test` if present) before pushing any batch.
- If you want comments in a single language and the code has existing comments in another, I can add bilingual headers at the top of files for context (rarely needed).

Formatting:

- Prefer existing code style and formatting.
- Do not reformat unrelated code.

Safety:

- Do not add speculative comments (comments must be grounded in actual code behavior).
- Do not add copyrighted text from external sources.

---

Thanks — this file acts as the spec. When you write `start`, I will proceed autonomously.

---

## Autonomous mode (added)

- Default behaviour: proceed without asking for approval on every change.

Execution control:

- **Do not begin** until you explicitly confirm the start by writing `start` in this file (or replying in chat).
- To pause immediately: write `stop` in this file (or reply `stop`).

Working method (autonomous, minimal disruption):

- Work in small batches (roughly one folder/module at a time).
- Branch naming: `docs/comments/<module>`
- Commit prefix: `docs:`
- After each batch:
  - Run `npm run lint` and `npm run build` (and `npm test` if available).
  - Commit and push.
  - Provide the branch name and a short summary of what was documented.

Note on PRs:

- I can prepare PR-ready branches and provide the GitHub “create PR” link.
- Actual PR creation/merging typically happens in GitHub UI; I won’t claim auto-merge.

When I will interrupt you (rare):

- Only for blockers, unclear intent that risks incorrect documentation, or repeated CI failures.

Definition of “done”:

- Every exported function/component in `src/` has a brief JSDoc block (Option A).
- Tricky parsing/formatting/regex logic has short explanatory inline comments.
- No behavior changes; builds clean.

---
