This is a new file created to store instructions for the AI copilot. The app will be outlined together with specific instructions on how the AI should assist in its development.

# SOSI-Rens

## Overview

In the management of the public water and waste infrastucture in the kommune where I work there is an internal GIS database where details of the entire network are stored. There is also a public facing map system not directly linked to the internal databse. To update the public map system, data is exported from the internal GIS database in SOSI format, then manually edited to remove sensitive information before being imported into the public map system. This manual editing process is time consuming and error prone.

## Purpose

SOSI-Rens is a web application to allow a user to upload a SOSI file, view its contents in a structured format, and then decide which objects and fields to retain before downloading a new, reduced SOSI file. The goal is to make the process of cleaning SOSI files faster and less error prone.

## Target Users

The target users are GIS technicians working in the public water and waste department of a Norwegian kommune. The users will have a good understanding of GIS concepts and the SOSI file format, but may not have advanced technical skills.

## Key Features

1. File Upload: The user will be greeted with an "upload file" screen toghether with the otion to drag and drop a SOSI file or click to select a file from their computer.
2. File Parsing: Once a file is uploaded, the application will parse the SOSI file and extract its contents into a structured format.
3. Data Visualization: The parsed data will be displayed in a user-friendly interface, allowing the user to easily navigate through the different objects and fields in the SOSI file. Pivot tables and other statistical data visualizations may be used to help the user understand the contents of the file.
4. Field Selection: The user will be able to select which objects and fields to retain or remove from the SOSI file using checkboxes or similar UI elements.
5. Default values will be built in to the application to automatically deselect commonly removed fields to speed up the process for the user. The user has the option to modify these default selections.
6. File Download: After the user has made their selections, they can click a "download" button to generate a new SOSI file containing only the selected objects and fields, which can then be downloaded to their computer.
7. Error Handling: The application will include error handling to manage issues such as invalid file formats or parsing errors, providing clear feedback to the user.
8. No data will be stored on the server after the user has downloaded their cleaned SOSI file to ensure privacy and security.
9. The user's filter settings will be maintained in the user's browser using local storage so that they do not have to reselect their preferences each time they use the application.
10. The application is aimed for users on desktop computers and will be optimized for use on larger screens.
11. A clean, modern and intuitive user interface to ensure ease of use.
12. UI will be in Norwegian Bokmål - this is important as the target users are Norwegian.
13. Punkter and Ledninger must have their own sections/tabs throughout the app (upload → explore data → filter → download). Defaults and selections should be independent per tab.

## Technology Stack

1. Next.js for a frontend/backend framework. Javascript only.
2. Tailwind CSS for styling.
3. investigate "npm i sosijs" for SOSI file parsing and generation.
4. No database or persistent storage.
5. Deployment on Vercel.

## AI Copilot Instructions

1. Assist in setting up the Next.js project structure with appropriate pages and components. Remove all uneeded boilerplate code.
2. Take a deep dive into the SOSI file format and help implement the parsing and generation logic using sosijs or other suitable libraries. An example file will be provided for analysis and testing. The file is realtively large (20+ mb) so efficiency in parsing and generation is important.
3. A clear overview of objects fields from the innmålingsinstruks provided by Gemini VA will be included to help identify and describe the object types. This innstruks is aimed at contractors delivering survey data to the kommune in the .GMI format, not SOSI - however there is significant overlap in the object types and fields used. The file is found here: `/src/data/fields.json`
4. Reference files will be included in a directory called `/REF_FILES` in the project root. These should be added to .gitignore to avoid being deployed.
5. Help design and implement the user interface using Tailwind CSS, ensuring it is clean, modern, and intuitive.
6. Investigate how state management can be handled effectively in the application, considering the size of the SOSI files and the need for performance. No data can persist on the server.
7. Implement local storage to save user filter settings between sessions.
8. Ensure the application is optimized for desktop use and larger screens.
9. Provide error handling mechanisms for file upload, parsing, and generation processes.
10. Ensure the UI is in Norwegian Bokmål, including all buttons, labels, and messages.
11. Assist in deploying the application to Vercel, ensuring all environment settings are correctly configured.
12. Follow best practices for code quality, including modularity, readability, and maintainability.
13. Ensure compliance with the MIT License as outlined in the LICENSE file.
14. Provide documentation and comments within the code to explain the functionality and assist future developers
15. Work on producing an initial version with minimal input from me. Once a working prototype is available I will provide feedback for further refinements and features.

