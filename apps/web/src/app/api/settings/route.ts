import 'server-only';

/**
 * Thin binding: the handler itself lives in `@streamwise/server` so the same
 * code serves this Next.js app and the standalone API a TV client talks to.
 * `import 'server-only'` stays here, at the boundary Next actually enforces.
 */
export { GET, PATCH } from '@streamwise/server/routes/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
