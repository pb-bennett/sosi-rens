# COPILOT FEATURE EXCLUSION LIST

## USER DESCRIPTION

- This feature allows users to specify certain objects that should be excluded from the exported SOSI file, regardless of whether they match the selected filters. This is particularly useful for sensitive or critical infrastructure data that should not be shared.
- A user will use the Gemini VA or Gemini Portal+ map systems to identify the object IDs they wish to exclude.
- The user then inputs these IDs into the SOSI-Rens application. This should be very user friendly and easy to use.
- The user should be able to download a settings file for this exclusion list that can be used to re-load the same settings in future sessions and sharing. The list can also be stored in localStorage for convenience. Use JSON format for the settings file.
- When entering a new object ID to exclude the user should also be able to add a comment. The entire list of excluded objects should be visible in the Filter step, with the ability to remove or edit individual entries.

### Analysis of SOSI data

- We first need to analyse the example SOSI file and check what unique identifiers we have. Check SID, PSID and LSID.
- Be careful with Punkter and Ledninger. When an ID number is searched in the Gemini system it often returns both a Punkt and a Ledning with the same number. We need to make sure we differentiate between these two object types when excluding.

## Analysis findings (example SOSI file)

Analysis source: `REF_FILES/EXAMPLE_SOSI/20260108_VA_eksport-kommunalt(ingen filter).sos` (local only; do not commit).

### Where identifiers live in the SOSI structure

- The relevant identifiers in this export are **triple-dot attributes** inside the `..EGS_PUNKT` / `..EGS_LEDNING` groups:
	- `...SID <number>` appears in both points and lines.
	- `...PSID <number>` appears in some point features.
	- `...LSID <number>` appears in many point features, and also in some line features.

This means the exclusion logic must look inside feature blocks for `...SID` / `...PSID` / `...LSID` (not `..SID`).

### Presence (counts)

Counts below are occurrences of lines in the example file (not necessarily unique IDs):

- `...SID`: 33,763 occurrences
- `...PSID`: 2,296 occurrences
- `...LSID`: 14,041 occurrences

Breakdown by section:

- In `.PUNKT`:
	- `SID`: 20,437
	- `PSID`: 2,296
	- `LSID`: 13,508
- In `.KURVE`:
	- `SID`: 13,326
	- `LSID`: 533

### Ambiguity between Punkter and Ledninger

The same numeric `SID` value can exist in both `.PUNKT` and `.KURVE`.

- Unique `.PUNKT` `SID` values: 19,268
- Unique `.KURVE` `SID` values: 13,326
- **Overlap (same number used in both)**: 2,918

So the UI must **always** differentiate Punkter vs Ledninger when excluding by ID.

### Other potentially useful keys

- Many features include `..GUID <uuid>` (globally unique), but Gemini typically works with the numeric IDs, so GUID is likely not the primary user input.
- For ledninger, material and dimension are available inside `..EGS_LEDNING` (e.g. `...MATERIAL`, `...DIMENSJON`), which can be used for display in the exclusion list UI.

## Implementation thoughts + questions (before coding)

### Proposed data model

Add exclusions to the persisted selection payload:

- `excludedByCategory: { punkter: ExcludedEntry[], ledninger: ExcludedEntry[] }`
- `ExcludedEntry`:
	- `id`: string (the numeric value, stored as string)
	- `idType`: `'SID' | 'PSID' | 'LSID'` (explicit)
	- `comment`: string (optional)

This keeps it explicit and avoids guessing later.

### Matching behavior in the cleaner

- Extend `cleanSosiText()` to drop entire feature blocks **before** field filtering when a block matches an exclusion entry.
- For each feature block, extract identifiers from all lines matching:
	- `...SID <value>`
	- `...PSID <value>`
	- `...LSID <value>`
- If any extracted `(idType, value)` matches an exclusion in the block’s category, skip the whole block.

### UX / “very user friendly” approach

To reduce user confusion (because Gemini search can show multiple hits):

- UI keeps **two lists**: Punkter and Ledninger.
- When user pastes a number into a list, the app tries to resolve it against the loaded SOSI text for that category:
	- If it matches exactly one of `SID/PSID/LSID` in that category, store it with the resolved `idType`.
	- If it matches multiple (or none), ask the user to choose `SID/PSID/LSID` (or show an error).
- Display metadata for each entry:
	- Punkter: `OBJTYPE` (and optionally `P_TEMA`).
	- Ledninger: `OBJTYPE`, plus `DIMENSJON` and `MATERIAL` when present.

Implementation detail: build an in-memory index from the SOSI text (category + idType + id → { objType, dimensjon, material }) to support fast lookups while typing. This is similar in spirit to how Explore already builds “pivot” caches.

### Questions for your feedback

1. In Gemini VA / Portal+, when you copy an “object ID” for **ledninger**, is it usually `SID` or `LSID`?
2. For a point object (e.g. ventiler), do you expect Gemini to reference `PSID`, `SID`, or `LSID`?
3. If the same ID appears multiple times (e.g. `PSID` can repeat), should exclusion remove **all** matching features, or only the first match?
4. Should the exclusion feature support pasting **many IDs at once** (newline-separated), or only one-at-a-time?
5. When an ID is entered but not found in the SOSI file, what should happen?
	 - Reject with an error, or
	 - Allow it anyway (in case the file changes later), but mark it as “not found”.
6. Do you want the “Ekskluderte objekter” section to be in **Filter** only, or also visible in **Download** as a final check?

### UI Changes

1. **New filter step section** After the user has selected object types and fields to keep, add a new section titled "Ekskluderte objekter" (Excluded Objects).
2. **Input for exclusions** Provide an input field where users can enter object identifiers
3. List of objects for each of Punkt and Ledning, as the ID number can refer to both types.
4. For each excluded ID provide the type of object, with dimensjion and material if ledning.
5. Each entry in the exclusion list should have an edit and delete button.
