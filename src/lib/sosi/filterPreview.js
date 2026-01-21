/**
 * @file filterPreview.js
 * Streaming computation of filter preview statistics.
 *
 * Given a SOSI text and an ordered list of field filters, computes:
 * - Total features in category
 * - Features remaining after each successive filter
 * - Per-filter value counts (after previous filters applied)
 *
 * Designed for in-browser use on files up to ~100MB without blocking.
 */

/** Token for missing field (field line not present in feature). */
export const TOKEN_MISSING = '(mangler)';

/** Token for empty value (field line present but value is empty/whitespace). */
export const TOKEN_EMPTY = '(tom)';

/** Threshold for high-cardinality warning. */
export const HIGH_CARDINALITY_THRESHOLD = 50;

/**
 * Iterate over lines in a string without splitting into a large array.
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
 * Extract uppercased attribute key from a SOSI attribute line.
 * @param {string} line
 * @returns {string | null}
 */
function extractKeyFromAttributeLine(line) {
  const match = String(line).match(/^\.{2,}(\S+)/);
  return match ? String(match[1]).toUpperCase() : null;
}

/**
 * Extract value from a SOSI attribute line.
 * @param {string} line
 * @returns {string} The value portion (may be empty string).
 */
function extractValueFromAttributeLine(line) {
  const match = String(line).match(/^\.{2,}\S+\s*(.*)$/);
  return match ? String(match[1] || '').trim() : '';
}

/**
 * Normalize an extracted value to a display token.
 * @param {string | null} value - null means field was missing entirely.
 * @returns {string} Normalized token.
 */
function normalizeValueToken(value) {
  if (value === null) return TOKEN_MISSING;
  const trimmed = String(value).trim();
  return trimmed === '' ? TOKEN_EMPTY : trimmed;
}

/**
 * @typedef {Object} FilterSpec
 * @property {string} fieldKeyUpper - Uppercased field key (e.g. 'EIER', 'OBJTYPE').
 * @property {string[]} selectedValues - Values to keep (normalized tokens).
 */

/**
 * @typedef {Object} FilterPreviewResult
 * @property {number} totalFeatures - Total features in category.
 * @property {number} keptFeatures - Features remaining after all filters.
 * @property {number} excludedFeatures - Features excluded by filters.
 * @property {Object.<string, {value: string, count: number}[]>} countsByFilter - Per-filter value counts.
 * @property {number[]} keptAfterEachFilter - Kept count after each successive filter.
 */

/**
 * Compute filter preview statistics for a single category.
 *
 * @param {string} sosiText - Full SOSI file text.
 * @param {'punkter' | 'ledninger'} category - Category to analyze.
 * @param {FilterSpec[]} filters - Ordered list of filters to apply.
 * @returns {FilterPreviewResult}
 */
export function computeFilterPreview(sosiText, category, filters) {
  const filterCount = filters.length;

  // Track counts per filter field -> value -> count
  // Each filter's counts are computed AFTER previous filters have been applied
  const counters = filters.map(() => new Map());

  // Track how many features pass through each successive filter stage
  const keptAfterEachFilter = new Array(filterCount).fill(0);

  let totalFeatures = 0;
  let keptFeatures = 0;

  // Build sets of selected values for quick lookup
  const selectedSets = filters.map(
    (f) => new Set((f.selectedValues || []).map((v) => String(v))),
  );

  // We need to track which fields we're interested in
  const fieldKeysOfInterest = new Set(
    filters.map((f) => String(f.fieldKeyUpper).toUpperCase()),
  );

  // State for streaming
  let currentSection = null;
  let currentCategory = 'unknown';
  let inFeature = false;

  // Per-feature extracted values: fieldKeyUpper -> value (or null if not found)
  let featureValues = new Map();

  /**
   * Process a completed feature block.
   */
  function finalizeFeature() {
    if (!inFeature) return;
    if (currentCategory !== category) {
      inFeature = false;
      featureValues.clear();
      return;
    }

    totalFeatures++;

    // Apply filters in order, tracking counts at each stage
    let passedSoFar = true;

    for (let i = 0; i < filterCount; i++) {
      if (!passedSoFar) break;

      const filter = filters[i];
      const fieldKey = filter.fieldKeyUpper;
      const rawValue = featureValues.has(fieldKey)
        ? featureValues.get(fieldKey)
        : null;
      const token = normalizeValueToken(rawValue);

      // Increment counter for this filter (only if feature reached this stage)
      const counter = counters[i];
      counter.set(token, (counter.get(token) || 0) + 1);

      // Check if feature passes this filter
      const selectedSet = selectedSets[i];
      if (selectedSet.size > 0 && !selectedSet.has(token)) {
        passedSoFar = false;
      }

      if (passedSoFar) {
        keptAfterEachFilter[i]++;
      }
    }

    if (passedSoFar) {
      keptFeatures++;
    }

    inFeature = false;
    featureValues.clear();
  }

  // Stream through the file
  forEachLine(sosiText, (line) => {
    if (isFeatureStartLine(line)) {
      finalizeFeature();
      currentSection = getSectionName(line);
      currentCategory = categorizeSection(currentSection);
      inFeature = currentCategory !== 'unknown';
      featureValues.clear();
      return;
    }

    if (!inFeature || currentCategory !== category) return;

    // Extract attribute if it's one we care about
    if (line.startsWith('..') || line.startsWith('...')) {
      const key = extractKeyFromAttributeLine(line);
      if (key && fieldKeysOfInterest.has(key)) {
        // Only store first occurrence (SOSI typically has one per feature)
        if (!featureValues.has(key)) {
          const value = extractValueFromAttributeLine(line);
          featureValues.set(key, value);
        }
      }
    }
  });

  // Finalize last feature
  finalizeFeature();

  // Convert counters to sorted arrays
  const countsByFilter = {};
  for (let i = 0; i < filterCount; i++) {
    const fieldKey = filters[i].fieldKeyUpper;
    const counter = counters[i];
    const entries = Array.from(counter.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => {
        // Sort by count descending, then alphabetically
        if (b.count !== a.count) return b.count - a.count;
        return String(a.value).localeCompare(String(b.value));
      });
    countsByFilter[fieldKey] = entries;
  }

  return {
    totalFeatures,
    keptFeatures,
    excludedFeatures: totalFeatures - keptFeatures,
    countsByFilter,
    keptAfterEachFilter,
  };
}

