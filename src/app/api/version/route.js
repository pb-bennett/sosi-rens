export const runtime = 'nodejs';

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
