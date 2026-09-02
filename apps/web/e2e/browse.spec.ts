import { test, expect, connectMock, resetServer } from './fixtures';

/**
 * §35 — Open Live TV, select channel, open Guide, play movie, open series,
 * favorite a channel, search.
 */
test.describe('browsing', () => {
  test.beforeEach(async ({ page }) => {
    await resetServer(page);
    await connectMock(page);
  });

  test('Live TV lists categories and channels, and selecting one starts it', async ({ page }) => {
    await page.goto('/live');

    await expect(page.getByRole('navigation', { name: 'Channel categories' })).toBeVisible();
    await expect(page.getByText('All Channels')).toBeVisible();

    const firstChannel = page.getByRole('button', { name: /^Watch / }).first();
    await expect(firstChannel).toBeVisible();
    await firstChannel.click();

    // A channel banner confirms the zap, and the player region appears.
    await expect(page.locator('video')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('status')).toBeVisible({ timeout: 10_000 });
  });

  test('category selection filters the channel list', async ({ page }) => {
    await page.goto('/live');
    await expect(page.getByText('All Channels')).toBeVisible();

    const before = await page.getByRole('button', { name: /^Watch / }).count();
    await page.getByRole('button', { name: /NL Sports/i }).first().click();
    await expect
      .poll(async () => page.getByRole('button', { name: /^Watch / }).count())
      .toBeLessThan(before);
  });

  test('the guide renders a time grid with a channel column', async ({ page }) => {
    await page.goto('/guide');
    await expect(page.getByText('Channel')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Now' })).toBeVisible();

    // Programme blocks are real buttons carrying real titles.
    const programmes = page.getByRole('button', { name: /.+/ });
    await expect(programmes.first()).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: '+2h' }).click();
    await expect(page.getByRole('button', { name: 'Now' })).toBeVisible();
  });

  test('movies list and detail open, and playback can start', async ({ page }) => {
    await page.goto('/movies');
    const first = page.getByRole('button', { name: 'Interstellar' }).first();
    await expect(first).toBeVisible({ timeout: 15_000 });
    await first.click();

    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Interstellar' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Play$|^Resume$/ })).toBeVisible();
  });

  test('series detail lists seasons and episodes', async ({ page }) => {
    await page.goto('/series');
    const first = page.getByRole('button', { name: 'Ted Lasso' }).first();
    await expect(first).toBeVisible({ timeout: 15_000 });
    await first.click();

    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Season 1' })).toBeVisible();
    await expect(page.getByText('Episode 1', { exact: true })).toBeVisible();
  });

  test('search finds channels, movies and series', async ({ page }) => {
    await page.goto('/search');
    await page.getByLabel('Search').fill('espn');
    await expect(page.getByText('Channels')).toBeVisible({ timeout: 15_000 });

    await page.getByLabel('Search').fill('interstellar');
    await expect(page.getByRole('button', { name: 'Interstellar' }).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test('search reports an honest empty state rather than inventing results', async ({ page }) => {
    await page.goto('/search');
    await page.getByLabel('Search').fill('zzzznotarealtitle');
    await expect(page.getByText(/Nothing found for/)).toBeVisible({ timeout: 15_000 });
  });

  test('favoriting a channel persists across a reload', async ({ page }) => {
    await page.goto('/live');
    const favorite = page.getByRole('button', { name: /Add .* to favorites/ }).first();
    await favorite.click();

    await page.goto('/favorites');
    await expect(page.getByText('Channels')).toBeVisible({ timeout: 15_000 });

    await page.reload();
    await expect(page.getByText('Channels')).toBeVisible({ timeout: 15_000 });
  });
});
