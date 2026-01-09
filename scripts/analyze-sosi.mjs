import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import iconv from 'iconv-lite';

function parseArgs(argv) {
  const args = {
    input: null,
    out: null,
    mdOut: null,
    summary: false,
    useSosijs: true,
    limitObjectTypes: 25,
    limitFields: 50,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!a) continue;
    if (a === '--summary') {
      args.summary = true;
      continue;
    }
    if (a === '--no-sosijs') {
      args.useSosijs = false;
      continue;
    }
    if (a === '--out') {
      args.out = argv[i + 1];
      i++;
      continue;
    }
    if (a === '--md-out') {
      args.mdOut = argv[i + 1];
      i++;
      continue;
    }
    if (a === '--limit-object-types') {
      args.limitObjectTypes = Number(
        argv[i + 1] ?? args.limitObjectTypes
      );
      i++;
      continue;
    }
    if (a === '--limit-fields') {
      args.limitFields = Number(argv[i + 1] ?? args.limitFields);
      i++;
      continue;
    }
    if (!args.input) args.input = a;
  }
  return args;
}

function safeReadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function toSortedEntriesCount(mapOrObj) {
  const entries =
    mapOrObj instanceof Map
      ? [...mapOrObj.entries()]
      : Object.entries(mapOrObj);
  entries.sort(
    (a, b) =>
      (b[1] ?? 0) - (a[1] ?? 0) ||
      String(a[0]).localeCompare(String(b[0]))
  );
  return entries;
}

function inc(map, key, by = 1) {
  if (!key) return;
  map.set(key, (map.get(key) ?? 0) + by);
}

function addToSetMap(map, key, value) {
  if (!key || !value) return;
  let set = map.get(key);
  if (!set) {
    set = new Set();
    map.set(key, set);
  }
  set.add(value);
}

async function detectEncodingFromHeader(filePath) {
  // SOSI files commonly declare ..TEGNSETT ISO8859-1 in the first ~100 lines.
  const stream = fs.createReadStream(filePath, {
    start: 0,
    end: 8192,
  });
  const rl = readline.createInterface({
    input: stream.pipe(iconv.decodeStream('latin1')),
    crlfDelay: Infinity,
  });
  let encoding = null;
  for await (const line of rl) {
    const trimmed = String(line).trim();
    const m = trimmed.match(/^\.\.TEGNSETT\s+(\S+)/i);
    if (m) {
      encoding = String(m[1]).toUpperCase();
      break;
    }
    if (
      trimmed.startsWith('.PUNKT') ||
      trimmed.startsWith('.KURVE') ||
      trimmed.startsWith('.FLATE')
    )
      break;
  }
  rl.close();
  stream.close?.();
  if (!encoding) return null;

  // Map common SOSI declarations to iconv-lite names.
  if (
    encoding.includes('ISO8859-1') ||
    encoding.includes('ISO-8859-1')
  )
    return 'latin1';
  if (
    encoding.includes('ISO8859-10') ||
    encoding.includes('ISO-8859-10')
  )
    return 'iso-8859-10';
  if (
    encoding.includes('WINDOWS') ||
    encoding.includes('CP1252') ||
    encoding.includes('1252')
  )
    return 'win1252';
  if (encoding.includes('UTF-8') || encoding.includes('UTF8'))
    return 'utf8';
  return null;
}

function guessUtf8LooksBroken(sampleText) {
  // Heuristic: replacement char indicates decoding problems.
  return sampleText.includes('\uFFFD');
}

