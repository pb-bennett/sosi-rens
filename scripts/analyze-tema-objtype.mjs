import fs from 'node:fs';
import readline from 'node:readline';

const SOSI_PATH =
  process.argv[2] ||
  'REF_FILES/EXAMPLE_SOSI/20260108_VA_eksport-kommunalt(ingen filter).sos';
const FIELDS_PATH = 'src/data/fields.json';
const OUT_JSON_PATH = 'analysis/tema-objtype-relations.json';

function loadTemaSets() {
  const raw = fs.readFileSync(FIELDS_PATH, 'utf8');
  const data = JSON.parse(raw);

  const temaPunkt = data.find((x) => x?.fieldKey === 'Tema_punkt');
  const temaLed = data.find((x) => x?.fieldKey === 'Tema_led');

  const punktSet = new Set(
    (temaPunkt?.acceptableValues || [])
      .map((v) => String(v?.value || '').trim())
      .filter(Boolean)
  );
  const ledSet = new Set(
    (temaLed?.acceptableValues || [])
      .map((v) => String(v?.value || '').trim())
      .filter(Boolean)
  );

  return {
    punkt: {
      fieldKey: temaPunkt?.fieldKey ?? null,
      count: punktSet.size,
      values: punktSet,
    },
    ledninger: {
      fieldKey: temaLed?.fieldKey ?? null,
      count: ledSet.size,
      values: ledSet,
    },
  };
}

function inc(map, key, by = 1) {
  map.set(key, (map.get(key) || 0) + by);
}

function topN(map, n = 20) {
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k, v]) => ({ key: k, count: v }));
}

function ensureObj(obj, key, init) {
  if (!obj[key]) obj[key] = init;
  return obj[key];
}

function unknownCodes(usedCounts, allowedSet) {
  const unknown = [];
  for (const k of Object.keys(usedCounts)) {
    if (!allowedSet.has(k)) unknown.push(k);
  }
  unknown.sort();
  return unknown;
}

function missingCodes(usedCounts, allowedSet) {
  const missing = [];
  for (const k of allowedSet) {
    if (!Object.prototype.hasOwnProperty.call(usedCounts, k))
      missing.push(k);
  }
  missing.sort();
  return missing;
}

function mapOfMapsToTop(obj, n = 10) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = topN(v, n);
  }
  return out;
}

function summarizeMapOfMaps(
  mapObj,
  { topEntities = 50, topEntriesPerEntity = 5 } = {}
) {
  const rows = [];
  for (const [entityKey, countMap] of Object.entries(mapObj)) {
    const entries = Array.from(countMap.entries());
    const distinct = entries.length;
    const total = entries.reduce((acc, [, v]) => acc + v, 0);
    const top = entries.sort((a, b) => b[1] - a[1])[0];
    const topShare = total > 0 ? top[1] / total : 0;

    rows.push({
      key: entityKey,
      total,
      distinct,
      dominant: { key: top[0], count: top[1], share: topShare },
      top: entries
        .slice(0, topEntriesPerEntity)
        .map(([k, v]) => ({ key: k, count: v })),
    });
  }

  rows.sort((a, b) => {
    if (b.distinct !== a.distinct) return b.distinct - a.distinct;
    if (b.total !== a.total) return b.total - a.total;
    return a.key.localeCompare(b.key);
  });

  return rows.slice(0, topEntities);
}

function finalizeCategory(catName, cat) {
  const objtypeTop = topN(cat.objtypeCounts, 50);
  const pTemaTop = topN(cat.pTemaCounts, 50);
  const lTemaTop = topN(cat.lTemaCounts, 50);

  const objtypeToTemaMap =
    catName === 'punkter' ? cat.objtypeToPTema : cat.objtypeToLTema;
  const temaToObjtypeMap =
    catName === 'punkter' ? cat.pTemaToObjtype : cat.lTemaToObjtype;

  return {
    featureCount: cat.featureCount,
    withObjtype: cat.withObjtype,
    withPTema: cat.withPTema,
    withLTema: cat.withLTema,
    anomalies: cat.anomalies,
    missingTemaByObjtype: {
      // For punkter: missing P_TEMA. For ledninger: missing L_TEMA.
      totalMissing:
        catName === 'punkter'
          ? cat.missingPTemaCount
          : cat.missingLTemaCount,
      topObjtypes: topN(
        catName === 'punkter'
          ? cat.missingPTemaByObjtype
          : cat.missingLTemaByObjtype,
        30
      ),
    },
    top: {
      objtype: objtypeTop,
      pTema: pTemaTop,
      lTema: lTemaTop,
    },
    objtypeToTemaTop:
      catName === 'punkter'
        ? mapOfMapsToTop(cat.objtypeToPTema, 12)
        : mapOfMapsToTop(cat.objtypeToLTema, 12),
    temaToObjtypeTop:
      catName === 'punkter'
        ? mapOfMapsToTop(cat.pTemaToObjtype, 12)
        : mapOfMapsToTop(cat.lTemaToObjtype, 12),
    diversity: {
      objtypeToTema: summarizeMapOfMaps(objtypeToTemaMap, {
        topEntities: 50,
        topEntriesPerEntity: 5,
      }),
      temaToObjtype: summarizeMapOfMaps(temaToObjtypeMap, {
        topEntities: 50,
        topEntriesPerEntity: 5,
      }),
    },
    fullCounts: {
      objtype: Object.fromEntries(cat.objtypeCounts),
      pTema: Object.fromEntries(cat.pTemaCounts),
      lTema: Object.fromEntries(cat.lTemaCounts),
    },
  };
}

