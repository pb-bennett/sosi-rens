# SOSI-Rens

SOSI-Rens is a small web app for cleaning SOSI files by selecting which **object types** and **fields** to keep. It provides a guided workflow (Upload → Explore → Filter → Download) and can produce output in two modes: either removing unselected fields entirely, or keeping the fields while clearing their values for maximum downstream compatibility.

The README is in English. The UI text is Norwegian Bokmål.

## Contents

- [What it does](#what-it-does)
- [Key features](#key-features)
- [How it works](#how-it-works)
- [Getting started](#getting-started)
- [Usage](#usage)
- [API](#api)
- [Project structure](#project-structure)
- [Scripts](#scripts)
- [Encoding notes](#encoding-notes)
- [Troubleshooting](#troubleshooting)
- [License](#license)

## What it does

Given a SOSI file (`.sos` / `.sosi`), SOSI-Rens helps you:

- Analyze and summarize the file content.
- Explore distributions of `OBJTYPE`, `P_TEMA` / `L_TEMA`, and other attributes.
- Filter which `OBJTYPE` values and attribute keys are kept.
- Download a cleaned SOSI file.

## Key features

- **Step-based flow**: Upload → Explore → Filter → Download.
- **Two categories**: separates filters for `Punkter` and `Ledninger`.
- **Gating to prevent mistakes**: you must visit both tabs in Filter before proceeding to Download.
- **Two output modes**:
  - `remove-fields` (default): remove unselected attribute lines.
  - `clear-values`: keep attribute keys but strip values.
- **Encoding detection**:
  - Reads `..TEGNSETT` if present.
  - Probes UTF-8, otherwise falls back to Windows-1252.
- **Runs locally and on hosted environments** (Next.js App Router).
- **Theme toggle**: `Lys` / `Mørk`.

## How it works

At a high level:

1. The uploaded file is decoded into text.
2. The text is analyzed into aggregates used by the Explore UI.
3. The selection (object types + field keys) is applied to generate a cleaned text output.
4. The cleaned text is encoded and downloaded.

Cleaning supports two strategies:

- **Remove fields**: if a key is not selected, the attribute line is dropped.
- **Clear values**: if a key is not selected, the attribute line is kept but its value is removed (e.g. `..DYBDE 1.5` becomes `..DYBDE`).

## Getting started

### Prerequisites

- Node.js (recommended: latest LTS)
- npm

### Install

```bash
npm install
```

### Run locally

```bash
npm run dev
```

Then open http://localhost:3000

### Production build

```bash
npm run build
npm run start
```

## Usage

1. **Upload**
   - Drag and drop a `.sos` / `.sosi` file, or click to select.
2. **Explore**
   - Inspect counts and distributions.
   - Expand a field to see value frequencies (computed client-side).
3. **Filter**
   - Choose object types and fields to keep.
   - You must open both `Punkter` and `Ledninger` tabs before continuing.
4. **Download**
   - Choose output mode:
     - Remove unselected fields, or
     - Keep fields but clear values.
   - Download the cleaned file.

Selections are persisted in the browser (localStorage) so you can reuse your filter setup.

## API

The app includes three API routes (Node.js runtime):

### `POST /api/analyze`

Analyzes an uploaded SOSI file and returns JSON.

- Request: `multipart/form-data`
  - `file`: the SOSI file
- Response: JSON
  - `file`: name + size
  - `encoding`: detected/used encoding metadata
  - `analysis`: aggregate counts

### `POST /api/clean`

Cleans an uploaded SOSI file and returns a downloadable binary response.

- Request: `multipart/form-data`
  - `file`: the SOSI file
  - `selection`: JSON string with `objTypesByCategory` and `fieldsByCategory`
  - `fieldMode`: `remove-fields` | `clear-values`
- Response: `application/octet-stream` with `Content-Disposition: attachment`

### `GET /api/version`

Returns build metadata used by the UI.

## Project structure

- `src/app/page.js`: main UI and client-side workflow.
- `src/app/api/*/route.js`: API routes (analyze/clean/version).
- `src/lib/sosi/*`: SOSI parsing, analysis, cleaning, and encoding helpers.
- `public/`: static assets (logo, icons).
- `scripts/`: repo utility scripts (e.g. asset generation).
- `analysis/`: analysis outputs/reports used during development.

## Scripts

- `npm run dev`: start local dev server.
- `npm run build`: production build.
- `npm run start`: run production server.
- `npm run lint`: ESLint.
- `npm run assets:build`: regenerate PNG/ICO assets from the logo.

## Encoding notes

SOSI files may be encoded as UTF-8 or single-byte encodings (commonly ISO-8859-1 / Windows-1252). SOSI-Rens attempts to:

1. Read `..TEGNSETT` from the header (if present).
2. Otherwise, decode a sample as UTF-8 and check if it looks valid.
3. Fall back to Windows-1252 if UTF-8 appears broken.

When downloading a cleaned file, the output is encoded using the same encoding that was detected/used for decoding.

## Troubleshooting

- **Upload works but download fails**: try the other output mode on the Download step.
- **Strange characters (ÆØÅ) in output**: check the encoding banner; the file may have been decoded with a fallback encoding.
- **Large files**: the app will prefer client-side processing in the browser.

## License

See [LICENSE](LICENSE).
