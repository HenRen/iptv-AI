import 'server-only';

/**
 * Thin binding: the handler itself lives in `@streamwise/server` so the same
 * code serves this Next.js app and the standalone API a TV client talks to.
 * `import 'server-only'` stays here, at the boundary Next actually enforces.
 */
export { POST } from '@streamwise/server/routes/playlistRefresh';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
