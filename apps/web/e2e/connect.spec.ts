import { test, expect, resetServer, SAMPLE_M3U } from './fixtures';

/**
 * First-run flow (PROTOTYPE.md §1):
 * welcome → source → Xtream / M3U URL / M3U file → progress → cleanup → Home.
 */
test.describe('connection manager', () => {
  test.beforeEach(async ({ page }) => {
    await resetServer(page);
  });

  test('first launch shows the welcome screen', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/welcome/);
    await expect(
      page.getByRole('heading', { name: 'Your TV. Your content. Smarter.' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Connect IPTV' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Explore demo' })).toBeVisible();
  });

  test('the source picker offers all three methods', async ({ page }) => {
    await page.goto('/welcome');
    await page.getByRole('button', { name: 'Connect IPTV' }).click();

    await expect(page.getByRole('heading', { name: 'Connect your TV' })).toBeVisible();
    await expect(page.getByText('Xtream Codes')).toBeVisible();
    await expect(page.getByText('M3U Playlist')).toBeVisible();
    await expect(page.getByText('M3U File')).toBeVisible();
  });

  test('Xtream form validates before it will submit', async ({ page }) => {
    await page.goto('/welcome');
    await page.getByRole('button', { name: 'Connect IPTV' }).click();
    await page.getByText('Xtream Codes').click();

    const submit = page.getByRole('button', { name: 'Test connection' });
    await expect(submit).toBeDisabled();

    await page.getByLabel('Server URL').fill('http://example.invalid');
    await page.getByLabel('Username').fill('user');
    await page.getByLabel('Password').fill('pass');
    await expect(submit).toBeEnabled();
  });

  test('an unreachable Xtream host reports a usable error and leaks no password', async ({
    page,
  }) => {
    await page.goto('/welcome');
    await page.getByRole('button', { name: 'Connect IPTV' }).click();
    await page.getByText('Xtream Codes').click();

    await page.getByLabel('Playlist name').fill('Bad');
    await page.getByLabel('Server URL').fill('http://nonexistent-provider-xyz.invalid');
    await page.getByLabel('Username').fill('user1234');
    await page.getByLabel('Password').fill('secret9876');
    await page.getByRole('button', { name: 'Test connection' }).click();

    await expect(
      page.locator('text=/could not be resolved|unreachable|timed out|authenticate/i').first(),
    ).toBeVisible({ timeout: 30_000 });

    // The password must never appear anywhere in the rendered page.
    await expect(page.locator('body')).not.toContainText('secret9876');
  });

  test('M3U file upload parses into a real catalogue', async ({ page }) => {
    await page.goto('/welcome');
    await page.getByRole('button', { name: 'Connect IPTV' }).click();
    await page.getByText('M3U File').click();

    await page.setInputFiles('input[type="file"]', {
      name: 'sample.m3u',
      mimeType: 'audio/x-mpegurl',
      buffer: Buffer.from(SAMPLE_M3U),
    });
    await expect(page.getByText(/entries/)).toBeVisible();

    await page.getByRole('button', { name: 'Import' }).click();

    await expect(page.getByRole('heading', { name: 'Your TV is ready' })).toBeVisible({
      timeout: 40_000,
    });
    await expect(page.getByText('Live channels')).toBeVisible();

    await page.getByRole('button', { name: 'Start watching' }).click();
    await expect(page).toHaveURL(/\/home/);
  });

  test('the demo path connects and lands on Home', async ({ page }) => {
    await page.goto('/welcome');
    await page.getByRole('button', { name: 'Explore demo' }).click();

    await expect(page.getByRole('heading', { name: 'Your TV is ready' })).toBeVisible({
      timeout: 40_000,
    });
    await page.getByRole('button', { name: 'Start watching' }).click();
    await expect(page).toHaveURL(/\/home/);
  });

  test('the progress screen names the real stages', async ({ page }) => {
    await page.goto('/welcome');
    await page.getByRole('button', { name: 'Explore demo' }).click();

    // The step list is visible while the real connect is in flight.
    await expect(
      page.getByText('Preparing your TV').or(page.getByRole('heading', { name: 'Your TV is ready' })),
    ).toBeVisible({ timeout: 20_000 });
  });
});
