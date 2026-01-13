/**
 * @file clean.js
 * Filters (cleans) SOSI text by keeping only selected object types and fields.
 * Supports two field-handling modes:
 *   - 'remove-fields': drop unselected attribute lines entirely.
 *   - 'clear-values': keep attribute keys but strip their values (for compatibility).
 */

/**
 * Detect if a line starts a new feature block.
 * @param {string} line - Raw SOSI line.
 * @returns {boolean} True if the line starts a feature.
 */
function isFeatureStartLine(line) {
  return /^\.(?!\.)[A-ZÆØÅa-zæøå]+\b/.test(line);
}

/**
 * Extract the section name from a feature-start line.
 * @param {string} line - A feature-start line.
 * @returns {string | null} Uppercased section name (e.g. `.PUNKT`), or null.
 */
function getSectionName(line) {
  const match = line.match(/^\.(?!\.)\s*([A-ZÆØÅa-zæøå]+)/);
  if (!match) return null;
  return `.${String(match[1]).toUpperCase()}`;
}

/**
 * Map a section name to the app's category.
 * @param {string | null} section - Section name.
 * @returns {'punkter' | 'ledninger' | 'unknown'} Category string.
 */
function categorizeSection(section) {
  if (!section) return 'unknown';
  if (section === '.KURVE') return 'ledninger';
  if (section === '.PUNKT' || section === '.TEKST') return 'punkter';
  return 'unknown';
}

/**
 * Find the OBJTYPE value inside a feature block.
 * @param {string[]} blockLines - Lines of the feature block.
 * @returns {string | null} Object type value, or null if not found.
 */
function extractObjTypeFromBlock(blockLines) {
  for (const line of blockLines) {
    if (String(line).startsWith('..OBJTYPE')) {
      const objType = String(line).replace('..OBJTYPE', '').trim();
      if (objType) return objType;
    }
  }
  return null;
}

/**
 * Extract the attribute key from an attribute line.
 * @param {string} line - Raw SOSI line.
 * @returns {string | null} Uppercased attribute key, or null.
 */
function extractKeyFromAttributeLine(line) {
  const match = String(line).match(/^\.{2,}(\S+)/);
  return match ? String(match[1]).toUpperCase() : null;
}

/**
 * Extract identifier values (SID/PSID/LSID) from a feature block.
 * Identifiers in the Gemini VA exports used by this app are typically stored as
 * triple-dot attributes inside EGS groups (e.g. `...SID 123`).
 * @param {string[]} blockLines - Lines of a feature block.
 * @returns {{ idType: 'SID' | 'PSID' | 'LSID', value: string }[]} Extracted IDs.
 */
function extractIdsFromBlock(blockLines) {
  const out = [];
  for (const rawLine of blockLines) {
    const line = String(rawLine);
    const match = line.match(/^\.\.\.(SID|PSID|LSID)\s+(\S+)/i);
    if (!match) continue;
    const idType = String(match[1]).toUpperCase();
    const value = String(match[2]).trim();
    if (!value) continue;
    if (idType === 'SID' || idType === 'PSID' || idType === 'LSID') {
      out.push({ idType, value });
    }
  }
  return out;
}

/**
 * Extract the EIER (owner) value from a feature block.
 * EIER is typically stored as `...EIER <value>` inside EGS groups.
 * @param {string[]} blockLines - Lines of a feature block.
 * @returns {string | null} The EIER value, or null if not found.
 */
function extractEierFromBlock(blockLines) {
  for (const rawLine of blockLines) {
    const line = String(rawLine);
    const match = line.match(/^\.\.\.EIER\s+(\S+)/i);
    if (match) {
      return String(match[1]).trim();
    }
  }
  return null;
}

/**
 * Extract the STATUS value from a feature block.
 * STATUS is typically stored as `...STATUS <value>` inside EGS groups.
 * @param {string[]} blockLines - Lines of a feature block.
 * @returns {string | null} The STATUS value, or null if not found.
 */