async function analyzeSosi(filePath, fieldsJsonPath) {
  const detected =
    (await detectEncodingFromHeader(filePath)) ?? 'utf8';

  // If header said latin1, use it. If it said utf8, still allow fallback if it looks broken.
  const rawSample = fs.readFileSync(filePath, {
    encoding: null,
    start: 0,
  });
  const sampleBytes = rawSample.subarray(
    0,
    Math.min(rawSample.length, 65536)
  );
  let encodingUsed = detected;
  let decodedSample = iconv.decode(sampleBytes, encodingUsed);
  if (
    encodingUsed === 'utf8' &&
    guessUtf8LooksBroken(decodedSample)
  ) {
    encodingUsed = 'win1252';
    decodedSample = iconv.decode(sampleBytes, encodingUsed);
  }

  const encodingFallbackUsed = encodingUsed !== detected;

  const counts = {
    featuresBySection: new Map(), // .PUNKT/.KURVE/...
    objType: new Map(), // ..OBJTYPE
    pTema: new Map(), // ...P_TEMA
    lTema: new Map(), // ...L_TEMA
    objTypeBySection: new Map(), // `${section}::${objType}`
    pTemaByObjType: new Map(), // `${objType}::${pTema}`
    lTemaByObjType: new Map(), // `${objType}::${lTema}`
  };

  const fieldsByObjType = new Map(); // objType -> Set(fieldName)
  const fieldsBySection = new Map(); // .PUNKT/.KURVE -> Set(fieldName)
  const fieldPresenceCounts = new Map(); // fieldName -> number of occurrences

  const objTypeExamples = new Map(); // objType -> small example snippet lines

  let currentSection = null;
  let currentObjType = null;
  let inFeature = false;

  const inputStream = fs.createReadStream(filePath);
  const decodedStream = inputStream.pipe(
    iconv.decodeStream(encodingUsed)
  );
  const rl = readline.createInterface({
    input: decodedStream,
    crlfDelay: Infinity,
  });

  let lines = 0;
  let features = 0;

  for await (const lineRaw of rl) {
    lines++;
    const line = String(lineRaw);
    if (!line) continue;

    // New feature sections are like: .PUNKT 123:
    if (line.startsWith('.')) {
      const m = line.match(/^\.(\w+)\b/);
      if (m) {
        const sec = `.${m[1].toUpperCase()}`;
        if (sec !== '..TEGNSETT' && !sec.startsWith('..')) {
          // starting a new feature (.PUNKT/.KURVE/...)
          currentSection = sec;
          currentObjType = null;
          inFeature = true;
          features++;
          inc(counts.featuresBySection, currentSection);
        }
      }
    }

    // ..OBJTYPE Foo
    if (line.startsWith('..OBJTYPE')) {
      const obj = line.replace('..OBJTYPE', '').trim();
      currentObjType = obj || currentObjType;
      if (currentObjType) {
        inc(counts.objType, currentObjType);
        if (currentSection)
          inc(
            counts.objTypeBySection,
            `${currentSection}::${currentObjType}`
          );
        if (!objTypeExamples.has(currentObjType)) {
          objTypeExamples.set(currentObjType, [line]);
        }
      }
      continue;
    }

    // ...P_TEMA KUM
    if (line.startsWith('...P_TEMA')) {
      const tema = line.replace('...P_TEMA', '').trim();
      if (tema) {
        inc(counts.pTema, tema);
        if (currentObjType)
          inc(counts.pTemaByObjType, `${currentObjType}::${tema}`);
      }
      // Treat P_TEMA as a field too
      addToSetMap(
        fieldsByObjType,
        currentObjType ?? '(unknown)',
        'P_TEMA'
      );
      addToSetMap(
        fieldsBySection,
        currentSection ?? '(unknown)',
        'P_TEMA'
      );
      inc(fieldPresenceCounts, 'P_TEMA');
      continue;
    }

    // ...L_TEMA VL (ledninger)
    if (line.startsWith('...L_TEMA')) {
      const tema = line.replace('...L_TEMA', '').trim();
      if (tema) {
        inc(counts.lTema, tema);
        if (currentObjType)
          inc(counts.lTemaByObjType, `${currentObjType}::${tema}`);
      }
      addToSetMap(
        fieldsByObjType,
        currentObjType ?? '(unknown)',
        'L_TEMA'
      );
      addToSetMap(
        fieldsBySection,
        currentSection ?? '(unknown)',
        'L_TEMA'
      );
      inc(fieldPresenceCounts, 'L_TEMA');
      continue;
    }

    // Capture fields like ..FOO and ...BAR
    if (line.startsWith('..') && !line.startsWith('...')) {
      const key = line
        .slice(2)
        .split(/[\s\t]/)[0]
        ?.trim();
      if (key && key !== 'OBJTYPE') {
        addToSetMap(
          fieldsByObjType,
          currentObjType ?? '(unknown)',
          key
        );
        addToSetMap(
          fieldsBySection,
          currentSection ?? '(unknown)',
          key
        );
        inc(fieldPresenceCounts, key);
      }
      if (
        currentObjType &&
        objTypeExamples.has(currentObjType) &&
        objTypeExamples.get(currentObjType).length < 12
      ) {
        objTypeExamples.get(currentObjType).push(line);
      }
      continue;
    }
    if (line.startsWith('...')) {
      const key = line
        .slice(3)
        .split(/[\s\t]/)[0]
        ?.trim();
      if (key) {
        addToSetMap(
          fieldsByObjType,
          currentObjType ?? '(unknown)',
          key
        );
        addToSetMap(
          fieldsBySection,
          currentSection ?? '(unknown)',
          key
        );
        inc(fieldPresenceCounts, key);
      }
      if (
        currentObjType &&
        objTypeExamples.has(currentObjType) &&
        objTypeExamples.get(currentObjType).length < 12
      ) {
        objTypeExamples.get(currentObjType).push(line);
      }
      continue;
    }

    // avoid unused var lint warnings
    if (!inFeature) continue;
  }

  rl.close();

  // Build mapping from fields.json: Tema_punkt and Tema_led
  const fieldsJson = safeReadJson(fieldsJsonPath);
  const pTemaValueToLabel = new Map();
  const pTemaValueToDescription = new Map();
  const lTemaValueToLabel = new Map();
  const lTemaValueToDescription = new Map();
  if (Array.isArray(fieldsJson)) {
    for (const entry of fieldsJson) {
      const fieldKey = entry?.fieldKey;
      if (!fieldKey || typeof fieldKey !== 'string') continue;
      const fieldKeyLower = fieldKey.toLowerCase();
      if (!fieldKeyLower.includes('tema')) continue;
      const acceptableValues = entry?.acceptableValues;
      if (!Array.isArray(acceptableValues)) continue;
      const isTemaPunkt = fieldKeyLower === 'tema_punkt';
      const isTemaLed = fieldKeyLower === 'tema_led';
      for (const av of acceptableValues) {
        const v = av?.value;
        const label = av?.label;
        const desc = av?.description;
        if (typeof v === 'string' && typeof label === 'string') {
          if (isTemaPunkt) {
            if (!pTemaValueToLabel.has(v))
              pTemaValueToLabel.set(v, label);
            if (
              typeof desc === 'string' &&
              desc &&
              !pTemaValueToDescription.has(v)
            )
              pTemaValueToDescription.set(v, desc);
          }
          if (isTemaLed) {
            if (!lTemaValueToLabel.has(v))
              lTemaValueToLabel.set(v, label);
            if (
              typeof desc === 'string' &&
              desc &&
              !lTemaValueToDescription.has(v)
            )
              lTemaValueToDescription.set(v, desc);
          }
        }
      }
    }
  }

  // Optional: parse via sosijs and attach lightweight validation info.
  let sosijsInfo = {
    enabled: true,
    parsed: false,
    featureCount: null,
    objTypeKey: 'objekttypenavn',
    objTypeCountsTop: null,
    pTemaCountsTop: null,
    lTemaCountsTop: null,
    geometryTypeCounts: null,
    error: null,
  };
  try {
    // Dynamic import so script still works if user removes dependency.
    const sosijs = (await import('sosijs')).default;
    const { Parser } = sosijs;
    const parser = new Parser();
    const fullText = iconv.decode(
      fs.readFileSync(filePath),
      encodingUsed
    );
    const parsed = parser.parse(fullText);
    const featureMap = parsed?.features?.features;
    const ids = featureMap ? Object.keys(featureMap) : [];
    sosijsInfo.parsed = true;
    sosijsInfo.featureCount = ids.length;

    const objCounts = new Map();
    const pCounts = new Map();
    const lCounts = new Map();
    const geomCounts = new Map();
    for (const id of ids) {
      const f = featureMap[id];
      const attrs = f?.attributes;
      const objName = attrs?.objekttypenavn;
      if (objName) inc(objCounts, objName);
      const geom = f?.geometryType;
      if (geom) inc(geomCounts, geom);
      const pTema = attrs?.EGS_PUNKT?.P_TEMA;
      if (pTema) inc(pCounts, pTema);
      const lTema = attrs?.EGS_LEDNING?.L_TEMA;
      if (lTema) inc(lCounts, lTema);
    }
    sosijsInfo.geometryTypeCounts = Object.fromEntries(
      toSortedEntriesCount(geomCounts)
    );
    sosijsInfo.objTypeCountsTop = Object.fromEntries(
      toSortedEntriesCount(objCounts).slice(0, 50)
    );
    sosijsInfo.pTemaCountsTop = Object.fromEntries(
      toSortedEntriesCount(pCounts).slice(0, 50)
    );
    sosijsInfo.lTemaCountsTop = Object.fromEntries(
      toSortedEntriesCount(lCounts).slice(0, 50)
    );
  } catch (e) {
    sosijsInfo.parsed = false;
    sosijsInfo.error = e?.message ?? String(e);
  }

  // Prepare report JSON
  const report = {
    meta: {
      filePath: path.resolve(filePath),
      fileSizeBytes: fs.statSync(filePath).size,
      lines,
      features,
      encodingDetected: detected,
      encodingUsed,
      encodingFallbackUsed,
      sosijs: sosijsInfo,
      generatedAt: new Date().toISOString(),
    },
    counts: {
      featuresBySection: Object.fromEntries(
        toSortedEntriesCount(counts.featuresBySection)
      ),
      objType: Object.fromEntries(
        toSortedEntriesCount(counts.objType)
      ),
      pTema: Object.fromEntries(toSortedEntriesCount(counts.pTema)),
      lTema: Object.fromEntries(toSortedEntriesCount(counts.lTema)),
      objTypeBySection: Object.fromEntries(
        toSortedEntriesCount(counts.objTypeBySection)
      ),
      pTemaByObjType: Object.fromEntries(
        toSortedEntriesCount(counts.pTemaByObjType)
      ),
      lTemaByObjType: Object.fromEntries(
        toSortedEntriesCount(counts.lTemaByObjType)
      ),
    },
    fields: {
      byObjType: Object.fromEntries(
        [...fieldsByObjType.entries()].map(([k, set]) => [
          k,
          [...set].sort(),
        ])
      ),
      bySection: Object.fromEntries(
        [...fieldsBySection.entries()].map(([k, set]) => [
          k,
          [...set].sort(),
        ])
      ),
      presenceCountsTop: Object.fromEntries(
        toSortedEntriesCount(fieldPresenceCounts).slice(0, 250)
      ),
    },
    mapping: {
      pTemaCodeToLabel: Object.fromEntries(
        [...pTemaValueToLabel.entries()].sort((a, b) =>
          a[0].localeCompare(b[0])
        )
      ),
      pTemaCodeToDescription: Object.fromEntries(
        [...pTemaValueToDescription.entries()].sort((a, b) =>
          a[0].localeCompare(b[0])
        )
      ),
      lTemaCodeToLabel: Object.fromEntries(
        [...lTemaValueToLabel.entries()].sort((a, b) =>
          a[0].localeCompare(b[0])
        )
      ),
      lTemaCodeToDescription: Object.fromEntries(
        [...lTemaValueToDescription.entries()].sort((a, b) =>
          a[0].localeCompare(b[0])
        )
      ),
    },
    examples: {
      objTypeSnippets: Object.fromEntries(
        [...objTypeExamples.entries()].map(([k, arr]) => [k, arr])
      ),
    },
  };

  return report;
}

