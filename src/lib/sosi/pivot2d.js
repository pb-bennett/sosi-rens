/**
 * @file pivot2d.js
 * Performance-aware 2D pivot (crosstab) computation for SOSI text.
 *
 * Design goals:
 * - No global precomputation; compute on-demand for a chosen (primary, secondary) field pair.
 * - Avoid splitting large files into arrays.
 * - Enforce caps (Top-N columns + "Andre", row cap + "Andre").
 * - Support multi-valued fields by exploding contributions.
 * - Support numeric secondary binning (equal-width, optional quantile via sampling).
 */

/**
 * Iterate over lines in a string without splitting into a large array.
 * Handles both LF and CRLF line endings.
 * @param {string} text
 * @param {(line: string) => void} onLine
 */
function forEachLine(text, onLine) {
  const str = String(text || '');
  let start = 0;
  for (;;) {
    const idx = str.indexOf('\n', start);
    if (idx === -1) {
      const last = str.slice(start);
      onLine(last.endsWith('\r') ? last.slice(0, -1) : last);
      return;
    }
    const line = str.slice(start, idx);
    onLine(line.endsWith('\r') ? line.slice(0, -1) : line);
    start = idx + 1;
  }
}

/**
 * Check if a line starts a new SOSI feature block.
 * @param {string} line
 * @returns {boolean}
 */
function isFeatureStartLine(line) {
  return /^\.(?!\.)[A-ZÆØÅa-zæøå]+\b/.test(String(line));
}

/**
 * Extract uppercased attribute key from a SOSI attribute line.
 * @param {string} line
 * @returns {string | null}
 */
function extractKeyFromAttributeLine(line) {
  const match = String(line).match(/^\.{2,}(\S+)/);
  return match ? String(match[1]).toUpperCase() : null;
}

/**
 * Extract SOSI section name from a feature-start line.
 * @param {string} line
 * @returns {string | null}
 */
function getSectionName(line) {
  const match = String(line).match(/^\.(?!\.)\s*([A-ZÆØÅa-zæøå]+)/);
  if (!match) return null;
  return `.${String(match[1]).toUpperCase()}`;
}

/**
 * Map a section name to app category.
 * @param {string | null} section
 * @returns {'punkter' | 'ledninger' | 'unknown'}
 */
function categorizeSection(section) {
  if (!section) return 'unknown';
  if (section === '.KURVE') return 'ledninger';
  if (section === '.PUNKT' || section === '.TEKST') return 'punkter';
  return 'unknown';
}

/**
 * Make a (Tom) placeholder label.
 * Kept lower-case to match existing app behavior.
 */
export const TOM_LABEL = '(tom)';

/**
 * @typedef {'equal-width' | 'quantile'} NumericBinningMode
 */

/**
 * @typedef {Object} Pivot2DOptions
 * @property {number} [topColumns=25] - Max number of columns (Top-N) before grouping remaining as "Andre".
 * @property {number} [rowCap=200] - Max number of rows before grouping remaining as "Andre".
 * @property {number} [numericBins=10] - Bin count for numeric secondary fields.
 * @property {NumericBinningMode} [numericBinning='equal-width'] - Binning strategy.
 * @property {number} [quantileSampleSize=50000] - Max sample size for quantile cut points.
 */

/**
 * @typedef {Object} Pivot2DResult
 * @property {string[]} rows - Row labels (includes "Andre" when capped)
 * @property {string[]} cols - Column labels (includes "Andre" when capped)
 * @property {Record<string, Record<string, number>>} cells - cell counts [row][col]
 * @property {Record<string, number>} rowTotals
 * @property {Record<string, number>} colTotals
 * @property {number} grandTotal
 * @property {Object} meta
 * @property {boolean} meta.exploded - Whether any multi-valued field was exploded
 * @property {boolean} meta.secondaryIsNumeric
 * @property {string | null} meta.note
 */

