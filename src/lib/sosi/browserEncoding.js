/**
 * @file browserEncoding.js
 * Character-encoding detection and conversion for SOSI files in the browser.
 * Uses TextDecoder/TextEncoder (no iconv dependency) for client-side processing.
 */

/**
 * Map a SOSI ..TEGNSETT declaration to an internal encoding name.
 * @param {string} name - Value from ..TEGNSETT line.
 * @returns {'latin1' | 'win1252' | 'utf8' | null} Internal encoding name.
 */
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

/**
 * Scan the first 200 lines (interpreted as Latin-1) for a ..TEGNSETT declaration.
 * Stops early if a feature section starts (to avoid scanning data).
 * @param {string} sampleLatin1Text - Header portion decoded as Latin-1.
 * @returns {'latin1' | 'win1252' | 'utf8' | null} Encoding declared in header, or null.
 */
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

/**
 * Convert bytes to a string treating each byte as a Latin-1 code point.
 * Processes in chunks to avoid call-stack limits on `String.fromCharCode`.
 * @param {Uint8Array | ArrayBuffer} bytes - Raw bytes.
 * @returns {string} Latin-1 decoded string.
 */
function bytesToLatin1String(bytes) {
  const view =
    bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const chunkSize = 0x8000; // 32KB chunks to stay within call-stack limits
  let out = '';
  for (let i = 0; i < view.length; i += chunkSize) {
    const chunk = view.subarray(i, i + chunkSize);
    out += String.fromCharCode(...chunk);
  }
  return out;
}

/**
 * Heuristic: check if UTF-8 decoding produced replacement characters.
 * @param {string} text - Decoded text sample.
 * @returns {boolean} True if the text contains the Unicode replacement char (U+FFFD).
 */
function utf8LooksBroken(text) {
  return String(text).includes('\uFFFD');
}

/**
 * Decode bytes using a specified encoding via TextDecoder.
 * @param {Uint8Array | ArrayBuffer} bytes - Raw bytes.
 * @param {string} encodingLabel - Encoding label (e.g. 'utf-8', 'windows-1252').
 * @returns {string} Decoded text.
 */
function decodeWithTextDecoder(bytes, encodingLabel) {
  const view =
    bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const decoder = new TextDecoder(encodingLabel, { fatal: false });
  return decoder.decode(view);
}

/**
 * Detect the character encoding of a SOSI file from its raw bytes.
 * Strategy: read header as Latin-1 to find ..TEGNSETT, else probe UTF-8, else fall back to Windows-1252.
 * @param {Uint8Array | ArrayBuffer} bytes - Raw file bytes.
 * @returns {{ detected: string, used: string, fallbackUsed: boolean, declaredInHeader: boolean }} Encoding info.
 */
export function detectSosiEncodingFromBytes(bytes) {
  const view =
    bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const sample = view.subarray(0, Math.min(view.length, 65536));

  // Parse header as Latin-1 so we can reliably read ..TEGNSETT even if file is single-byte encoded.
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

/**
 * Convert internal encoding name to a TextDecoder label.
 * @param {string} internalName - 'utf8', 'latin1', or 'win1252'.
 * @returns {string} TextDecoder-compatible label.
 */
function internalToDecoderLabel(internalName) {
  if (internalName === 'utf8') return 'utf-8';
  if (internalName === 'latin1') return 'iso-8859-1';
  return 'windows-1252';
}

/**
 * Encode a string as Latin-1 bytes.
 * Characters outside the 0–255 range are replaced with '?' (0x3F).
 * @param {string} text - Input string.
 * @returns {Uint8Array} Latin-1 encoded bytes.
 */
function encodeLatin1(text) {
  const str = String(text);
  const out = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    out[i] = code <= 0xff ? code : 0x3f; // Replace out-of-range with '?'
  }
  return out;
}

/**
 * Decode a SOSI file ArrayBuffer to a string, auto-detecting encoding.
 * @param {ArrayBuffer} arrayBuffer - Raw file bytes.
 * @returns {{ text: string, encoding: Object }} Decoded text and encoding info.
 */
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

/**
 * Encode SOSI text to bytes using the specified encoding.
 * @param {string} text - SOSI text content.
 * @param {string} [internalEncodingName='utf8'] - 'utf8', 'latin1', or 'win1252'.
 * @returns {Uint8Array} Encoded bytes.
 */
export function encodeSosiTextToBytes(text, internalEncodingName) {
  const name = internalEncodingName || 'utf8';
  if (name === 'utf8') {
    return new TextEncoder().encode(String(text));
  }

  // For latin1 / win1252, output single-byte text.
  return encodeLatin1(text);
}
