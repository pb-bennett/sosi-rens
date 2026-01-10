function inc(obj, key, by = 1) {
  obj[key] = (obj[key] || 0) + by;
}

function isFeatureStartLine(line) {
  // Feature sections are like: .PUNKT 1:
  // Exclude header/meta lines like ..SOSI-VERSJON which start with "..".
  return /^\.(?!\.)[A-ZÆØÅa-zæøå]+\b/.test(line);
}

function getSectionName(line) {
  const match = line.match(/^\.(?!\.)\s*([A-ZÆØÅa-zæøå]+)/);
  if (!match) return null;
  return `.${String(match[1]).toUpperCase()}`;
}

function extractKeyFromAttributeLine(line) {
  const match = line.match(/^\.{2,}(\S+)/);
  return match ? String(match[1]).toUpperCase() : null;
}

function categorizeSection(section) {
  if (!section) return 'unknown';
  if (section === '.KURVE') return 'ledninger';
  if (section === '.PUNKT' || section === '.TEKST') return 'punkter';
  return 'unknown';
}

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