function extractStatusFromBlock(blockLines) {
  for (const rawLine of blockLines) {
    const line = String(rawLine);
    const match = line.match(/^\.\.\.STATUS\s+(\S+)/i);
    if (match) {
      return String(match[1]).trim();
    }
  }
  return null;
}

/**
 * Build a set of excluded IDs for a category.
 * @param {Object} selection - Selection object.
 * @param {'punkter' | 'ledninger'} category - Category.
 * @returns {Set<string>} Set of keys like `SID:123`.
 */
function buildExcludedSet(selection, category) {
  const list = selection?.excludedByCategory?.[category] || [];
  const set = new Set();
  for (const entry of list) {
    const idType = String(entry?.idType || '').toUpperCase();
    const id = String(entry?.id || '').trim();
    if (!id) continue;
    if (idType === 'SID' || idType === 'PSID' || idType === 'LSID') {
      set.add(`${idType}:${id}`);
    }
  }
  return set;
}

/**
 * Determine if a field key must always be kept (structural / mandatory).
 * @param {string} keyUpper - Uppercased attribute key.
 * @returns {boolean} True if the key is mandatory.
 */
function shouldAlwaysKeepFieldKey(keyUpper) {
  // Core structural keys and geometry groups should never be removed.
  return (
    keyUpper === 'OBJTYPE' ||
    keyUpper === 'EGS_PUNKT' ||
    keyUpper === 'EGS_LEDNING'
  );
}

/**
 * Remove the value portion of an attribute line, keeping the key.
 * Used by 'clear-values' mode to preserve field presence without data.
 * @param {string} line - Attribute line (e.g. `..DYBDE 1.5`).
 * @returns {string} Attribute line with only the key (e.g. `..DYBDE`).
 */
function stripAttributeValue(line) {
  const match = String(line).match(/^(\.{2,})(\S+)(?:\s+.*)?$/);
  if (!match) return String(line);
  return `${match[1]}${match[2]}`;
}

/**
 * Filter attribute lines in a feature block based on field selection.
 * @param {string[]} blockLines - Lines of the feature block.
 * @param {'punkter' | 'ledninger'} category - Category of the block.
 * @param {Object} selection - User selection (fieldsByCategory, objTypesByCategory).
 * @param {Object} [options] - Cleaning options (fieldMode: 'remove-fields' | 'clear-values').
 * @returns {string[]} Filtered lines for the block.
 */
function filterFeatureBlock(
  blockLines,
  category,
  selection,
  options
) {
  const keepFields = (
    selection?.fieldsByCategory?.[category] || []
  ).map((k) => String(k).toUpperCase());
  const keepFieldSet = new Set(keepFields);

  const fieldMode =
    options?.fieldMode === 'clear-values'
      ? 'clear-values'
      : 'remove-fields';

  const out = [];

  for (const rawLine of blockLines) {
    const line = String(rawLine);

    // Always keep the feature header (.PUNKT 1: etc)
    if (isFeatureStartLine(line)) {
      out.push(line);
      continue;
    }

    // Always keep geometry coordinate lines (they don't start with dots)
    if (!line.startsWith('.')) {
      out.push(line);
      continue;
    }

    // Preserve meta/comment lines starting with !
    if (line.startsWith('!')) {
      out.push(line);
      continue;
    }

    if (line.startsWith('..')) {
      const key = extractKeyFromAttributeLine(line);
      if (!key) {
        out.push(line);
        continue;
      }

      if (shouldAlwaysKeepFieldKey(key)) {
        out.push(line);
        continue;
      }

      // Keep group headers (like ..NØH) and their content structure-wise.
      // Field selection mainly targets leaf attributes.
      if (line.trim() === `..${key}`) {
        out.push(line);
        continue;
      }

      if (keepFieldSet.has(key)) {
        out.push(line);
      } else if (fieldMode === 'clear-values') {
        out.push(stripAttributeValue(line));
      }
      continue;
    }

    // Default: keep any other line.
    out.push(line);
  }

  return out;
}

