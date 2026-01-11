# Feature: Exclusion List (placeholder)

Recommended short name: **Exclusion List**
Norwegian UI label suggestion: **Ekskluderte objekter** (or **Skjul objekter**)

Why: The feature allows users to exclude specific objects entirely from export even if they otherwise match the active filters. This is useful for hiding critical infrastructure lines or other sensitive objects that must not be distributed.

Suggested alternative names:
- Exclusion List (recommended)
- Suppression List
- Hidden Objects
- Protected Objects
- Exclude Set

Scope / acceptance checklist (fill in):
- UI: a place to add/remove object identifiers (or filterable rules)
- UI: list of excluded objects visible in the Filter or Download step
- Persistence: store exclusions in the saved selection (localStorage + server selection export)
- Apply: cleaning/export pipeline must skip excluded objects regardless of filter matches
- Tests: unit tests for clean logic and UI tests for adding/removing exclusions
- UX copy: Norwegian + English labels and tooltip explaining "Excludes these objects from any exported file"

Data model notes (ideas):
- Exclusions could be a list of { category, objId } or simple `objId` strings depending on SOSI structure
- Server/API: `selection` payload should include `exclusions` so `/api/clean` applies them

Workflow: write the detailed feature description here and I will implement in the new branch.