async function main() {
  const temaSets = loadTemaSets();

  const baseStats = {
    input: {
      sosiPath: SOSI_PATH,
      fieldsPath: FIELDS_PATH,
      generatedAt: new Date().toISOString(),
    },
    temaReference: {
      punkt: {
        fieldKey: temaSets.punkt.fieldKey,
        count: temaSets.punkt.count,
      },
      ledninger: {
        fieldKey: temaSets.ledninger.fieldKey,
        count: temaSets.ledninger.count,
      },
    },
  };

  const categories = {
    punkter: {
      featureCount: 0,
      withObjtype: 0,
      withPTema: 0,
      withLTema: 0,
      missingPTemaCount: 0,
      missingPTemaByObjtype: new Map(),
      objtypeCounts: new Map(),
      pTemaCounts: new Map(),
      lTemaCounts: new Map(),
      objtypeToPTema: {},
      pTemaToObjtype: {},
      anomalies: {
        lTemaPresent: 0,
      },
    },
    ledninger: {
      featureCount: 0,
      withObjtype: 0,
      withPTema: 0,
      withLTema: 0,
      missingLTemaCount: 0,
      missingLTemaByObjtype: new Map(),
      objtypeCounts: new Map(),
      pTemaCounts: new Map(),
      lTemaCounts: new Map(),
      objtypeToLTema: {},
      lTemaToObjtype: {},
      anomalies: {
        pTemaPresent: 0,
      },
    },
  };

  let current = null;
  let currentCategory = null;

  function flushCurrent() {
    if (!currentCategory || !current) return;
    const cat = categories[currentCategory];
    cat.featureCount += 1;

    const obj = current.objtype;
    const pTema = current.pTema;
    const lTema = current.lTema;

    if (obj) {
      cat.withObjtype += 1;
      inc(cat.objtypeCounts, obj);
    }
    if (pTema) {
      cat.withPTema += 1;
      inc(cat.pTemaCounts, pTema);
    }
    if (lTema) {
      cat.withLTema += 1;
      inc(cat.lTemaCounts, lTema);
    }

    if (currentCategory === 'punkter') {
      if (lTema) cat.anomalies.lTemaPresent += 1;
      if (obj && !pTema) {
        cat.missingPTemaCount += 1;
        inc(cat.missingPTemaByObjtype, obj);
      }
      if (obj && pTema) {
        const byObj = ensureObj(cat.objtypeToPTema, obj, new Map());
        inc(byObj, pTema);
        const byTema = ensureObj(
          cat.pTemaToObjtype,
          pTema,
          new Map()
        );
        inc(byTema, obj);
      }
    }

    if (currentCategory === 'ledninger') {
      if (pTema) cat.anomalies.pTemaPresent += 1;
      if (obj && !lTema) {
        cat.missingLTemaCount += 1;
        inc(cat.missingLTemaByObjtype, obj);
      }
      if (obj && lTema) {
        const byObj = ensureObj(cat.objtypeToLTema, obj, new Map());
        inc(byObj, lTema);
        const byTema = ensureObj(
          cat.lTemaToObjtype,
          lTema,
          new Map()
        );
        inc(byTema, obj);
      }
    }
  }

  fs.mkdirSync('analysis', { recursive: true });

  const stream = fs.createReadStream(SOSI_PATH, {
    encoding: 'latin1',
  });
  const rl = readline.createInterface({
    input: stream,
    crlfDelay: Infinity,
  });

  for await (const rawLine of rl) {
    const line = rawLine.trimEnd();

    if (line.startsWith('.PUNKT')) {
      flushCurrent();
      currentCategory = 'punkter';
      current = { objtype: null, pTema: null, lTema: null };
      continue;
    }
    if (line.startsWith('.KURVE')) {
      flushCurrent();
      currentCategory = 'ledninger';
      current = { objtype: null, pTema: null, lTema: null };
      continue;
    }

    if (!current) continue;

    const m = line.match(/^\.{2,}\s*([A-ZÆØÅ0-9_]+)\s+(.*)$/i);
    if (!m) continue;

    const key = String(m[1] || '').toUpperCase();
    const valueRaw = String(m[2] || '').trim();
    if (!valueRaw) continue;

    if (key === 'OBJTYPE' && !current.objtype) {
      current.objtype = valueRaw.toUpperCase();
    } else if (key === 'P_TEMA' && !current.pTema) {
      current.pTema = valueRaw.split(/\s+/)[0].toUpperCase();
    } else if (key === 'L_TEMA' && !current.lTema) {
      current.lTema = valueRaw.split(/\s+/)[0].toUpperCase();
    }
  }

  flushCurrent();

  const punkter = finalizeCategory('punkter', categories.punkter);
  const ledninger = finalizeCategory(
    'ledninger',
    categories.ledninger
  );

  const out = {
    ...baseStats,
    results: {
      punkter: {
        ...punkter,
        temaReference: {
          allowedCount: temaSets.punkt.count,
          unknownInFile: unknownCodes(
            punkter.fullCounts.pTema,
            temaSets.punkt.values
          ),
          missingFromFile: missingCodes(
            punkter.fullCounts.pTema,
            temaSets.punkt.values
          ),
        },
      },
      ledninger: {
        ...ledninger,
        temaReference: {
          allowedCount: temaSets.ledninger.count,
          unknownInFile: unknownCodes(
            ledninger.fullCounts.lTema,
            temaSets.ledninger.values
          ),
          missingFromFile: missingCodes(
            ledninger.fullCounts.lTema,
            temaSets.ledninger.values
          ),
        },
      },
    },
  };

  fs.writeFileSync(
    OUT_JSON_PATH,
    JSON.stringify(out, null, 2),
    'utf8'
  );

  console.log(`Wrote ${OUT_JSON_PATH}`);
  console.log(
    `punkter: ${out.results.punkter.featureCount} features`
  );
  console.log(
    `ledninger: ${out.results.ledninger.featureCount} features`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