/**
 * Clean (filter) SOSI text by removing unwanted object types and fields.
 * @param {string} sosiText - Full SOSI file content.
 * @param {Object} selection - Object types and fields to keep, by category.
 * @param {Object} [options] - Options (fieldMode: 'remove-fields' | 'clear-values').
 * @returns {{ text: string }} Cleaned SOSI text.
 */
export function cleanSosiText(sosiText, selection, options) {
  const text = String(sosiText);
  const newline = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);

  const keepObjTypesByCategory = {
    punkter: new Set(
      (selection?.objTypesByCategory?.punkter || []).map(String)
    ),
    ledninger: new Set(
      (selection?.objTypesByCategory?.ledninger || []).map(String)
    ),
  };

  const excludedByCategory = {
    punkter: buildExcludedSet(selection, 'punkter'),
    ledninger: buildExcludedSet(selection, 'ledninger'),
  };

  // Build EIER filter sets – if empty array, no filtering (all allowed).
  // If array has values, only features with matching EIER are kept.
  const keepEierByCategory = {
    punkter: new Set(
      (selection?.eierByCategory?.punkter || []).map((v) =>
        String(v).toUpperCase()
      )
    ),
    ledninger: new Set(
      (selection?.eierByCategory?.ledninger || []).map((v) =>
        String(v).toUpperCase()
      )
    ),
  };

  // Build STATUS filter sets – if empty array, no filtering (all allowed).
  // If array has values, only features with matching STATUS are kept.
  const keepStatusByCategory = {
    punkter: new Set(
      (selection?.statusByCategory?.punkter || []).map((v) =>
        String(v).toUpperCase()
      )
    ),
    ledninger: new Set(
      (selection?.statusByCategory?.ledninger || []).map((v) =>
        String(v).toUpperCase()
      )
    ),
  };

  const outLines = [];
  let currentBlock = [];
  let currentSection = null;

  function flushBlock() {
    if (currentBlock.length === 0) return;

    const section = currentSection;
    const category = categorizeSection(section);

    // Preserve non-feature sections (e.g. .HODE, .SLUTT) verbatim.
    if (category === 'unknown') {
      outLines.push(...currentBlock);
      currentBlock = [];
      return;
    }

    // If it's not a feature block (no section), just pass-through.
    if (!section) {
      outLines.push(...currentBlock);
      currentBlock = [];
      return;
    }

    const objType = extractObjTypeFromBlock(currentBlock);

    // If we cannot determine objtype, keep the block unmodified to avoid
    // corrupting SOSI structure (especially for uncommon/edge feature shapes).
    if (!objType) {
      outLines.push(...currentBlock);
      currentBlock = [];
      return;
    }

    // Exclusion list takes precedence: skip matching features entirely.
    if (category === 'punkter' || category === 'ledninger') {
      const excludedSet = excludedByCategory[category];
      if (excludedSet && excludedSet.size > 0) {
        const ids = extractIdsFromBlock(currentBlock);
        const shouldExclude = ids.some((id) =>
          excludedSet.has(`${id.idType}:${id.value}`)
        );
        if (shouldExclude) {
          currentBlock = [];
          return;
        }
      }
    }

    // EIER filter: if eierByCategory has values, only keep features with matching EIER.
    // If the set is empty, no EIER filtering is applied (all EIER values pass).
    if (category === 'punkter' || category === 'ledninger') {
      const keepEierSet = keepEierByCategory[category];
      if (keepEierSet && keepEierSet.size > 0) {
        const eierValue = extractEierFromBlock(currentBlock);
        // If feature has EIER and it's not in the allowed set, skip it.
        // If feature has no EIER, we keep it (don't filter out features without EIER).
        if (eierValue && !keepEierSet.has(eierValue.toUpperCase())) {
          currentBlock = [];
          return;
        }
      }
    }

    // STATUS filter: if statusByCategory has values, only keep features with matching STATUS.
    // If the set is empty, no STATUS filtering is applied (all STATUS values pass).
    if (category === 'punkter' || category === 'ledninger') {
      const keepStatusSet = keepStatusByCategory[category];
      if (keepStatusSet && keepStatusSet.size > 0) {
        const statusValue = extractStatusFromBlock(currentBlock);
        // If feature has STATUS and it's not in the allowed set, skip it.
        // If feature has no STATUS, we keep it (don't filter out features without STATUS).
        if (
          statusValue &&
          !keepStatusSet.has(statusValue.toUpperCase())
        ) {
          currentBlock = [];
          return;
        }
      }
    }

    if (category === 'punkter') {
      if (
        keepObjTypesByCategory.punkter.size > 0 &&
        !keepObjTypesByCategory.punkter.has(objType)
      ) {
        currentBlock = [];
        return;
      }
      outLines.push(
        ...filterFeatureBlock(
          currentBlock,
          'punkter',
          selection,
          options
        )
      );
      currentBlock = [];
      return;
    }

    if (category === 'ledninger') {
      if (
        keepObjTypesByCategory.ledninger.size > 0 &&
        !keepObjTypesByCategory.ledninger.has(objType)
      ) {
        currentBlock = [];
        return;
      }
      outLines.push(
        ...filterFeatureBlock(
          currentBlock,
          'ledninger',
          selection,
          options
        )
      );
      currentBlock = [];
      return;
    }

    // Unknown category: keep.
    outLines.push(...currentBlock);
    currentBlock = [];
  }

  for (const rawLine of lines) {
    const line = String(rawLine || '');

    if (isFeatureStartLine(line)) {
      flushBlock();
      currentSection = getSectionName(line);
      currentBlock = [line];
      continue;
    }

    // If we're currently inside a feature block, accumulate until next block starts.
    if (currentBlock.length > 0) {
      currentBlock.push(line);
      continue;
    }

    // Header / non-feature lines pass-through.
    outLines.push(line);
  }

  flushBlock();

  return {
    text: outLines.join(newline),
  };
}

