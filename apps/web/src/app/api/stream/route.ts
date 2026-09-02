import 'server-only';

/**
 * Thin binding: the handler itself lives in `@streamwise/server` so the same
 * code serves this Next.js app and the standalone API a TV client talks to.
 * `import 'server-only'` stays here, at the boundary Next actually enforces.
 */
export { GET } from '@streamwise/server/routes/stream';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