/**
 * Compute unique values and counts for a single field in a category.
 * Used for showing available values when a filter is first added.
 *
 * @param {string} sosiText - Full SOSI file text.
 * @param {'punkter' | 'ledninger'} category - Category to analyze.
 * @param {string} fieldKeyUpper - Field to analyze.
 * @returns {{values: {value: string, count: number}[], isHighCardinality: boolean}}
 */
export function computeFieldValues(
  sosiText,
  category,
  fieldKeyUpper,
) {
  const fieldKey = String(fieldKeyUpper).toUpperCase();
  const counter = new Map();

  let currentSection = null;
  let currentCategory = 'unknown';
  let inFeature = false;
  let featureValue = null;
  let sawField = false;

  function finalizeFeature() {
    if (!inFeature) return;
    if (currentCategory !== category) {
      inFeature = false;
      featureValue = null;
      sawField = false;
      return;
    }

    const token = normalizeValueToken(sawField ? featureValue : null);
    counter.set(token, (counter.get(token) || 0) + 1);

    inFeature = false;
    featureValue = null;
    sawField = false;
  }

  forEachLine(sosiText, (line) => {
    if (isFeatureStartLine(line)) {
      finalizeFeature();
      currentSection = getSectionName(line);
      currentCategory = categorizeSection(currentSection);
      inFeature = currentCategory !== 'unknown';
      featureValue = null;
      sawField = false;
      return;
    }

    if (!inFeature || currentCategory !== category) return;

    if (line.startsWith('..') || line.startsWith('...')) {
      const key = extractKeyFromAttributeLine(line);
      if (key === fieldKey && !sawField) {
        sawField = true;
        featureValue = extractValueFromAttributeLine(line);
      }
    }
  });

  finalizeFeature();

  const values = Array.from(counter.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return String(a.value).localeCompare(String(b.value));
    });

  return {
    values,
    isHighCardinality: values.length > HIGH_CARDINALITY_THRESHOLD,
  };
}

/**
 * Compute cardinality (unique value count) for all fields in a category.
 * Useful for showing warning icons on the available fields list.
 *
 * @param {string} sosiText - Full SOSI file text.
 * @param {'punkter' | 'ledninger'} category - Category to analyze.
 * @param {string[]} fieldKeys - List of field keys to check.
 * @returns {Object.<string, {uniqueCount: number, isHighCardinality: boolean}>}
 */
export function computeFieldCardinalities(
  sosiText,
  category,
  fieldKeys,
) {
  const keys = fieldKeys.map((k) => String(k).toUpperCase());
  const keySet = new Set(keys);

  // Track unique values per field
  const uniqueSets = {};
  for (const key of keys) {
    uniqueSets[key] = new Set();
  }

  let currentSection = null;
  let currentCategory = 'unknown';
  let inFeature = false;
  const featureValues = new Map(); // key -> value

  function finalizeFeature() {
    if (!inFeature) return;
    if (currentCategory !== category) {
      inFeature = false;
      featureValues.clear();
      return;
    }

    for (const key of keys) {
      const rawValue = featureValues.has(key)
        ? featureValues.get(key)
        : null;
      const token = normalizeValueToken(rawValue);
      uniqueSets[key].add(token);
    }

    inFeature = false;
    featureValues.clear();
  }

  forEachLine(sosiText, (line) => {
    if (isFeatureStartLine(line)) {
      finalizeFeature();
      currentSection = getSectionName(line);
      currentCategory = categorizeSection(currentSection);
      inFeature = currentCategory !== 'unknown';
      featureValues.clear();
      return;
    }

    if (!inFeature || currentCategory !== category) return;

    if (line.startsWith('..') || line.startsWith('...')) {
      const key = extractKeyFromAttributeLine(line);
      if (key && keySet.has(key) && !featureValues.has(key)) {
        featureValues.set(key, extractValueFromAttributeLine(line));
      }
    }
  });

  finalizeFeature();

  const result = {};
  for (const key of keys) {
    const uniqueCount = uniqueSets[key].size;
    result[key] = {
      uniqueCount,
      isHighCardinality: uniqueCount > HIGH_CARDINALITY_THRESHOLD,
    };
  }

  return result;
}
