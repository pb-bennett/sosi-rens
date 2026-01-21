#Rearranging filtering

##Overview
We will now revisit how this app filters the data. The current approach puts together in one stage filtering objects by three different fixed fields, and allowing the user to choose which fields should be kept on the filtered selection of objects.

The new approach will be to first allow the user to select which fields should be used to apply filters to the objects that will be kept in the output file. The user will then be able to choose which fields should be kept on the filtered selection of objects. This will happen on two separate steps in the UI. These will both happen before the user reaches the exclude by ID step.

## Object filtering step

Key changes to the object filtering step:

1. The user will be presented with a list of all available fields in the uploaded SOSI file.
2. The list of fields will appear as a grouping of buttons including the name of the field and a + symbol. Clicking the button will add the field to the list of active filters. Multiple field buttons can be on the same line. The selection should be clear and user friendly.
3. The order of the fields added to the active filters list will determine the order in which the filters are applied. The user can rearrange the order of the active filters by dragging and dropping them.
4. There will be a remove button on each active filter to allow the user to remove it from the list.
5. a total number of objects that will be kept after applying the filters will be displayed and updated as the user adds/removes/rearranges filters.
6. The list of fields will be searchable, and as the fields are added to the active filters list they will be removed from the available fields list.
7. Fields with a high cardinality (many unique values) will be marked with a warning icon and a tooltip explaining that using high cardinality fields may lead to very few objects being kept. A warning should be given if the user adds a high cardinality field to the active filters list.
8. There will be two tabs at the top of the step, one for Punkt and one for Ledning. The user will need to configure filters for both categories before proceeding to the next step. However the user does not need to apply the same filters to both categories.
9. Each field that is added to the filter list will then be expanded to show all unique values with checkboxes for that field in the uploaded SOSI file, along with a count of how many objects have that value that are sitll available after previous filters are applied. The user can then select which values for that field should be kept. These lists can be very long, so they should be scrollable with a fixed max height. These lists should also be searchable.
10. There will be a "Select All" and "Deselect All" button for each field to allow the user to quickly select or deselect all values for that field.
11. There will be a summary section at the top of the step showing the total number of objects in the uploaded file, the number of objects that will be kept after applying the filters, and the number of objects that will be excluded.
12. A dropdown menu will allow the user to import and export the current filter configuration as a JSON file. The export will contain all filters and exclusions currently applied. This same dropdown will be present in the field selection and exclusion by ID and export steps to allow the user to import/export the entire configuration at any step.

## Field selection step

Key changes to the field selection step:

1. This step will remain largely the same as in the current version of the app, however with its own dedicated step in the UI.
2. The choices will again be on two tabs, one for Punkt and one for Ledning. These tabs should be styled in the same way, in the same section of the UI as the object filtering step.
3. The user will be presented with a list of all available fields in the uploaded SOSI file.
4. The list should be scrollable with a fixed max height, and searchable.
5. Each field will have a checkbox to allow the user to select whether that field should be kept in the output file.
6. There will be a "Select All" and "Deselect All" button to allow the user to quickly select or deselect all fields.
7. Remember to keep the mandatory fields (e.g. EGS_PUNKT, EGS_LEDNING) always selected and disabled so the user cannot deselect them.
8. Remember to have dropdown menu to allow the user to import and export the current field selection configuration as a JSON file. The export will contain all filters and exclusions currently applied. This same dropdown will be present in the object filtering and exclusion by ID and export steps to allow the user to import/export the entire configuration at any step.

## Exclusion by ID step

1. This step will remain largely the same as in the current version of the app with its own dedicated step in the UI.
2. Care should be taken to ensure styling consistency with the previous two steps.
3. Remember to have dropdown menu to allow the user to import and export the current field selection configuration as a JSON file. The export will contain all filters and exclusions currently applied. This same dropdown will be present in the object filtering and exclusion by ID and export steps to allow the user to import/export the entire configuration at any step.

## Other thoughts