function formatSummary(report, limitObjectTypes = 25) {
  const lines = [];
  lines.push(`File: ${report.meta.filePath}`);
  lines.push(
    `Size: ${(report.meta.fileSizeBytes / (1024 * 1024)).toFixed(
      2
    )} MB`
  );
  lines.push(
    `Encoding: detected=${report.meta.encodingDetected} used=${
      report.meta.encodingUsed
    }${report.meta.encodingFallbackUsed ? ' (fallback)' : ''}`
  );
  lines.push(`Lines: ${report.meta.lines.toLocaleString('en-US')}`);
  lines.push(
    `Features: ${report.meta.features.toLocaleString('en-US')}`
  );
  lines.push('');
  lines.push('Top sections (.PUNKT/.KURVE/...):');
  for (const [k, v] of Object.entries(
    report.counts.featuresBySection
  ).slice(0, 15)) {
    lines.push(`  ${k}: ${v}`);
  }
  lines.push('');
  lines.push('Top OBJTYPE:');
  for (const [k, v] of Object.entries(report.counts.objType).slice(
    0,
    limitObjectTypes
  )) {
    lines.push(`  ${k}: ${v}`);
  }
  lines.push('');
  lines.push('Top P_TEMA (with labels when available):');
  const temaLabel = report.mapping.pTemaCodeToLabel ?? {};
  for (const [k, v] of Object.entries(report.counts.pTema).slice(
    0,
    25
  )) {
    const lbl = temaLabel[k] ? ` (${temaLabel[k]})` : '';
    lines.push(`  ${k}${lbl}: ${v}`);
  }
  lines.push('');
  lines.push('Top L_TEMA (with labels when available):');
  const lLabel = report.mapping.lTemaCodeToLabel ?? {};
  for (const [k, v] of Object.entries(report.counts.lTema).slice(
    0,
    25
  )) {
    const lbl = lLabel[k] ? ` (${lLabel[k]})` : '';
    lines.push(`  ${k}${lbl}: ${v}`);
  }
  lines.push('');
  lines.push(
    `sosijs parsed: ${report.meta.sosijs?.parsed ? 'yes' : 'no'}${
      report.meta.sosijs?.error
        ? ` (${report.meta.sosijs.error})`
        : ''
    }`
  );
  return lines.join('\n');
}

