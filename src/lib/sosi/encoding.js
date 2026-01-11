/**
 * @file encoding.js
 * Server-side SOSI character-encoding detection and conversion.
 * Uses iconv-lite for robust multi-encoding support (including ISO-8859-10).
 */

import iconv from 'iconv-lite';

/**
 * Map a SOSI ..TEGNSETT declaration to an iconv-lite encoding name.
 * @param {string} name - Value from ..TEGNSETT line.
 * @returns {'latin1' | 'iso-8859-10' | 'win1252' | 'utf8' | null} iconv-lite encoding name.
 */
function mapSosiDeclaredEncodingToIconv(name) {
  const upper = String(name || '').toUpperCase();
  if (!upper) return null;

  if (upper.includes('ISO8859-1') || upper.includes('ISO-8859-1'))
    return 'latin1';
  if (upper.includes('ISO8859-10') || upper.includes('ISO-8859-10'))
    return 'iso-8859-10';
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
 * Scan header (interpreted as Latin-1) for a ..TEGNSETT declaration.
 * @param {string} sampleLatin1Text - Header portion decoded as Latin-1.
 * @returns {'latin1' | 'iso-8859-10' | 'win1252' | 'utf8' | null} Declared encoding, or null.
 */
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

/**
 * Heuristic: check if UTF-8 decoding produced replacement characters.
 * @param {string} text - Decoded text sample.
 * @returns {boolean} True if text contains U+FFFD.
 */
function utf8LooksBroken(text) {
  return String(text).includes('\uFFFD');
}

/**
 * Detect the character encoding of a SOSI file buffer (server-side).
 * Strategy: read header as Latin-1 to find ..TEGNSETT, else probe UTF-8, else fall back to Windows-1252.
 * @param {Buffer} buffer - Raw file buffer.
 * @returns {{ detected: string, used: string, fallbackUsed: boolean, declaredInHeader: boolean }} Encoding info.
 */
export function detectSosiEncoding(buffer) {
  const sampleBytes = buffer.subarray(
    0,
    Math.min(buffer.length, 65536)
  );

  // Decode header as Latin-1 so we can reliably read ..TEGNSETT.
  const headerLatin1 = iconv.decode(sampleBytes, 'latin1');
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

/**
 * Decode a SOSI file buffer to a string, auto-detecting encoding.
 * @param {Buffer} buffer - Raw file buffer.
 * @returns {{ text: string, encoding: Object }} Decoded text and encoding info.
 */
export function decodeSosiBuffer(buffer) {
  const info = detectSosiEncoding(buffer);
  const text = iconv.decode(buffer, info.used);
  return { text, encoding: info };
}

/**
 * Encode SOSI text to a buffer using the specified encoding.
 * @param {string} text - SOSI text content.
 * @param {string} [encodingName='utf8'] - iconv-lite encoding name.
 * @returns {Buffer} Encoded buffer.
 */
export function encodeSosiText(text, encodingName) {
  return iconv.encode(String(text), encodingName || 'utf8');
}
