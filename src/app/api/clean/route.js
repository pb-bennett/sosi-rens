import {
  decodeSosiBuffer,
  encodeSosiText,
} from '../../../lib/sosi/encoding.js';
import { cleanSosiText } from '../../../lib/sosi/clean.js';

export const runtime = 'nodejs';

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
