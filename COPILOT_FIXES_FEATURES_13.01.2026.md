# High-Level Instructions for SOSI-Rens (LLM Coding Assistant)

## Role & Context

You are assisting in the development of **SOSI-Rens**, a tool for filtering, cleaning, and exploring large SOSI datasets.
All UI text must be in **Norwegian Bokmål**.
Development discussion and reasoning should be in **English** unless otherwise stated.
Do not include scaffolding code unless explicitly requested.

---

## Primary Objectives

### 1. Filtering & Excluding UX Improvements

- Improve visual formatting and clarity of the **“Felter” list** on the filter screen.
- Introduce a **default active filter**:
  - Only include objects where `EIER = K`, if the field exists (it should).
  - Purpose: ensure only publicly commune-owned infrastructure is included by default.
- Simplify the **Exclude section**:
  - Remove all exclude options except **SID**.
- Replace multiple SID inputs with **one unified SID input**:
  - Accept numbers only.
  - On input:
    - Look up matching object(s) in the file.
    - If multiple objects share the same SID, display all.
    - Always show object details before allowing exclusion.
    - User must explicitly choose to add or close.
  - Goal: reduce risk of excluding the wrong object.
- Ensure **Reset Filters** does NOT affect the exclude list.

---

### 2. Settings Export / Import

- Provide **one single settings export format** that includes:
  - All filter settings
  - The exclude list
- Remove the asymmetry where exclude export omits filters.
- Improve file identification:
  - Include the name **“SOSI-Rens”** clearly in exported files.
- Ensure future compatibility and clarity when re-importing settings.

---

### 3. UI Cleanup

- Remove environment/debug information from the UI:
  - Example: “Backend: vercel (09ba20471540) · Behandling: nettleser”

---

### 4. Raw SOSI Data Inspection (Utforsk)

- Add a way to **inspect raw SOSI data** in the Utforsk stage:
  - Example: a magnifying glass icon next to a “Verdi”.
  - Opens a modal displaying all underlying SOSI objects.
- The modal should:
  - Be read-only.
  - Support **text search** (like a text editor).
- Purpose: transparency, debugging, and confidence in filters and pivots.

---

## Extended Analysis Mode (Utforsk / Field Explorer)

### Purpose

Provide an **interactive, performance-aware explorer** for large SOSI files (60k+ objects, >1M lines) that allows:

- Field profiling
- 1D pivots (per-field frequency tables)
- 2D pivots (Extended View / Crosstabs)

---

### Core Analytical Concepts

- **1D Pivot**:
  - Frequency table per field.
  - Default measure: COUNT.
  - Include `(Tom)` for missing values.
- **Extended (2D) Pivot**:
  - Rows: primary field values.
  - Columns: secondary field values.
  - Include row totals, column totals, and grand total.
  - Optional heatmap visualization.
- Numeric secondary fields require **binning**:
  - Default: equal-width.
  - Optional: quantile-based.

---

### Cardinality Awareness

- For each field, compute a **distinctness ratio**:
  - `distinct_values / total_rows`
- Classify fields:
  - ≥ 0.95 → _Unik verdi_ (ID/GUID-like)
  - 0.5–0.95 → _Høy kardinalitet_
  - < 0.5 → Normal
- UX rules:
  - Fields tagged _Unik verdi_ or _Høy kardinalitet_ are **hidden by default** as secondary dimensions.
  - Provide a toggle:
    - “Vis felt med unik/høy kardinalitet” (OFF by default)
  - Always show warnings and enforce caps when overridden.

---

### Performance & Scalability Strategy

- Use **single-pass, streaming profiling** on file load to compute:
  - Row count, missing count
  - Approximate distinct counts
  - Top-K values
  - Type inference
  - Min/max for numeric fields
- Do NOT precompute all 2D combinations.
- Compute 2D pivots **on demand only**.
- Enforce caps:
  - Columns capped (default 25): Top-N + “Andre”
  - Rows capped or paginated
- Cache recent pivots using `(primary_field, secondary_field, filter_set)`.
- Offload heavy computation from the main UI thread when needed.