## Questions to Answer

### Product & Scope

- What is the MVP scope for v0 (e.g., upload → filter → download only)? `Upload -> Exlore data -> filter -> download`
- Should the app remain strictly single-user/local-in-browser, or do you expect authentication/roles? `Single-user/local-in-browser - parsing and analysis can happen on the server via Next.js API routes as long as no data is persisted. We need to think about how state can be managed efficiently for large files.`
- Do we support additional file types (e.g., `.sos`, `.sosi`, zipped exports) or just SOSI? `SOSI files have the extension .sos or .sosi - we should support both. Zipped exports are not required for v0.`
- Should we support both object-level and field-level filtering, or focus on field filtering within objects? `Both object-level and field-level filtering are required. For example only retain certain object types, and within those objects only retain certain fields.`

### Privacy, Security & Compliance

- What counts as “sensitive information” that must be removed (specific object types, fields, geometries)? `This will be defined by leadership in the kommune, we will build the v0 based on my input, but provide all options in an easily understandable way so that the kommune can define their own policies later and these can be incorporated in future versions.`
- Does the app need to work fully offline after the initial load, or is online-only acceptable? `Online-only is acceptable for v0.`
- Any municipality policies we need to follow regarding client-side data handling, logging, or hosting on Vercel? `No data can be persisted on the server after the user has downloaded their cleaned SOSI file. No logging of user data. Hosting on Vercel is acceptable.`
- Should we add a disclaimer/confirmation before export about user responsibility for the cleaned data? `Yes, a disclaimer should be added before export.`

### SOSI Parsing Requirements

- **Encoding note:** SOSI files may use single-byte encodings (e.g., Windows-1252 / ISO-8859-1) instead of UTF-8. The app should try decoding as UTF-8 first and, if decoding fails or yields invalid characters, fall back to Windows-1252 (CP1252) or ISO-8859-1 and convert the content to UTF-8 for internal processing and saved fixtures. Display a brief non-blocking notice when a fallback was used.

- Which SOSI versions or dialects must be supported, and are there known quirks to handle? `We need to base this on the example file/files provided, these will be exported from the program Gemini VA and should follow standard SOSI 4.0 conventions. The downloaded cleaned files must hae identical format, just less data. I am thinking that we can keep the same field names, just delete the data values. Plenty of examples of data fields missing data will be in the example files.`
- Do we need byte-for-byte formatting preservation, or just semantically equivalent output? `Semantically equivalent output is acceptable, byte-for-byte preservation is not required. However the structure of the SOSI file must be identical, just with less data.`
- Should ordering, comments, whitespace, and unknown fields be preserved in the cleaned file? `Ordering should be preserved where possible. Comments and whitespace preservation is not required. Unknown fields should be preserved in the cleaned file.`
- Do you want geometry previews, or only the attribute table view? `Only the attribute table view is required for v0. Later versions may include a map overview. Probably Leaflet.js would be a good choice for that.`

### Performance & Large Files

- Must parsing happen fully in the browser, or can we leverage Next.js API routes while keeping no persistence? `We can leverage Next.js API routes for parsing while ensuring no data is persisted on the server after download. This will help with performance for large files.`
- Should we aim for worker/streaming-based parsing from day one, or start with a synchronous parse and iterate? `Start with a synchronous parse for v0 to get the basic functionality working, then iterate to improve performance with worker/streaming-based parsing if needed.`
- What is the expected performance target (e.g., process a 20MB file in under 10s) on typical hardware? `Aim to process a 20MB file in under 15 seconds on typical desktop hardware for v0.`
- How should we handle files that are too large (warn, reject, partial load)? `Warn the user if the file is too large (e.g., over 50MB) and suggest breaking it into smaller files. Reject files that exceed a certain size limit (e.g., 100MB) with a clear error message. We need to experiment, but if this is used in larger kommuners it may need to handle larger files later.`

### Filtering UX & Defaults

