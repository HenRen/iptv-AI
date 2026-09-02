import { createApiServer } from './app';

/**
 * The standalone API entry point.
 *
 * `npm run build -w @streamwise/server` bundles this to `dist/standalone.cjs`
 * and `npm start` runs it. Everything it serves is in `app.ts`.
 */
const port = Number(process.env.PORT ?? 3211);
const host = process.env.HOST ?? '127.0.0.1';

createApiServer().listen(port, host, () => {
  console.log(`[streamwise] API listening on http://${host}:${port}`);
});