function toNumberOrNull(value) {
  // SOSI numbers may use comma as decimal separator.
  const trimmed = String(value || '').trim();
  if (!trimmed) return null;
  const n = Number(trimmed.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function labelNumericBin(lower, upper, isLast) {
  // Keep labels compact; no locale-specific formatting to avoid confusion with decimals.
  const a = String(lower);
  const b = String(upper);
  return isLast ? `[${a}–${b}]` : `[${a}–${b})`;
}

function computeEqualWidthBinEdgesFromRange(min, max, binCount) {
  // Uses global min/max across the file to avoid sample bias.
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  if (min === max) {
    // Degenerate range: one bin.
    return { min, max, edges: [min, max] };
  }
  const bins = Math.max(1, Math.floor(binCount || 10));
  const width = (max - min) / bins;
  const edges = [min];
  for (let i = 1; i < bins; i += 1) edges.push(min + width * i);
  edges.push(max);
  return { min, max, edges };
}

function assignEqualWidthBin(value, edges) {
  const bins = Math.max(1, edges.length - 1);
  if (bins === 1) return 0;
  const min = edges[0];
  const max = edges[edges.length - 1];
  if (value <= min) return 0;
  if (value >= max) return bins - 1;
  // Find bin index by proportional position.
  const width = (max - min) / bins;
  const idx = Math.floor((value - min) / width);
  return Math.max(0, Math.min(bins - 1, idx));
}

function computeQuantileCutPoints(sample, binCount) {
  const bins = Math.max(1, Math.floor(binCount || 10));
  if (sample.length === 0) return null;
  const sorted = [...sample].sort((a, b) => a - b);
  if (sorted[0] === sorted[sorted.length - 1]) {
    return { cutPoints: [sorted[0], sorted[sorted.length - 1]] };
  }
  const cutPoints = [sorted[0]];
  for (let i = 1; i < bins; i += 1) {
    const q = i / bins;
    const idx = Math.floor(q * (sorted.length - 1));
    cutPoints.push(sorted[idx]);
  }
  cutPoints.push(sorted[sorted.length - 1]);
  // Ensure non-decreasing.
  for (let i = 1; i < cutPoints.length; i += 1) {
    if (cutPoints[i] < cutPoints[i - 1])
      cutPoints[i] = cutPoints[i - 1];
  }
  return { cutPoints };
}

function assignQuantileBin(value, cutPoints) {
  const bins = Math.max(1, cutPoints.length - 1);
  if (bins === 1) return 0;
  // Linear scan is fine for <= ~10 bins.
  for (let i = 0; i < bins; i += 1) {
    const lower = cutPoints[i];
    const upper = cutPoints[i + 1];
    if (i === bins - 1) {
      if (value >= lower && value <= upper) return i;
    } else {
      if (value >= lower && value < upper) return i;
    }
  }
  return bins - 1;
}

function pickTopKeys(counter, limit) {
  const entries = Object.entries(counter || {});
  entries.sort(
    (a, b) =>
      (b[1] || 0) - (a[1] || 0) ||
      String(a[0]).localeCompare(String(b[0]))
  );
  return entries.slice(0, Math.max(0, limit || 0)).map(([k]) => k);
}

function incNested(cells, rowKey, colKey, by = 1) {
  if (!cells[rowKey]) cells[rowKey] = {};
  cells[rowKey][colKey] = (cells[rowKey][colKey] || 0) + by;
}

/**
 * Compute a 2D pivot (crosstab) for one category.
 *
 * Notes:
 * - Uses two streaming passes over the file to keep memory bounded:
 *   pass 1: determine Top-N columns and Top-N rows (by frequency)
 *   pass 2: compute the actual crosstab with "Andre" buckets.
 * - Missing values are represented as `(tom)`.
 * - Multi-valued fields are exploded (one object can contribute to multiple cells).
 *
 * @param {string} sosiText
 * @param {'punkter' | 'ledninger'} category
 * @param {string} primaryFieldUpper
 * @param {string} secondaryFieldUpper
 * @param {Pivot2DOptions} [options]
 * @returns {Pivot2DResult}
 */
export function computePivot2D(
  sosiText,
  category,
  primaryFieldUpper,
  secondaryFieldUpper,
  options = {}
) {
  const topColumns = Number.isFinite(options.topColumns)
    ? options.topColumns
    : 25;
  const rowCap = Number.isFinite(options.rowCap)
    ? options.rowCap
    : 200;
  const numericBins = Number.isFinite(options.numericBins)
    ? options.numericBins
    : 10;
  const numericBinning = options.numericBinning || 'equal-width';
  const quantileSampleSize = Number.isFinite(
    options.quantileSampleSize
  )
    ? options.quantileSampleSize
    : 50000;

  const primaryKey = String(primaryFieldUpper || '').toUpperCase();
  const secondaryKey = String(
    secondaryFieldUpper || ''
  ).toUpperCase();
  if (!sosiText || !primaryKey || !secondaryKey) {
    return {
      rows: [],
      cols: [],
      cells: {},
      rowTotals: {},
      colTotals: {},
      grandTotal: 0,
      meta: {
        exploded: false,
        secondaryIsNumeric: false,
        note: null,
      },
    };
  }

  // Special-case OBJTYPE: it is stored as `..OBJTYPE`, not `...OBJTYPE`.
  const primaryIsObjType = primaryKey === 'OBJTYPE';
  const secondaryIsObjType = secondaryKey === 'OBJTYPE';

  /** @type {Record<string, number>} */
  const primaryCounts = {};
  /** @type {Record<string, number>} */
  const secondaryCounts = {};

  let currentCategory = 'unknown';
  let currentSection = null;

  /** @type {Record<string, string[]>} */
  let blockValues = {};
  let exploded = false;

  /** @type {number[]} */
  const secondaryNumericSample = [];
  let secondaryNumericSeenCount = 0;
  let secondaryNumericMin = Infinity;
  let secondaryNumericMax = -Infinity;
  let secondaryNonNumericSeen = false;
  let secondaryNumericSeen = false;

  function resetBlock() {
    blockValues = {};
  }

  function addValue(keyUpper, rawValue) {
    const key = String(keyUpper || '').toUpperCase();
    const value = String(rawValue || '').trim();
    if (!blockValues[key]) blockValues[key] = [];
    blockValues[key].push(value);
    if (blockValues[key].length > 1) exploded = true;
  }

  function finalizeBlockPass1() {
    if (currentCategory !== category) return;

    let pVals = blockValues[primaryKey] || [];
    let sVals = blockValues[secondaryKey] || [];

    if (pVals.length === 0) pVals = [TOM_LABEL];
    if (sVals.length === 0) sVals = [TOM_LABEL];

    // Normalize empties.
    pVals = pVals.map((v) => (v ? v : TOM_LABEL));
    sVals = sVals.map((v) => (v ? v : TOM_LABEL));

    // Detect numeric secondary based on observed values.
    for (const v of sVals) {
      if (v === TOM_LABEL) continue;
      const n = toNumberOrNull(v);
      if (n === null) {
        secondaryNonNumericSeen = true;
      } else {
        secondaryNumericSeen = true;
        secondaryNumericSeenCount += 1;
        if (n < secondaryNumericMin) secondaryNumericMin = n;
        if (n > secondaryNumericMax) secondaryNumericMax = n;
        if (secondaryNumericSample.length < quantileSampleSize) {
          secondaryNumericSample.push(n);
        } else {
          // Reservoir sampling for optional quantile cut points.
          const j = Math.floor(
            Math.random() * secondaryNumericSeenCount
          );
          if (j < quantileSampleSize) {
            secondaryNumericSample[j] = n;
          }
        }
      }
    }

    // Explode (cartesian product) contributions.
    if (pVals.length > 1 || sVals.length > 1) exploded = true;
    for (const p of pVals)
      primaryCounts[p] = (primaryCounts[p] || 0) + 1;
    for (const s of sVals)
      secondaryCounts[s] = (secondaryCounts[s] || 0) + 1;
  }

  // Pass 1: determine distributions.
  resetBlock();
  forEachLine(sosiText, (rawLine) => {
    const line = String(rawLine || '');
    if (!line) return;

    if (isFeatureStartLine(line)) {
      finalizeBlockPass1();
      currentSection = getSectionName(line);
      currentCategory = categorizeSection(currentSection);
      resetBlock();
      return;
    }

    if (currentCategory !== category) return;

    if (primaryIsObjType && line.startsWith('..OBJTYPE')) {
      addValue('OBJTYPE', line.replace('..OBJTYPE', '').trim());
      return;
    }

    if (secondaryIsObjType && line.startsWith('..OBJTYPE')) {
      addValue('OBJTYPE', line.replace('..OBJTYPE', '').trim());
      return;
    }

    if (!(line.startsWith('..') || line.startsWith('...'))) return;
    const key = extractKeyFromAttributeLine(line);
    if (!key) return;
    if (key !== primaryKey && key !== secondaryKey) return;

    const value = String(line)
      .replace(/^\.{2,}\S+/, '')
      .trim();
    addValue(key, value);
  });
  finalizeBlockPass1();

  const secondaryIsNumeric = !!(
    secondaryNumericSeen && !secondaryNonNumericSeen
  );

  // If numeric secondary, bin values *before* picking Top-N columns.
  /** @type {(raw: string) => string} */
  let normalizeSecondary = (raw) => raw;

  if (secondaryIsNumeric) {
    const numericValues = secondaryNumericSample;
    if (numericBinning === 'quantile') {
      const res = computeQuantileCutPoints(
        numericValues,
        numericBins
      );
      const cutPoints = res?.cutPoints || null;
      if (cutPoints) {
        normalizeSecondary = (raw) => {
          if (raw === TOM_LABEL) return TOM_LABEL;
          const n = toNumberOrNull(raw);
          if (n === null) return TOM_LABEL;
          const idx = assignQuantileBin(n, cutPoints);
          const lower = cutPoints[idx];
          const upper = cutPoints[idx + 1];
          return labelNumericBin(
            lower,
            upper,
            idx === cutPoints.length - 2
          );
        };
      }
    } else {
      const edgesRes = computeEqualWidthBinEdgesFromRange(
        secondaryNumericMin,
        secondaryNumericMax,
        numericBins
      );
      const edges = edgesRes?.edges || null;
      if (edges) {
        normalizeSecondary = (raw) => {
          if (raw === TOM_LABEL) return TOM_LABEL;
          const n = toNumberOrNull(raw);
          if (n === null) return TOM_LABEL;
          const idx = assignEqualWidthBin(n, edges);
          const lower = edges[idx];
          const upper = edges[idx + 1];
          return labelNumericBin(
            lower,
            upper,
            idx === edges.length - 2
          );
        };
      }
    }
  }

  // Recount secondary frequencies with binning applied, so Top-N works for numeric.
  /** @type {Record<string, number>} */
  const secondaryCountsBinned = {};
  for (const [rawKey, count] of Object.entries(secondaryCounts)) {
    const key = normalizeSecondary(rawKey);
    secondaryCountsBinned[key] =
      (secondaryCountsBinned[key] || 0) + (count || 0);
  }

  const topColKeys = pickTopKeys(secondaryCountsBinned, topColumns);
  const topRowKeys = pickTopKeys(primaryCounts, rowCap);

  const colSet = new Set(topColKeys);
  const rowSet = new Set(topRowKeys);

  const ANDRE = 'Andre';
  const useAndreCol = Object.keys(secondaryCountsBinned).some(
    (k) => !colSet.has(k)
  );
  const useAndreRow = Object.keys(primaryCounts).some(
    (k) => !rowSet.has(k)
  );

  const cols = useAndreCol ? [...topColKeys, ANDRE] : [...topColKeys];
  const rows = useAndreRow ? [...topRowKeys, ANDRE] : [...topRowKeys];

  /** @type {Record<string, Record<string, number>>} */
  const cells = {};
  /** @type {Record<string, number>} */
  const rowTotals = {};
  /** @type {Record<string, number>} */
  const colTotals = {};
  let grandTotal = 0;

  function finalizeBlockPass2() {
    if (currentCategory !== category) return;

    let pVals = blockValues[primaryKey] || [];
    let sVals = blockValues[secondaryKey] || [];

    if (pVals.length === 0) pVals = [TOM_LABEL];
    if (sVals.length === 0) sVals = [TOM_LABEL];

    pVals = pVals.map((v) => (v ? v : TOM_LABEL));
    sVals = sVals.map((v) => (v ? v : TOM_LABEL));

    // Apply secondary normalization/binning.
    sVals = sVals.map((v) => normalizeSecondary(v));

    if (pVals.length > 1 || sVals.length > 1) exploded = true;

    for (const rawP of pVals) {
      const p = rowSet.has(rawP) ? rawP : ANDRE;
      rowTotals[p] = rowTotals[p] || 0;

      for (const rawS of sVals) {
        const s = colSet.has(rawS) ? rawS : ANDRE;

        incNested(cells, p, s, 1);
        rowTotals[p] += 1;
        colTotals[s] = (colTotals[s] || 0) + 1;
        grandTotal += 1;
      }
    }
  }

  // Pass 2: compute crosstab.
  resetBlock();
  currentCategory = 'unknown';
  currentSection = null;

  forEachLine(sosiText, (rawLine) => {
    const line = String(rawLine || '');
    if (!line) return;

    if (isFeatureStartLine(line)) {
      finalizeBlockPass2();
      currentSection = getSectionName(line);
      currentCategory = categorizeSection(currentSection);
      resetBlock();
      return;
    }

    if (currentCategory !== category) return;

    if (primaryIsObjType && line.startsWith('..OBJTYPE')) {
      addValue('OBJTYPE', line.replace('..OBJTYPE', '').trim());
      return;
    }

    if (secondaryIsObjType && line.startsWith('..OBJTYPE')) {
      addValue('OBJTYPE', line.replace('..OBJTYPE', '').trim());
      return;
    }

    if (!(line.startsWith('..') || line.startsWith('...'))) return;
    const key = extractKeyFromAttributeLine(line);
    if (!key) return;
    if (key !== primaryKey && key !== secondaryKey) return;

    const value = String(line)
      .replace(/^\.{2,}\S+/, '')
      .trim();
    addValue(key, value);
  });
  finalizeBlockPass2();

  // Ensure every row/col appears in totals maps so rendering is simpler.
  for (const r of rows) rowTotals[r] = rowTotals[r] || 0;
  for (const c of cols) colTotals[c] = colTotals[c] || 0;

  const note = exploded
    ? 'Merk: Felt med flere verdier er telt ved å fordele objektet i flere celler. Summer kan derfor overstige antall objekter.'
    : null;

  return {
    rows,
    cols,
    cells,
    rowTotals,
    colTotals,
    grandTotal,
    meta: {
      exploded,
      secondaryIsNumeric,
      note,
    },
  };
}