- How should defaults be defined (static config per object type, per field, or user presets)? `Static config per object type and field for v0, with the ability for users to modify selections and have these saved in local storage for future sessions. `
- Should defaults be editable/exportable so users can share presets across machines? `Yes, users should be able to export/import their filter settings as a JSON file for sharing presets across machines. Use JSON.stringify/parse for this.`
- Do we lean on an include-list (“keep”) or exclude-list (“remove”) UX model? `An include-list ("keep") model is preferred, where users select which objects and fields to retain. Check boxes for each object type and field would be a good approach. Object type will be a field and should be the first field to be examined`
- Are bulk actions like “select all/none”, “reset to defaults”, or “apply to all objects” required? `Yes, bulk actions like "select all/none", "reset to defaults", and "apply to all objects" are required for better usability.`

### Data Visualization

- What visualizations are essential vs optional (counts by type, pivot tables, summaries)? `Counts by type and summaries are essential for v0. Pivot tables should also be available, and should be fairly easy to implement.`
- Would a searchable schema explorer tied to `/src/data/fields.json` be valuable? `Yes, a searchable schema explorer tied to `/src/data/fields.json` would be valuable for users to understand the object types and fields available in the SOSI file.`
- Do we need to show raw SOSI text next to the structured view for auditing? `Showing raw SOSI text is not required for v0, but could be considered for future versions if users request it.`

### Norwegian Bokmål & Terminology

- Do you have preferred domain terms for UI labels (e.g., “objekt”, “egenskap”, “utvalg”)? `Yes, preferred terms are "objekt" for object, "egenskap" for field/property, and "utvalg" for selection/filter. These can be refined further based on user feedback.`
- Should the tone be formal, instructional, or conversational for help/error text? `A formal and instructional tone is preferred for help and error text to maintain professionalism.`
- Prefer municipality-specific wording or neutral Bokmål? `Neutral Bokmål is preferred to ensure broader usability across different kommunes.`

### State Management & Local Storage

- Which preferences should persist (field selections, UI sections, last file name, etc.)? `Field selections and last used file name should persist in local storage for user convenience. UI sections state (e.g., expanded/collapsed) can also be persisted if feasible.`
- Do you need per-file presets or global presets? `Global presets are sufficient for v0, where user selections apply across all files.`
- Should we add a “clear saved settings” control for shared workstations? `Yes, a "clear saved settings" control should be added to allow users on shared workstations to reset their preferences easily. `

### Project Structure & Engineering

- Confirm that “JavaScript only” means no TypeScript anywhere (including config files). `Yes, "JavaScript only" means no TypeScript anywhere in the project, including config files.`
- Any constraints on dependencies (trial minimal vs accepting larger libs)? `Aim for minimal dependencies to keep the project lightweight, but accept larger libraries if they significantly enhance functionality or developer productivity.`
- Should we set up linting/formatting (ESLint/Prettier) upfront, or keep it minimal? `Set up linting/formatting with ESLint and Prettier upfront to ensure code quality and consistency from the start.`

### Reference Materials & Hygiene

- Confirm `/REF_FILES` should be ignored (and add to `.gitignore` if not already). `Yes, `/REF_FILES`should be ignored and added to`.gitignore` to prevent deployment of large reference files.`
- Will `/src/data/fields.json` be the primary source of truth for object definitions? `Yes, `/src/data/fields.json` will be the primary source of truth for object definitions and field descriptions. Some fields may not be covered, so we may need to allow for unknown fields in the SOSI files. We can develop a more comprehensive schema later via user feedback from me.`
- Should we commit small anonymized SOSI fixtures for testing while ignoring the large real files? `Yes, commit small anonymized SOSI fixtures for testing purposes while ignoring the large real files in `/REF_FILES`. This will help with development and testing without bloating the repository.`

## SOSI Example File Analysis (Gemini VA export)

This section is generated by the analysis script at `scripts/analyze-sosi.mjs` using both:

- A streaming, line-based SOSI scan (fast counts + field discovery)
- `sosijs` parsing (sanity check + validation)

Artifacts:

- `analysis/sosi-report.json` (machine-readable)
- `analysis/sosi-report.md` (human-readable)

High-level notes:

- The file declares `..TEGNSETT ISO8859-1` (single-byte encoding). This is why we must support encoding fallback/decoding behavior in the app.
- Total unique field keys observed across all object types: **129**.

### Summary

- File: `REF_FILES/EXAMPLE_SOSI/20260108_VA_eksport-kommunalt(ingen filter).sos`
- Size: 23.35 MB
- Encoding: detected=latin1 used=latin1
- Lines: 1,282,968
- Parsed features (by section scan): 66,691
- sosijs parse: ok (66,689 features)

