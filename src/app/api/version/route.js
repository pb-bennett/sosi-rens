/**
 * @file route.js (version)
 * API route returning build/environment metadata.
 * Used by the frontend to display version info in the header.
 */

/** Use Node.js runtime for access to Vercel env vars. */
export const runtime = 'nodejs';

/**
 * Handle GET requests for version/environment info.
 * @returns {Promise<Response>} JSON with env, commit, ref, and timestamp.
 */
export async function GET() {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA || null;
  const ref = process.env.VERCEL_GIT_COMMIT_REF || null;
  const env = process.env.VERCEL ? 'vercel' : 'local';

  return Response.json(
    {
      env,
      commit: sha ? sha.slice(0, 12) : null,
      ref,
      now: new Date().toISOString(),
    },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    }
  );
}
