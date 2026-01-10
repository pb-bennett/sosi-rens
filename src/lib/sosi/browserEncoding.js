function mapSosiDeclaredEncodingToInternal(name) {
  const upper = String(name || '').toUpperCase();
  if (!upper) return null;

  if (upper.includes('ISO8859-1') || upper.includes('ISO-8859-1'))
    return 'latin1';
  if (
    upper.includes('WINDOWS') ||
    upper.includes('CP1252') ||
    upper.includes('1252')
  )
    return 'win1252';
  if (upper.includes('UTF-8') || upper.includes('UTF8'))
    return 'utf8';

  return null;
}

function tryFindDeclaredEncodingInLatin1Header(sampleLatin1Text) {
  const lines = String(sampleLatin1Text).split(/\r?\n/);
  for (let i = 0; i < Math.min(lines.length, 200); i++) {
    const line = lines[i].trim();
    const match = line.match(/^\.\.TEGNSETT\s+(\S+)/i);
    if (match) return mapSosiDeclaredEncodingToInternal(match[1]);

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

function bytesToLatin1String(bytes) {
  const view =
    bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const chunkSize = 0x8000;
  let out = '';
  for (let i = 0; i < view.length; i += chunkSize) {
    const chunk = view.subarray(i, i + chunkSize);
    out += String.fromCharCode(...chunk);
  }
  return out;
}

function utf8LooksBroken(text) {
  return String(text).includes('\uFFFD');
}

function decodeWithTextDecoder(bytes, encodingLabel) {
  const view =
    bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  // TextDecoder labels: 'utf-8', 'windows-1252', 'iso-8859-1'
  const decoder = new TextDecoder(encodingLabel, { fatal: false });
  return decoder.decode(view);
}

export function detectSosiEncodingFromBytes(bytes) {
  const view =
    bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const sample = view.subarray(0, Math.min(view.length, 65536));

  // Parse header reliably by interpreting bytes as latin1 so we can read ..TEGNSETT.
  const headerLatin1 = bytesToLatin1String(sample);
  const declared =
    tryFindDeclaredEncodingInLatin1Header(headerLatin1);

  if (declared) {
    return {
      detected: declared,
      used: declared,
      fallbackUsed: false,
      declaredInHeader: true,
    };
  }

  const utf8Sample = decodeWithTextDecoder(sample, 'utf-8');
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

function internalToDecoderLabel(internalName) {
  if (internalName === 'utf8') return 'utf-8';
  if (internalName === 'latin1') return 'iso-8859-1';
  return 'windows-1252';
}

function encodeLatin1(text) {
  const str = String(text);
  const out = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    out[i] = code <= 0xff ? code : 0x3f; // '?'
  }
  return out;
}

export function decodeSosiArrayBuffer(arrayBuffer) {
  const info = detectSosiEncodingFromBytes(
    new Uint8Array(arrayBuffer)
  );
  const text = decodeWithTextDecoder(
    new Uint8Array(arrayBuffer),
    internalToDecoderLabel(info.used)
  );
  return { text, encoding: info };
}

export function encodeSosiTextToBytes(text, internalEncodingName) {
  const name = internalEncodingName || 'utf8';
  if (name === 'utf8') {
    return new TextEncoder().encode(String(text));
  }

  // For latin1 / win1252 we output single-byte text.
  return encodeLatin1(text);
}
