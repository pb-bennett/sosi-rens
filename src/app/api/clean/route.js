/**
 * @file route.js (clean)
 * API route for cleaning (filtering) a SOSI file.
 * Accepts a multipart form upload with file, selection JSON, and optional fieldMode.
 * Returns the cleaned SOSI file as a downloadable binary attachment.
 */

import {
  decodeSosiBuffer,
  encodeSosiText,
} from '../../../lib/sosi/encoding.js';
import { cleanSosiText } from '../../../lib/sosi/clean.js';

/** Use Node.js runtime for Buffer and iconv support. */
export const runtime = 'nodejs';

/**
 * Handle POST requests to clean a SOSI file.
 * @param {Request} request - Incoming request with multipart form data.
 * @returns {Promise<Response>} Binary response (cleaned file) or JSON error.
 */
export async function POST(request) {
  try {
    const version = process.env.VERCEL_GIT_COMMIT_SHA
      ? process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 12)
      : 'local';
    const formData = await request.formData();
    const file = formData.get('file');
    const selectionJson = formData.get('selection');
    const fieldModeRaw = formData.get('fieldMode');

    if (!file) {
      return Response.json(
        { error: 'Ingen fil ble lastet opp.' },
        { status: 400 }
      );
    }

    if (typeof file.arrayBuffer !== 'function') {
      return Response.json(
        { error: 'Ugyldig filformat.' },
        { status: 400 }
      );
    }

    let selection = null;
    if (selectionJson) {
      try {
        selection = JSON.parse(String(selectionJson));
      } catch {
        return Response.json(
          { error: 'Ugyldig utvalg (selection).' },
          { status: 400 }
        );
      }
    }

    const fieldMode =
      String(fieldModeRaw || '') === 'clear-values'
        ? 'clear-values'
        : 'remove-fields';

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const decoded = decodeSosiBuffer(buffer);
    const cleaned = cleanSosiText(decoded.text, selection, {
      fieldMode,
    });

    const outEncoding = decoded.encoding?.used || 'utf8';
    const outBuffer = encodeSosiText(cleaned.text, outEncoding);

    const originalName = file.name || 'fil.sos';
    const cleanedName = originalName.replace(
      /(\.[^.]+)?$/,
      '-renset$1'
    );

    return new Response(outBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${cleanedName}"`,
        'X-Sosi-Rens-Version': version,
      },
    });
  } catch (error) {
    return Response.json(
      {
        error: 'Kunne ikke generere renset SOSI-fil.',
        detail:
          error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
