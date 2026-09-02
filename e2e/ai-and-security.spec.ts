import { test, expect, connectMock, resetServer } from './fixtures';

/**
 * The AI layer's central claim, tested rather than asserted: it can organize,
 * recommend and search, but it cannot invent anything playable, and it cannot
 * cause an action outside the allowlist.
 */
test.describe('AI layer', () => {
  test.beforeEach(async ({ page }) => {
    await resetServer(page);
    await connectMock(page);
  });

  test('Ask TV opens and resolves a navigation command', async ({ page }) => {
    await page.goto('/home');
    await page.getByRole('button', { name: 'Ask TV' }).first().click();

    const dialog = page.getByRole('dialog', { name: 'Ask TV' });
    await expect(dialog).toBeVisible();

    await page.getByRole('textbox', { name: 'Ask TV' }).fill('open the guide');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page).toHaveURL(/\/guide/, { timeout: 15_000 });
  });

  test('Ask TV plays a channel that exists', async ({ page }) => {
    await page.goto('/home');
    await page.getByRole('button', { name: 'Ask TV' }).first().click();
    await page.getByRole('textbox', { name: 'Ask TV' }).fill('play ESPN 1');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.locator('video')).toBeVisible({ timeout: 20_000 });
  });

  test('Ask TV refuses a channel that is not in the playlist', async ({ page }) => {
    const res = await page.request.post('/api/ai', {
      data: { op: 'intent', utterance: 'play Totally Invented Channel 9000' },
    });
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(String(body.message)).toMatch(/no channel matching/i);
  });

  test('every AI rail resolves to real catalogue items', async ({ page }) => {
    const catalogRes = await page.request.get('/api/catalog?kind=live&limit=400');
    const catalog = await catalogRes.json();
    const known = new Set<string>(catalog.items.map((c: { id: string }) => c.id));

    const res = await page.request.post('/api/ai', { data: { op: 'rails', signals: {} } });
    const { rails } = await res.json();

    expect(Array.isArray(rails)).toBe(true);
    for (const rail of rails) {
      expect(rail.items.length).toBeGreaterThan(0);
      if (rail.kind !== 'channel') continue;
      for (const item of rail.items) expect(known.has(item.id)).toBe(true);
    }
  });

  test('sports intelligence only reports events backed by the guide', async ({ page }) => {
    const res = await page.request.post('/api/ai', { data: { op: 'sports' } });
    const { events, hasEpg } = await res.json();
    expect(hasEpg).toBe(true);

    // One batched request rather than one per event.
    const channelIds = [...new Set(events.map((e: { channelId: string }) => e.channelId))];
    if (channelIds.length === 0) return;

    const from = Math.min(...events.map((e: { start: number }) => e.start)) - 1;
    const to = Math.max(...events.map((e: { stop: number }) => e.stop)) + 1;
    const epg = await page.request.get(
      `/api/epg?channels=${encodeURIComponent(channelIds.join(','))}&from=${from}&to=${to}`,
    );
    const { schedules } = await epg.json();
    const byChannel = new Map<string, string[]>(
      schedules.map((s: { channelId: string; programs: Array<{ title: string }> }) => [
        s.channelId,
        s.programs.map((p) => p.title),
      ]),
    );

    for (const event of events) {
      expect(byChannel.get(event.channelId)).toContain(event.title);
    }
  });

  test('playlist health never mutates the catalogue', async ({ page }) => {
    const before = await (await page.request.get('/api/catalog?kind=live&limit=400')).json();
    await page.request.post('/api/ai', { data: { op: 'health' } });
    const after = await (await page.request.get('/api/catalog?kind=live&limit=400')).json();
    expect(after.total).toBe(before.total);
    expect(after.items.map((c: { name: string }) => c.name)).toEqual(
      before.items.map((c: { name: string }) => c.name),
    );
  });

  test('semantic search narrows to real items only', async ({ page }) => {
    const catalog = await (await page.request.get('/api/catalog?kind=movie&limit=200')).json();
    const known = new Set<string>(catalog.items.map((m: { id: string }) => m.id));

    const res = await page.request.post('/api/ai', {
      data: { op: 'search', query: '2010s science fiction movie' },
    });
    const body = await res.json();
    for (const movie of body.movies) expect(known.has(movie.id)).toBe(true);
  });

  test('an unknown AI operation is rejected', async ({ page }) => {
    const res = await page.request.post('/api/ai', { data: { op: 'rm-rf' } });
    expect(res.status()).toBe(400);
  });
});

test.describe('security', () => {
  test.beforeEach(async ({ page }) => {
    await resetServer(page);
    await connectMock(page);
  });

  test('the stream proxy refuses forged and absent tokens', async ({ page }) => {
    expect((await page.request.get('/api/stream')).status()).toBe(400);
    expect((await page.request.get('/api/stream?t=forged.signature')).status()).toBe(403);
  });

  test('the stream proxy will not fetch an arbitrary URL', async ({ page }) => {
    const payload = encodeURIComponent('u|x|http://169.254.169.254/latest/meta-data/');
    const res = await page.request.get(`/api/stream?t=${payload}`);
    expect(res.status()).toBe(403);
  });

  test('no response exposes provider credentials', async ({ page }) => {
    for (const path of [
      '/api/playlists',
      '/api/diagnostics',
      '/api/catalog?kind=live&limit=50',
      '/api/search?q=espn',
    ]) {
      const body = await (await page.request.get(path)).text();
      expect(body).not.toMatch(/password/i);
      expect(body).not.toMatch(/player_api\.php/i);
    }
  });

  test('playback URLs point at our own proxy, never the provider', async ({ page }) => {
    const catalog = await (await page.request.get('/api/catalog?kind=live&limit=1')).json();
    const id = catalog.items[0].id;
    const source = await (
      await page.request.get(`/api/play?kind=live&id=${encodeURIComponent(id)}`)
    ).json();
    expect(source.url.startsWith('/api/stream')).toBe(true);
    expect(source.proxied).toBe(true);
  });

  test('adult content stays filtered until explicitly allowed', async ({ page }) => {
    // The flag is server-side; a crafted query string must not unlock it.
    const res = await page.request.get('/api/catalog?kind=live&limit=400&includeAdult=1');
    const body = await res.json();
    expect(body.items.every((c: { adult: boolean }) => !c.adult)).toBe(true);
  });
});
