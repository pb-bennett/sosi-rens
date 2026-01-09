import iconv from 'iconv-lite';

function mapSosiDeclaredEncodingToIconv(name) {
  const upper = String(name || '').toUpperCase();
  if (!upper) return null;

  if (upper.includes('ISO8859-1') || upper.includes('ISO-8859-1')) return 'latin1';
  if (upper.includes('ISO8859-10') || upper.includes('ISO-8859-10')) return 'iso-8859-10';
  if (upper.includes('WINDOWS') || upper.includes('CP1252') || upper.includes('1252')) return 'win1252';
  if (upper.includes('UTF-8') || upper.includes('UTF8')) return 'utf8';

  return null;
}

function tryFindDeclaredEncodingInLatin1Header(sampleLatin1Text) {
  const lines = String(sampleLatin1Text).split(/\r?\n/);
  for (let i = 0; i < Math.min(lines.length, 200); i++) {
    const line = lines[i].trim();
    const match = line.match(/^\.\.TEGNSETT\s+(\S+)/i);
    if (match) return mapSosiDeclaredEncodingToIconv(match[1]);

    if (
      line.startsWith('.PUNKT') ||
      line.startsWith('.KURVE') ||
      line.startsWith('.FLATE') ||
      line.startsWith('.TEKST')
    ) {
      break;
    }
  }
  return null;
}

function utf8LooksBroken(text) {
  return String(text).includes('\uFFFD');
}

export function detectSosiEncoding(buffer) {
  const sampleBytes = buffer.subarray(0, Math.min(buffer.length, 65536));

  // Decode a header sample as latin1 so we can reliably read the ..TEGNSETT line.
  const headerLatin1 = iconv.decode(sampleBytes, 'latin1');
  const declared = tryFindDeclaredEncodingInLatin1Header(headerLatin1);

  if (declared) {
    return {
      detected: declared,
      used: declared,
      fallbackUsed: false,
      declaredInHeader: true,
    };
  }

  // If no header, try utf8 first, then fall back.
  const utf8Sample = iconv.decode(sampleBytes, 'utf8');
  if (!utf8LooksBroken(utf8Sample)) {
    return {
      detected: 'utf8',
      used: 'utf8',
      fallbackUsed: false,
      declaredInHeader: false,
    };
  }

  return {
    detected: 'utf8',
    used: 'win1252',
    fallbackUsed: true,
    declaredInHeader: false,
  };
}

export function decodeSosiBuffer(buffer) {
  const info = detectSosiEncoding(buffer);
  const text = iconv.decode(buffer, info.used);
  return { text, encoding: info };
}

export function encodeSosiText(text, encodingName) {
  return iconv.encode(String(text), encodingName || 'utf8');
}
