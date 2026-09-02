import { test, expect, connectMock, resetServer } from './fixtures';

/**
 * The app talks to its own origin and to nothing else.
 *
 * This is a deployment property, not a preference. A television on a hotel,
 * school or municipal network routinely cannot reach a third-party CDN, and
 * the failure mode is the bad one: the request is accepted and then hangs, so
 * a `<link rel="stylesheet">` never settles and the `load` event never fires.
 * The whole UI is then waiting on someone else's DNS.
 *
 * That is not hypothetical here — a linked webfont did exactly this, and the
 * E2E suite took 7.6 minutes instead of 31 seconds because every navigation
 * sat out the timeout. Hence a test rather than a note.
 *
 * Provider artwork is not an exception: it goes through /api/image, which is
 * the same origin, for the same reason plus two others (credentials and
 * mixed content).
 */
test.describe('self-contained', () => {
  test.beforeEach(async ({ page }) => {
    await resetServer(page);
    await connectMock(page);
  });

  test('no screen requests anything off-origin', async ({ page }) => {
    // Navigate before reading the origin: an unnavigated page is about:blank,
    // whose origin is the string "null" — which makes every request look
    // off-origin and the assertion meaningless.
    await page.goto('/home');
    const own = new URL(page.url()).origin;
    expect(own).toMatch(/^https?:\/\//);

    const offOrigin: string[] = [];
    page.on('request', (request) => {
      const url = request.url();
      if (url.startsWith('data:') || url.startsWith('blob:')) return;
      if (!url.startsWith(own)) offOrigin.push(`${request.resourceType()} ${url}`);
    });

    for (const path of ['/home', '/live', '/guide', '/movies', '/series', '/search', '/settings']) {
      await page.goto(path);
      await page.waitForLoadState('load');
    }

    expect(offOrigin, `off-origin requests:\n  ${offOrigin.join('\n  ')}`).toEqual([]);
  });

  test('the interface font is served by this origin', async ({ page }) => {
    await page.goto('/home');

    const fontRequests: string[] = [];
    page.on('request', (r) => {
      if (r.resourceType() === 'font') fontRequests.push(r.url());
    });

    // Force a reflow that needs the face, then let the fetch settle.
    await page.evaluate(() => document.fonts.ready);
    await page.reload();
    await page.evaluate(() => document.fonts.ready);

    for (const url of fontRequests) {
      expect(url).toContain('/fonts/space-grotesk-');
    }

    // And the family actually resolved, rather than silently falling back.
    const loaded = await page.evaluate(() => document.fonts.check('16px "Space Grotesk"'));
    expect(loaded).toBe(true);
  });

  test('a font file is served with the right type and is not empty', async ({ page }) => {
    const res = await page.request.get('/fonts/space-grotesk-latin.woff2');
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('font/woff2');
    expect((await res.body()).byteLength).toBeGreaterThan(1000);
  });
});
