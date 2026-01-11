# OBJTYPE ↔ Tema (P_TEMA / L_TEMA) relationships

Generated: 2026-01-10

## Inputs

- SOSI file: `REF_FILES/EXAMPLE_SOSI/20260108_VA_eksport-kommunalt(ingen filter).sos`
  - Declared encoding: `..TEGNSETT ISO8859-1`
  - File contains both `.PUNKT` (punkter) and `.KURVE` (ledninger)
- Reference code lists:
  - `src/data/fields.json` → `fieldKey: Tema_punkt` (72 codes)
  - `src/data/fields.json` → `fieldKey: Tema_led` (73 codes)

## How values are represented in the SOSI file

In the example file, the relevant values appear inside the EGS groups:

- Points (`.PUNKT …`):
  - `..OBJTYPE <text>` (e.g. `Kum`, `Sluk`, `Påkoplingspunkt`)
  - `..EGS_PUNKT` … `...P_TEMA <code>` (short code, typically 2–5 chars)

Example (from the start of the file):

```sosi
.PUNKT 1:
..OBJTYPE Kum
..EGS_PUNKT
...P_TEMA KUM
```

- Lines (`.KURVE …`):
  - `..OBJTYPE <text>`
  - `..EGS_LEDNING` … `...L_TEMA <code>`

(There were **no** cases of `P_TEMA` appearing on `.KURVE` features, and **no** cases of `L_TEMA` appearing on `.PUNKT` features in this file.)

## High-level counts

### Punkter

- `.PUNKT` features: **36,942**
- `OBJTYPE` present: **36,942 / 36,942**
- `P_TEMA` present: **26,467 / 36,942** (≈ **71.6%**)
- `P_TEMA` missing: **10,475 / 36,942** (≈ **28.4%**)
  - In this file, _all_ missing `P_TEMA` are `OBJTYPE = VADRIFTSDATA` (**10,475** items)
- Distinct `P_TEMA` codes observed: **98**

Top `P_TEMA` codes (count):

- `KUM`: 8,126
- `SVA`: 2,918
- `GRN`: 2,498
- `ANB`: 2,425
- `STK`: 2,329
- `SLU`: 1,384
- `BVA`: 1,168

Top `OBJTYPE` values (count):

- `VADRIFTSDATA`: 10,475
- `KUM`: 8,126
- `PÅKOPLINGSPUNKT`: 5,640
- `STENGEVENTIL`: 2,924
- `GRENPUNKT`: 2,498
- `SLUK`: 2,255

### Ledninger

- `.KURVE` features: **13,859**
- `OBJTYPE` present: **13,859 / 13,859**
- `L_TEMA` present: **13,859 / 13,859** (**100%**)
- Distinct `L_TEMA` codes observed: **39**

Top `L_TEMA` codes (count):

- `OV`: 5,344
- `SP`: 3,443
- `VL`: 2,864
- `AF`: 981
- `SPP`: 240
- `HU`: 210

Top `OBJTYPE` values (count):

- `OVERVANNSLEDNING`: 5,370
- `SPILLVANNSLEDNING`: 3,808
- `VANNLEDNING`: 2,864
- `AVLØPFELLES`: 1,144

## Observed relationship patterns

### 1) Many Tema codes are effectively 1:1 with OBJTYPE

For a large portion of the data, `P_TEMA`/`L_TEMA` uniquely identifies the `OBJTYPE` (in this file).

Examples (puncter):

- `P_TEMA = KUM` → `OBJTYPE = KUM` (**8,126 / 8,126**)
- `P_TEMA = GRN` → `OBJTYPE = GRENPUNKT` (**2,498 / 2,498**)
- `P_TEMA = SVA` → `OBJTYPE = STENGEVENTIL` (**2,918 / 2,918**)

Examples (ledninger):

- `OBJTYPE = VANNLEDNING` → `L_TEMA = VL` (**2,864 / 2,864**)
- `OBJTYPE = OVERVANNSLEDNING` → mostly `L_TEMA = OV` (**5,344 / 5,370**, ≈ **99.5%**)

### 2) Some OBJTYPE values use Tema as a _subtype_ discriminator

Here, the _same_ `OBJTYPE` occurs with multiple Tema codes, and Tema appears to differentiate subtypes.

Notable examples (punkter):

- `OBJTYPE = PÅKOPLINGSPUNKT` (5,640) splits across **5** `P_TEMA` codes:

  - `ANB` (2,425)
  - `STK` (2,329)
  - `STO` (845)
  - `STV` (35)
  - `ANK` (6)

- `OBJTYPE = SLUK` (2,255) splits across **3** `P_TEMA` codes:
  - `SLU` (1,384)
  - `SLS` (869)
  - `SLG` (2)

Notable examples (ledninger):

- `OBJTYPE = SPILLVANNSLEDNING` (3,808) splits across multiple `L_TEMA` codes:
  - `SP` (3,443) ≈ **90.4%**
  - `SPP` (240)
  - `SPO` (125)
  - (plus a small tail like `SPLU`, see the JSON output)

### 3) The specific “SLK vs KUM” question

In this file, I did **not** observe a `P_TEMA` value `SLK`.

What _is_ present is:

- `OBJTYPE = SLUK` (2,255)
- `P_TEMA` values related to sluk: `SLU` (1,384), `SLS` (869), `SLG` (2)

And empirically:

- `P_TEMA = SLU` maps to `OBJTYPE = SLUK` (**1,384 / 1,384**)
- `P_TEMA = KUM` maps to `OBJTYPE = KUM` (**8,126 / 8,126**)

So based on this example export, the “sluk” tema codes are **not** represented as `OBJTYPE = KUM`.

## Comparison to `fields.json` Tema code lists

### Punkter (`Tema_punkt`)

- `fields.json` declares **72** acceptable codes.
- The SOSI file uses **98** distinct `P_TEMA` codes.
- Intersection (codes present in _both_): **37**.

This means:

- **61** `P_TEMA` codes in the SOSI file are _not_ listed in `fields.json`.
- Many acceptable values in `fields.json` do not appear in this export (which can be normal for a specific municipality/export).

Top `P_TEMA` codes that are **in the SOSI file but not in `fields.json`** (count):

- `SVA`: 2,918
- `STK`: 2,329
- `BVA`: 1,168
- `STO`: 845
- `FALLP`: 701
- `UTA`: 294

There are also a few “near-miss” spelling differences (example):

- SOSI uses `FORAKONSTR`, while `fields.json` includes `FORAKONST`.

### Ledninger (`Tema_led`)

- `fields.json` declares **73** acceptable codes.
- The SOSI file uses **39** distinct `L_TEMA` codes.
- Intersection (codes present in _both_): **18**.

Top `L_TEMA` codes that are **in the SOSI file but not in `fields.json`** (count):

- `HU`: 210
- `HK`: 134
- `HM`: 102
- `HL`: 22
- `SK`: 15
- `SPUNT`: 14

## Notes / limitations

- This is an empirical analysis of _one_ export. It shows how Gemini VA represented these fields here; it does not prove semantic equivalence across municipalities or exports.
- The parser treats the first seen `OBJTYPE` / `P_TEMA` / `L_TEMA` within each `.PUNKT`/`.KURVE` feature as the value for that feature.
- Full raw aggregates are saved in:
  - `analysis/tema-objtype-relations.json`

If you want, I can extend the report with a full appendix listing every `OBJTYPE` → Tema distribution (or vice versa), but that will be long.