function formatMarkdown(report) {
  const lines = [];
  lines.push('## SOSI Example File Analysis (Gemini VA export)');
  lines.push('');
  lines.push(`- File: ${report.meta.filePath}`);
  lines.push(
    `- Size: ${(report.meta.fileSizeBytes / (1024 * 1024)).toFixed(
      2
    )} MB`
  );
  lines.push(
    `- Encoding: detected=${report.meta.encodingDetected} used=${report.meta.encodingUsed}`
  );
  lines.push(
    `- Lines: ${Number(report.meta.lines).toLocaleString('en-US')}`
  );
  lines.push(
    `- Parsed features (by section scan): ${Number(
      report.meta.features
    ).toLocaleString('en-US')}`
  );
  lines.push(
    `- sosijs parse: ${
      report.meta.sosijs?.parsed
        ? `ok (${report.meta.sosijs.featureCount} features)`
        : `failed (${report.meta.sosijs?.error ?? 'unknown error'})`
    }`
  );
  lines.push('');
  lines.push('### Feature Sections');
  for (const [k, v] of Object.entries(
    report.counts.featuresBySection
  )) {
    lines.push(`- ${k}: ${v}`);
  }
  lines.push('');
  lines.push('### Object Types (OBJTYPE)');
  for (const [k, v] of Object.entries(report.counts.objType)) {
    lines.push(`- ${k}: ${v}`);
  }
  lines.push('');
  lines.push('### Themes (P_TEMA, from point objects)');
  const pLabel = report.mapping.pTemaCodeToLabel ?? {};
  for (const [k, v] of Object.entries(report.counts.pTema)) {
    const lbl = pLabel[k] ? ` (${pLabel[k]})` : '';
    lines.push(`- ${k}${lbl}: ${v}`);
  }
  lines.push('');
  lines.push('### Themes (L_TEMA, from ledning/curve objects)');
  const lLabel = report.mapping.lTemaCodeToLabel ?? {};
  for (const [k, v] of Object.entries(report.counts.lTema)) {
    const lbl = lLabel[k] ? ` (${lLabel[k]})` : '';
    lines.push(`- ${k}${lbl}: ${v}`);
  }
  lines.push('');
  lines.push('### Most Common Fields (presence count)');
  for (const [k, v] of Object.entries(
    report.fields.presenceCountsTop
  ).slice(0, 40)) {
    lines.push(`- ${k}: ${v}`);
  }
  lines.push('');
  lines.push('### Mapping Notes');
  lines.push(
    '- `P_TEMA` code labels are sourced from `src/data/fields.json` fieldKey `Tema_punkt` (acceptableValues).'
  );
  lines.push(
    '- `L_TEMA` code labels are sourced from `src/data/fields.json` fieldKey `Tema_led` (acceptableValues).'
  );
  lines.push(
    '- Full machine-readable output is written to `analysis/sosi-report.json`.'
  );
  return lines.join('\n');
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.input) {
    console.error(
      'Usage: node scripts/analyze-sosi.mjs <path-to.sos> [--out analysis/sosi-report.json] [--summary]'
    );
    process.exit(1);
  }

  const repoRoot = process.cwd();
  const sosiPath = path.isAbsolute(args.input)
    ? args.input
    : path.join(repoRoot, args.input);
  const fieldsJsonPath = path.join(
    repoRoot,
    'src',
    'data',
    'fields.json'
  );

  const report = await analyzeSosi(sosiPath, fieldsJsonPath);

  if (args.out) {
    const outPath = path.isAbsolute(args.out)
      ? args.out
      : path.join(repoRoot, args.out);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(
      outPath,
      JSON.stringify(report, null, 2),
      'utf8'
    );
    console.log(`Wrote report: ${outPath}`);
  }

  if (args.mdOut) {
    const outPath = path.isAbsolute(args.mdOut)
      ? args.mdOut
      : path.join(repoRoot, args.mdOut);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, formatMarkdown(report) + '\n', 'utf8');
    console.log(`Wrote markdown: ${outPath}`);
  }

  if (args.summary) {
    console.log(formatSummary(report, args.limitObjectTypes));
  }
}

await main();
