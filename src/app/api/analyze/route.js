/**
 * @file route.js (analyze)
 * API route for analyzing a SOSI file.
 * Accepts a multipart form upload, decodes the file, runs analysis,
 * and returns JSON with file info, encoding info, and analysis results.
 */

import { decodeSosiBuffer } from '../../../lib/sosi/encoding.js';
import { analyzeSosiText } from '../../../lib/sosi/analyze.js';

/** Use Node.js runtime for Buffer and iconv support. */
export const runtime = 'nodejs';

/**
 * Handle POST requests to analyze a SOSI file.
 * @param {Request} request - Incoming request with multipart form data.
 * @returns {Promise<Response>} JSON response with analysis or error.
 */
export async function POST(request) {
  try {
    const version = process.env.VERCEL_GIT_COMMIT_SHA
      ? process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 12)
      : 'local';
    const formData = await request.formData();
    const file = formData.get('file');

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

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const decoded = decodeSosiBuffer(buffer);
    const analysis = analyzeSosiText(decoded.text);

    return Response.json(
      {
        file: {
          name: file.name || null,
          sizeBytes: buffer.length,
        },
        encoding: decoded.encoding,
        analysis,
      },
      {
        headers: {
          'Cache-Control': 'no-store',
          'X-Sosi-Rens-Version': version,
        },
      }
    );
  } catch (error) {
    return Response.json(
      {
        error: 'Kunne ikke analysere SOSI-filen.',
        detail:
          error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