---

### Data Semantics & Edge Cases

- **Multivalued fields**:
  - Default behavior: explode (one object contributes to multiple cells).
  - Display a visible note explaining totals may exceed object count.
- **Timestamp-like or ID-like fields**:
  - Prefer binning or grouping over raw value usage.
- Missing values must always be represented as `(Tom)`.

---

### Interaction Features

- Respect global filters everywhere.
- Allow sorting by totals or alphabetically.
- Tooltips should show:
  - Absolute count
  - Percentage of row
  - Percentage of column

---

### Privacy & Safety

- Mask unique identifiers in previews and drilldowns (e.g. `abcd…1234`).
- Disable exporting raw unique identifiers from pivot views unless explicitly allowed.

---

## UI Language (Bokmål – Mandatory)

Required labels include:

- “Utvidet visning”
- “Del opp etter sekundært felt”
- “Måling”
- “(Tom)”
- “Andre”
- “Sorter”
- “Vis flere”
- “Tilbake”
- “Unik verdi”
- “Høy kardinalitet”
- “Krever binning”

---

## Quality & Acceptance Criteria

- Correct counts and totals under all filters.
- Cardinality rules enforced with clear warnings.
- Numeric bins clearly labeled (e.g. `[0–10)`).
- UI remains responsive on large datasets.
- Output encoding verified and correct.
- UI is fully Norwegian Bokmål.

---

## Explicit Constraints

- Do not precompute all field combinations.
- Do not expose raw unique identifiers by default.
- Prefer theory, architecture, and reasoning unless code is explicitly requested.

---

## Queries for you (please confirm before we code)

### Scope / sequencing

1. Should we implement **only** the “Primary Objectives” in this file first (filter/exclude/export/UI cleanup/raw inspection), and treat “Extended Analysis Mode” as a later milestone? `Yes, implement only the Primary Objectives first. We come back to Extended Analysis Mode after.`
2. The current app has a dedicated step **“4. Ekskluder”**. Your new spec says “Simplify the Exclude section” on the filter screen—do you want:

- A) keep a separate **Ekskluder** step, but simplify it, or
- B) move exclusions into **Filtrer** and remove the separate step?
  ` A) keep a separate Ekskluder step, but simplify it - we still need two lists, one for punkter, other ledninger. But a single input field which then displays the search result which includes details about the object or objects. the user can then chose which to add to the list..`

### Default filter: `EIER = K`

3. Should the default `EIER = K` filter apply to **both** Punkter and Ledninger? `essentially we are adding another field to filter by as well as the objekttyper. So yes, it applies to both punkter and ledninger. the default will be to only include objects with EIER=K, but the user can turn this off if they want to include all objects regardless of owner. the result of these filters will then be stripped of fields as per the existing field filter functionality.`
4. If an object **does not have** `...EIER` (unexpected but possible), should it be:

- A) included anyway, or
- B) excluded (strict “only EIER=K”), or
- C) controlled by a toggle?
  `There should never be objects without EIER field, but could be without a value for EIER, in that case include them in the list of options to filter by. So the default is EIER=K, but the user can turn this off to include all objects, or they can chose to include other EIER values as well.`

5. Where should this be applied?

- A) only when generating the cleaned export,
- B) also when showing Explore/Utforsk counts/pivots (i.e. Explore reflects the default filter), or
- C) Explore always shows the raw file, filters only affect export. `C Explore always shows the raw file, filters only affect export.`

6. Should users be able to **turn off** the default EIER-filter, and should that choice persist in localStorage and export/import? ` Yes, the user should be able to turn off the default EIER filter, and this choice should persist in localStorage and export/import of settings.`

### Exclude: single SID input + confirmation

7. Confirm we should remove **all** exclude ID-types except **SID** (no PSID/LSID anywhere in UI). ` Yes, only SID is needed.`
8. The new spec says “one unified SID input” and “look up matching object(s) in the file”. Should a SID lookup search:

