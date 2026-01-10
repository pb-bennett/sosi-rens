We can call V0 just about feature complete. Well done team! There are a few minor features and improvements that we can consider for V1. Here are the instructions for next version:

Note: We will communicate in English; the UI must be in Norwegian Bokmål.

1. We need to restyle the app. A new logo can be found in the public folder. We need a colour scheme. We need modern and usable, but can have some colours too. Make me a few suggestions and implement a theme picker to allow users to select between them. We can decide on hardcoding one later. Think modern, professional but friendly.

2. User should be allowed to drop a file into the upload area instead of selecting it via a file dialog.

3. Add a spinner or loading indicator when the app is processing a file. This should be visible until the results are ready.

4. When a user uploads the file the analysis should start automatically. No need for a separate button to start the analysis. Move straight to the analysis view.

5. On analysis view we need to make changes:

   - Show all results, not just top 25
   - Objekttyper can be presented as the first of the fields. No need for a separate section.
   - The buttons to change tabs "punkter" and "ledninger" should be more prominent and more obviously tabs, not just buttons. They can move from the right to the left of the section. The "utforsk data" title can move up and be made larger. Decide a style of text here than can be consistent across the app.
   - Each field should start minimiased but should be sxpandable to display a pivot table of all values for that field.
   - I am unsure if the app is currently checking the fields.json data for field names. I want the raw codes to be the default display, but if a field name is found in fields.json it should be displayed alongside the code in brackets. E.g. "12345 (Building Height)". If no field name is found, just display the code.

6. On the "Filtrer" view the same changes to the tab buttons should be made. There are some fields that are currently greyout out, for example "EGS_PUNKT", "EGS_LEDNING". Please look into why these are greyout out and give me an explanation.
7. On the "Filtrer" view there is an explanation of (keep) This should be in Norwegian. Infact remove it and write a short sentance in Norwegian at the top of the view explaining how to use the filters.
8. On the "Filtrer" section the buttons for "Tilbake til standard" "Eksportere utvalg (JSON)" etc need looking at. It is not clear what they do, and they appear in a line with the most important button "Gå til nedlasting". The buttons need moving, maybe to a dropdown menu, and a better explanation of what they do is needed.

9. A general overhaul of the UI could be good. We are not utilising the size of the screen. This app i designed for desktop use. Lets generally increase the size of the tables and lists to better us ehte space we have.

---

## Questions / clarifications before we code (V1)

I have read both this file and [COPILOT_INSTRUCTIONS.md](COPILOT_INSTRUCTIONS.md). Below are questions/decisions that will affect the implementation.

### Version / branch

1. I created the branch `v1/2026-01-ui-upload-flow` and bumped the version from `0.1.0` → `0.2.0` in `package.json`/`package-lock.json`. Is `0.2.0` OK as “V1 work-in-progress”, or do you want a different semver (e.g. `0.1.1` or `1.0.0`)?

### Theme + restyling

2. Theme picker: Should the selected theme be saved in localStorage (recommended) and apply to the whole app, or only apply for the current session?
3. Logo: Which file in `public/` is the “new logo” we should use (filename), and where should it be placed (top-left next to the title, or centered in the header)?
4. Suggested 3 simple themes (can be changed later):
   - **Neutral**: current “zinc/gray” (professional)
   - **Ocean**: blue/indigo accent (safe/technical)
   - **Forest**: green/teal accent (friendly)
     Do you want us to only change accent + background/contrast, or also make table headers/buttons noticeably more “themed”? (I suggest accent + surface colors to keep it clean.)

### Upload + auto analysis

5. Instruction #4 says analysis should start automatically after upload. Should it trigger:
   - when the user picks a file in the file dialog (onChange), and/or
   - when the user drops a file into the dropzone?
     (I’m assuming “both”.)
6. When auto-analysis starts: Should we keep the step buttons (1–4) as navigation, or disable/hide them while processing so users can’t jump around mid-run?

### Loading / spinner

7. Do you want a small inline spinner (minimal), or a clearly visible overlay/loading panel centered on screen showing “Analyserer…” / “Genererer…” and blocking interaction?

### Explore data (analysis view)

8. “Show all results”:
   - Confirm it’s OK for these lists to be scrollable (no pagination).
   - Should sorting remain “highest first”, then alphabetical?
9. “Object types as the first field”: Do you want `OBJTYPE` displayed as a normal field section (with count/distribution) and remove the separate “Objekttyper” card/section entirely?
10. “Fields minimized + expandable pivot table”: What do you mean by pivot here?

- A) A simple frequency table: **value → count** for that field (typical), or
- B) A cross-tab: **OBJTYPE × field value** (can get heavy), or
- C) Something else?
  Note: V0 analysis currently counts only field keys (not values). To build per-field pivot tables, we must count values too (ideally lazily when a field is expanded).

### Field names from `fields.json`

11. Current V0 status: the app does not use `src/data/fields.json` in the UI yet (no mapping). Also, `fields.json` looks like it contains domain fields (GMI/surveying instruction) that don’t match the SOSI keys we see (e.g. `OBJTYPE`, `...P_TEMA`).

- Do you have a separate mapping from SOSI field code → friendly name, or should we create a new small mapping file (e.g. `src/data/field-names.json`) over time?
- When you wrote the example `"12345 (Building Height)"`: do numeric field codes actually appear in your SOSI files, or was it just an example?

### Filter view (explanation + greyed fields + buttons)

12. “Greyed out fields” (e.g. `EGS_PUNKT`, `EGS_LEDNING`): In V0 these are locked as **mandatory** fields (cannot be removed) and therefore render disabled/grey. I assume this is intentional to keep SOSI structure valid. Should they remain locked in V1?
13. Text “(keep)”: In V0 we show “Objekttyper (keep)” and “Felter (keep)”. You want this removed and replaced by a short Norwegian sentence at the top.

- Suggested sentence: “Velg hvilke objekttyper og felter som skal være med i eksporten.”
  Is that OK, or do you prefer different wording?

14. Filter actions (“Tilbakestill…”, export/import JSON, clear saved settings): Do you want these moved into an “Advanced options” dropdown/menu, with short explanations per action (tooltip/help text)?

- Which actions should remain as primary buttons next to “Gå til nedlasting”, and which should be moved into the menu?

### Desktop layout / space usage

15. “Use more screen”: Do you want full-width layout (e.g. remove `max-w-6xl`), or keep a max width but increase table/list sizing and typography?