1. I feel now is a good time for us to install a complete set of icons for the app that we can use throughout the app. I suggest we use Lucide (https://lucide.dev/) as it is open source (MIT license) and has a good selection of modern icons. What do you think?
2. At each step in the UI we should have a brief but clear explanation of what the user should do in that step. We can add this as a text section at the top of each step - the position should be consistent across all steps and made obvious with styling.

---

## My thoughts on the feature suggestions (after reviewing the current code)

These changes are a strong direction: you’re moving from a “fixed set of filters (OBJTYPE/EIER/STATUS)” to a more general, user-driven filtering pipeline. That’s a big UX improvement and also aligns nicely with the SOSI reality where different datasets encode the same concepts in different fields.

The current codebase is capable of supporting this without a full rewrite, but it will benefit from extracting some logic out of `src/app/page.js` into small utilities:

- The app already has solid streaming primitives in `src/lib/sosi/pivot2d.js` that avoid `split()` for large files, and we can reuse that approach for the new “ordered filters with live counts”.
- The current “filter step” conflates object filtering + field keep/drop; your new plan to split into two steps will simplify mental model and reduce accidental exports.
- The new “counts after previous filters” requirement is very doable in a single streaming pass (per category) if we compute counts progressively along the filter chain.
- High-cardinality warnings are a good idea, but we’ll want a clear threshold definition and likely a cap/early-exit strategy so we don’t accidentally make the UI sluggish on large files.

## Suitable icon library recommendation

Lucide is a great fit here.

- We already use `lucide-react` in `package.json`, and icons are used throughout `src/app/page.js`.
- It’s MIT licensed, consistent style, and has the icons we need for this feature set (add `Plus`, remove `X`, drag `GripVertical`, warning `TriangleAlert`, tooltip `Info`, expand/collapse `ChevronDown/ChevronRight`).

Recommendation: stick with `lucide-react` and standardize usage via a small internal wrapper (e.g. `src/components/Icon.js`) later if we notice inconsistent sizing/styling.

## Proposed implementation plan (high-level)

### 1) Data model changes

- Introduce a new selection shape for object filtering that supports arbitrary fields and ordering, per category:
  - `objectFiltersByCategory: { punkter: FilterSpec[], ledninger: FilterSpec[] }`
  - where `FilterSpec` includes:
    - `fieldKeyUpper: string`
    - `selectedValues: string[]` (values to keep)
    - optional UI metadata (collapsed/expanded) kept out of export if preferred
- Keep `fieldsByCategory` for “field selection step” (what to keep in output) as-is.
- Keep exclusions as-is.

### 2) New streaming “filter preview” computation

Add a new lib helper (e.g. `src/lib/sosi/filterPreview.js`) that:

- Streams through features in one category.
- For each feature, extracts the value token for each active filter field (including explicit `(mangler)` and `(tom)` tokens).
- Progressively:
  - updates the per-filter value counts _after previous filters_
  - applies the filter at that stage to decide if the feature continues
- Outputs:
  - total features
  - kept features
  - excluded features
  - `countsByFilter[fieldKeyUpper] -> [{value, count}]`

This supports requirement #5 (kept count live) and #9 (counts after previous filters) with one pass.

### 3) UI refactor into separate steps

- Change step flow to something like:
  - Upload → Explore → **Object filtering** → **Field selection** → Exclude → Download
- Reuse the existing Punkter/Ledninger tab control and the “must visit both tabs” gating for the new object filtering step.
- Implement the “available fields” area:
  - searchable list of field buttons (label + plus icon)
  - removing from available list when activated
- Implement the “active filters” area:
  - drag & drop reordering
  - remove button
  - expanded view with:
    - searchable value list
    - select all / deselect all
    - fixed max height + scroll

### 4) High-cardinality warning

- Define a threshold (e.g. warn when `uniqueValues > 200` or `> 500`).
- Implement cardinality detection with either:
  - on-demand computation when a field is rendered/hovered/added, OR
  - background precompute with a hard cap/early exit.

### 5) Import/export configuration everywhere

- Evolve the settings JSON format:
  - bump `_meta.version`
  - include `objectFiltersByCategory`
  - keep backwards compatibility when importing older configs
- Add the same import/export dropdown UI to:
  - object filtering
  - field selection
  - exclusion
  - download

---

## Questions for you (please answer before implementation)

1. **Terminology + UI labels**: Should we use “Punkt/Ledning” or “Punkter/Ledninger” consistently everywhere (tabs + copy)? `Punkter/Ledninger is best.`
2. **Default behavior**: When a user uploads a file, should object filtering default to “no active filters” (keep all), or should we pre-seed common filters like `OBJTYPE` (and optionally `EIER=K`)? `The app should use the filters stored in local storage if available, otherwise no active filters (keep all). The app should remember the last used filters for next time. This is only in local storage, no server side storage needed.`
3. **Missing values**: For object filtering on arbitrary fields, should missing values be shown as `(mangler)` and empty values as `(tom)` (like the existing conventions), and should they be selectable? ` Yes, this is good. and selectable`
4. **High-cardinality threshold**: What should count as “high cardinality” for a warning (e.g. >200 unique values, >500, or proportional to feature count)? ` I would say 50 unique values is high cardinality enough to warrant a warning.`
5. **Performance constraints**: What file sizes should we optimize for in-browser interactions (e.g. 10MB / 50MB / 200MB)? This affects how aggressively we precompute cardinality and live counts. ` We should optimize for files up to 100MB in size.`
6. **Import semantics**: When importing settings JSON, should it fully replace current state, or should it merge (and if merge, which side wins)? ` It should fully replace the current state.`
7. **Cross-tab helpers**: Do you want a “Copy filters from Punkter → Ledninger” button (and vice versa) to speed up setup when datasets are symmetric? ` Yes, this is a good idea. Although not all datasets will be symmetric, it will help in many cases.`
8. **Step gating**: Should the user be forced to configure/visit both tabs in **both** (a) object filtering and (b) field selection, or only object filtering? ` Both steps should require visiting both tabs before proceeding.`