### Feature Sections

- .PUNKT: 36942
- .TEKST: 15888
- .KURVE: 13859
- .HODE: 1
- .SLUTT: 1

### Object Types (OBJTYPE)

- VAPåskrift: 14609
- VADriftsdata: 10475
- Kum: 8126
- Påkoplingspunkt: 5640
- Overvannsledning: 5370
- Spillvannsledning: 3808
- Stengeventil: 2924
- Vannledning: 2864
- Grenpunkt: 2498
- Sluk: 2255
- Brannventil: 1313
- Fritekstkart: 1279
- AvløpFelles: 1144
- TrasepunktLedn: 824
- VASymbol: 701
- Utviser: 437
- Trekkrør: 322
- Utslipp: 314
- AnnetUtstyrVA: 228
- Lufteventil: 211
- HjelpepunktVA: 199
- Kran: 162
- Sandfangskum: 138
- Signalkabeltrase: 135
- AnnetPunktVA: 114
- Drensledning: 103
- Overløp: 97
- Pumpestasjon: 95
- Inntak: 92
- HjelpelinjeVA: 78
- Gategutt: 34
- Hydrant: 17
- TankVA: 12
- Ventilpunkt: 11
- AnnenLedningVA: 10
- Fordrøyningsbasseng: 9
- JordkabelLSP: 9
- LuftledningLSP: 9
- Reduksjonsventil: 6
- Spuntvegger: 5
- Reduksjon: 3
- Basseng: 2
- Brønn: 1
- KanalGrøft: 1
- LednTraseseksjon: 1
- Oljeutskiller: 1
- Renseanlegg: 1
- Septiktank: 1
- Slamavskiller: 1

### Themes (P_TEMA, from point objects)

`P_TEMA` labels are sourced from `src/data/fields.json` fieldKey `Tema_punkt` (acceptableValues).

- KUM (Kum): 8126
- SVA: 2918
- GRN (Grenpunkt): 2498
- ANB (Anboring): 2425
- STK: 2329
- SLU (Sluk): 1384
- BVA: 1168
- SLS (Sluk m/sandfang): 869
- STO: 845
- DIV (Div. ledningspkt): 824
- FALLP: 701
- UTS (Utløp): 314
- UTA: 294
- KRN (Kran): 162
- SAN (Sandfangskum): 138
- LVB: 136
- UTB: 135
- BVC: 132
- OVL (Overløp): 97
- MM: 82
- PSP (Pumpestasjon(sp)): 66
- LVA: 59
- IG: 56
- INB (Bekkeinntak): 56
- HP\_: 51

### Themes (L_TEMA, from ledning/curve objects)

`L_TEMA` labels are sourced from `src/data/fields.json` fieldKey `Tema_led` (acceptableValues).

- OV (Overvannsledning): 5344
- SP (Spillvannsledning): 3443
- VL (Vannledning): 2864
- AF (Avløp felles ledning): 981
- SPP (Spillvann pumpeledning): 240
- HU: 210
- AFO (Avløp felles overløpsledning): 163
- HK: 134
- SPO (Spillvann overløpsledning): 125
- DR (Drensledning): 103
- HM: 102

### Most Common Fields (presence count)

- DATAUTTAKSDATO: 50801
- NØ: 45853
- GUID: 39625
- EGS_PUNKT: 36942
- KVALITET: 34496
- SID: 33763
- REGDATO: 33118
- EIER: 30252
- STATUS: 28498
- P_TEMA: 26467
- ANLEGGSÅR: 23318
- ENDREDATO: 21587
- NØH: 20836
- ENDRESIGN: 17681
- STRENG: 15888
- REGSIGN: 15578
- SROT: 15125
- DRIFTSANSV: 14921
- BRUKER_FUNKSJON: 14628
- FUNKSJON: 14628
- MÅLEMETODE_TOPPZ: 14628
- NØYAKTIGHET_TOPPZ: 14628
- TOPPLOKKH: 14628
- INFORMASJON: 14609
- HBUNN: 14336
- LSID: 14041
- EGS_LEDNING: 13859
- L_TEMA: 13859
- LENGDE: 13859
- TEMAGRUPPE: 13326
- NETTYPE: 13243
- INNVUTV_DIM: 13210
- DIMENSJON: 13088
- MATERIAL: 13068
- FORM: 13045
