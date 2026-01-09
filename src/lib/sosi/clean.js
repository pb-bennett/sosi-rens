function isFeatureStartLine(line) {
  return /^\.(?!\.)[A-ZÆØÅa-zæøå]+\b/.test(line);
}

function getSectionName(line) {
  const match = line.match(/^\.(?!\.)\s*([A-ZÆØÅa-zæøå]+)/);
  if (!match) return null;
  return `.${String(match[1]).toUpperCase()}`;
}

function categorizeSection(section) {
  if (!section) return 'unknown';
  if (section === '.KURVE') return 'ledninger';
  if (section === '.PUNKT' || section === '.TEKST') return 'punkter';
  return 'unknown';
}

function extractObjTypeFromBlock(blockLines) {
  for (const line of blockLines) {
    if (String(line).startsWith('..OBJTYPE')) {
      const objType = String(line).replace('..OBJTYPE', '').trim();
      if (objType) return objType;
    }
  }
  return null;
}

function extractKeyFromAttributeLine(line) {
  const match = String(line).match(/^\.{2,}(\S+)/);
  return match ? String(match[1]).toUpperCase() : null;
}

function shouldAlwaysKeepFieldKey(keyUpper) {
  // Keep core structure + geometry groups.
  return keyUpper === 'OBJTYPE' || keyUpper === 'EGS_PUNKT' || keyUpper === 'EGS_LEDNING';
}

function filterFeatureBlock(blockLines, category, selection) {
  const keepFields = (selection?.fieldsByCategory?.[category] || []).map((k) => String(k).toUpperCase());
  const keepFieldSet = new Set(keepFields);

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
      }
      continue;
    }

    // Default: keep any other line.
    out.push(line);
  }

  return out;
}

export function cleanSosiText(sosiText, selection) {
  const lines = String(sosiText).split(/\r?\n/);

  const keepObjTypesByCategory = {
    punkter: new Set((selection?.objTypesByCategory?.punkter || []).map(String)),
    ledninger: new Set((selection?.objTypesByCategory?.ledninger || []).map(String)),
  };

  const outLines = [];
  let currentBlock = [];
  let currentSection = null;

  function flushBlock() {
    if (currentBlock.length === 0) return;

    const section = currentSection;
    const category = categorizeSection(section);

    // If it's not a feature block (no section), just pass-through.
    if (!section) {
      outLines.push(...currentBlock);
      currentBlock = [];
      return;
    }

    const objType = extractObjTypeFromBlock(currentBlock);

    // If we cannot determine objtype, keep it to avoid data loss.
    if (!objType) {
      outLines.push(...filterFeatureBlock(currentBlock, category, selection));
      currentBlock = [];
      return;
    }

    if (category === 'punkter') {
      if (keepObjTypesByCategory.punkter.size > 0 && !keepObjTypesByCategory.punkter.has(objType)) {
        currentBlock = [];
        return;
      }
      outLines.push(...filterFeatureBlock(currentBlock, 'punkter', selection));
      currentBlock = [];
      return;
    }

    if (category === 'ledninger') {
      if (keepObjTypesByCategory.ledninger.size > 0 && !keepObjTypesByCategory.ledninger.has(objType)) {
        currentBlock = [];
        return;
      }
      outLines.push(...filterFeatureBlock(currentBlock, 'ledninger', selection));
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
    text: outLines.join('\n'),
  };
}
