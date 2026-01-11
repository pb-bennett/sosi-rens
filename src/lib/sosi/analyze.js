/**
 * @file analyze.js
 * Parses SOSI text and produces aggregate statistics:
 *   - Feature counts by section (.PUNKT, .KURVE, .TEKST)
 *   - Object-type (OBJTYPE) distributions per category
 *   - Field (attribute) usage counts
 *   - Theme distributions (P_TEMA for punkter, L_TEMA for ledninger)
 *
 * Used by the UI Explore step and the analysis API route.
 */

/**
 * Increment a counter inside an object.
 * @param {Record<string, number>} obj - The counter map.
 * @param {string} key - Key to increment.
 * @param {number} [by=1] - Amount to add.
 */
function inc(obj, key, by = 1) {
  obj[key] = (obj[key] || 0) + by;
}

/**
 * Detect if a line starts a new feature block.
 * Feature sections start with a single dot followed by letters (e.g. `.PUNKT 1:`).
 * Lines starting with `..` are attribute/meta lines, not new features.
 * @param {string} line - Raw SOSI line.
 * @returns {boolean} True if the line starts a feature.
 */
function isFeatureStartLine(line) {
  // Regex: single dot, NOT followed by another dot, then letters.
  return /^\.(?!\.)[A-ZÆØÅa-zæøå]+\b/.test(line);
}

/**
 * Extract the section name from a feature-start line.
 * @param {string} line - A feature-start line (e.g. `.PUNKT 1:`).
 * @returns {string | null} Uppercased section name prefixed with dot (e.g. `.PUNKT`), or null.
 */
function getSectionName(line) {
  const match = line.match(/^\.(?!\.)\s*([A-ZÆØÅa-zæøå]+)/);
  if (!match) return null;
  return `.${String(match[1]).toUpperCase()}`;
}

/**
 * Extract the attribute key from a SOSI attribute line.
 * Attribute lines start with two or more dots (e.g. `..OBJTYPE Kum`).
 * @param {string} line - Raw SOSI line.
 * @returns {string | null} Uppercased attribute key, or null if not an attribute line.
 */
function extractKeyFromAttributeLine(line) {
  const match = line.match(/^\.{2,}(\S+)/);
  return match ? String(match[1]).toUpperCase() : null;
}

/**
 * Map a section name to a category used by the app.
 * `.KURVE` → 'ledninger' (pipes/lines), `.PUNKT` / `.TEKST` → 'punkter' (points).
 * @param {string | null} section - Section name (e.g. `.PUNKT`).
 * @returns {'punkter' | 'ledninger' | 'unknown'} Category string.
 */
function categorizeSection(section) {
  if (!section) return 'unknown';
  if (section === '.KURVE') return 'ledninger';
  if (section === '.PUNKT' || section === '.TEKST') return 'punkter';
  return 'unknown';
}

/**
 * Analyze SOSI text and return aggregate statistics.
 * @param {string} sosiText - Full SOSI file content as a string.
 * @returns {Object} Analysis result with line count, feature counts, objTypes, fields, themes.
 */
export function analyzeSosiText(sosiText) {
  const lines = String(sosiText).split(/\r?\n/);

  const result = {
    lines: lines.length,
    featuresBySection: {},
    byCategory: {
      punkter: {
        features: 0,
        objTypes: {},
        fields: {},
        pTema: {},
      },
      ledninger: {
        features: 0,
        objTypes: {},
        fields: {},
        lTema: {},
      },
    },
    unknown: {
      features: 0,
      objTypes: {},
      fields: {},
    },
  };

  let currentSection = null;
  let currentCategory = 'unknown';
  let currentObjType = null;

  for (const rawLine of lines) {
    const line = String(rawLine || '');
    if (!line) continue;

    if (isFeatureStartLine(line)) {
      currentSection = getSectionName(line);
      currentCategory = categorizeSection(currentSection);
      currentObjType = null;

      inc(result.featuresBySection, currentSection);

      if (currentCategory === 'punkter')
        result.byCategory.punkter.features++;
      else if (currentCategory === 'ledninger')
        result.byCategory.ledninger.features++;
      else result.unknown.features++;

      continue;
    }

    if (line.startsWith('..OBJTYPE')) {
      const objType = line.replace('..OBJTYPE', '').trim();
      currentObjType = objType || currentObjType;

      if (currentCategory === 'punkter')
        inc(
          result.byCategory.punkter.objTypes,
          currentObjType || '(unknown)'
        );
      else if (currentCategory === 'ledninger')
        inc(
          result.byCategory.ledninger.objTypes,
          currentObjType || '(unknown)'
        );
      else
        inc(result.unknown.objTypes, currentObjType || '(unknown)');

      continue;
    }

    if (line.startsWith('...P_TEMA')) {
      const value = line.replace('...P_TEMA', '').trim();
      if (value && currentCategory === 'punkter')
        inc(result.byCategory.punkter.pTema, value);
    }

    if (line.startsWith('...L_TEMA')) {
      const value = line.replace('...L_TEMA', '').trim();
      if (value && currentCategory === 'ledninger')
        inc(result.byCategory.ledninger.lTema, value);
    }

    if (line.startsWith('..') || line.startsWith('...')) {
      const key = extractKeyFromAttributeLine(line);
      if (!key) continue;

      if (currentCategory === 'punkter')
        inc(result.byCategory.punkter.fields, key);
      else if (currentCategory === 'ledninger')
        inc(result.byCategory.ledninger.fields, key);
      else inc(result.unknown.fields, key);
    }
  }

  return result;
}
