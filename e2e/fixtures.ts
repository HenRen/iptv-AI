import { test as base, expect, type Page } from '@playwright/test';

/**
 * Shared E2E helpers.
 *
 * Every spec starts from a clean server state so tests cannot depend on each
 * other's leftovers — the usual cause of a suite that passes in order and
 * fails in isolation.
 */

export async function resetServer(page: Page) {
  const res = await page.request.get('/api/playlists');
  const body = (await res.json()) as { playlists: Array<{ id: string }> };
  for (const playlist of body.playlists) {
    await page.request.delete(`/api/playlists?id=${encodeURIComponent(playlist.id)}`);
  }
}

export async function connectMock(page: Page, name = 'E2E Mock') {
  const res = await page.request.post('/api/playlists', {
    data: { type: 'mock', name },
  });
  expect(res.ok()).toBeTruthy();
  return res.json();
}

export const SAMPLE_M3U = `#EXTM3U url-tvg="http://example.invalid/xmltv.php"
#EXTINF:-1 tvg-id="espn1.nl" tvg-name="ESPN 1" group-title="NL Sports",NL | ESPN 1 FHD
http://example.invalid/live/u/p/101.ts
#EXTINF:-1 tvg-id="cnn.us" group-title="US News",US: CNN HD
http://example.invalid/live/u/p/102.ts
#EXTINF:-1 group-title="Movies",The Matrix (1999)
http://example.invalid/movie/u/p/500.mp4
#EXTINF:-1 group-title="Series",Ted Lasso S01E01
http://example.invalid/series/u/p/900.mkv
`;

export const test = base.extend<{ cleanPage: Page }>({
  cleanPage: async ({ page }, use) => {
    await resetServer(page);
    await use(page);
  },
});

export { expect };