- A) the raw loaded file, or
- B) only the currently-filtered-in objects (post filters), or
- C) raw file but clearly mark “filtered out / not included” hits?
  ` A) the raw loaded file.`

9. When multiple objects share the same SID, do you want the chooser to allow:

- A) selecting exactly one match at a time, or
- B) selecting multiple matches and adding them together?
  `A) selecting exactly one match at a time.`

10. What object details are most helpful to show before exclusion? (I’m assuming category + OBJTYPE + (P_TEMA/L_TEMA) + (DIMENSJON/MATERIAL for ledninger) + maybe GUID masked.) ` Yes, category, OBJTYPE, P_TEMA/L_TEMA, DIMENSJON/MATERIAL for ledninger, no GUID needed.`
11. Do you still want the optional **Kommentar** field per excluded entry?
    `Yes, keep the Kommentar field.`
12. Do you still want “Last ned ekskluderte (SOSI)” (a SOSI file containing only excluded objects), or should we remove that action as part of simplification? `Yes, keep the "Last ned ekskluderte (SOSI)". It is useful to have a record of what has been excluded or to control it separately.`

### Settings export/import format

13. Confirm we should remove the split formats and have **one** settings export that includes:

- filter settings + exclude list (and any new toggles like EIER=K).
  ` Yes, one settings export that includes filter settings + exclude list + any new toggles like EIER=K. This can be from dropdown available in both Filtrer and Ekskluder steps.`

14. Do you want the exported JSON to include metadata like:

- `app: "SOSI-Rens"`, `schemaVersion`, `exportedAt`, and optionally `lastFileName`? ` Yes, include metadata like app: "SOSI-Rens", schemaVersion, exportedAt, name the file SOSI-Rens_Innstillinger or similar.`

15. Backwards compatibility: should import accept older files (e.g. old “utvalg” and “ekskluderinger” exports) and translate them best-effort, or hard-reject anything not matching the new schema? ` Accept older files and translate them best-effort.`

### Reset behavior

16. Which control is “Reset Filters” in your mind?

- A) “Tilbakestill til standard (fra fil)”,
- B) “Slett lagrede innstillinger”, or
- C) a new explicit “Tilbakestill filtre” button?
  ` Reload server defaults, these will be specified later. Ask for confirmation before proceeding. User will always be able to restore from file if wanted.`

17. Confirm: resetting filters should not touch the exclude list, but should “Slett lagrede innstillinger” still wipe everything (including exclusions), or should it also preserve exclusions? `Prompt and ask the user what they want to do. Default action is to wipe everything including exclusions, but user can chose to preserve exclusions if wanted.`

### Felter list formatting (Filtrer)

18. What does “Improve visual formatting and clarity” mean for the “Felter” list?

- A) grouping locked fields separately,
- B) showing counts (presence) next to each field,
- C) adding search within fields,
- D) better spacing/typography only (no new controls),
- E) something else (describe)?
  `D better spacing/typography only (no new controls). Just make it easier to read and scan through the list. Both lists should match visually as well, so the user has a consistent experience when choosing fields to keep and when excluding objects. same font size, spacing, alignment etc.`

### UI cleanup

19. Confirm we should remove the “Backend: … · Behandling: …” line entirely (no hidden dev toggle).
    ` Yes, remove the entire line from the UI.`

### Raw SOSI inspection modal (Utforsk)

20. For the magnifying-glass inspection: should the modal show the **raw SOSI feature blocks** as text (recommended), or a parsed JSON-like view? ` Show the raw SOSI feature blocks as text. This is more useful for debugging and understanding the actual data structure. Also have otpion to show the header information at the top of the file, like TEGNSETT and other metadata lines.`
21. Should the modal list be capped for performance (e.g. show first N matches + “Vis flere”), or must it always show all matches? ` Cap the list for performance. Show first N matches + "Vis flere" button to load more if needed.`
22. Masking: which identifiers should be masked in this modal by default (GUID only, or also SID, or any value that looks unique/high-cardinality)? ` Mask GUID only. SID can be shown as is, since it is needed for identification and exclusion.`