/**
 * Extract a SOSI containing only the excluded objects.
 * Preserves non-feature sections (e.g. .HODE, .SLUTT) verbatim.
 * Intended for review/auditing of what will be removed from the main export.
 * @param {string} sosiText - Full SOSI file content.
 * @param {Object} selection - Selection containing excludedByCategory.
 * @returns {{ text: string }} SOSI text with only excluded objects.
 */
export function extractExcludedSosiText(sosiText, selection) {
  const text = String(sosiText);
  const newline = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);

  const excludedByCategory = {
    punkter: buildExcludedSet(selection, 'punkter'),
    ledninger: buildExcludedSet(selection, 'ledninger'),
  };

  const outLines = [];
  let currentBlock = [];
  let currentSection = null;

  function flushBlock() {
    if (currentBlock.length === 0) return;

    const section = currentSection;
    const category = categorizeSection(section);

    // Preserve non-feature sections (e.g. .HODE, .SLUTT) verbatim.
    if (category === 'unknown') {
      outLines.push(...currentBlock);
      currentBlock = [];
      return;
    }

    // If it's not a feature block (no section), just pass-through.
    if (!section) {
      outLines.push(...currentBlock);
      currentBlock = [];
      return;
    }

    if (category === 'punkter' || category === 'ledninger') {
      const excludedSet = excludedByCategory[category];
      if (!excludedSet || excludedSet.size === 0) {
        currentBlock = [];
        return;
      }

      const ids = extractIdsFromBlock(currentBlock);
      const shouldKeep = ids.some((id) =>
        excludedSet.has(`${id.idType}:${id.value}`)
      );
      if (shouldKeep) outLines.push(...currentBlock);
      currentBlock = [];
      return;
    }

    // Unknown category: keep.
    outLines.push(...currentBlock);
    currentBlock = [];
  }

  for (const rawLine of lines) {
    const line = String(rawLine || '');

    if (isFeatureStartLine(line)) {
      flushBlock();
      currentSection = getSectionName(line);
      currentBlock = [line];
      continue;
    }

    if (currentBlock.length > 0) {
      currentBlock.push(line);
      continue;
    }

    outLines.push(line);
  }

  flushBlock();

  return {
    text: outLines.join(newline),
  };
}
