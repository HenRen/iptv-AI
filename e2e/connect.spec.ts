import { test, expect, resetServer, SAMPLE_M3U } from './fixtures';

/**
 * §35 — Add Xtream Playlist / Add M3U Playlist journeys, and the first-launch
 * experience that fronts them.
 */
test.describe('connection manager', () => {
  test.beforeEach(async ({ page }) => {
    await resetServer(page);
  });

  test('first launch shows the onboarding screen with three methods', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/welcome/);
    await expect(page.getByRole('heading', { name: 'WATCH TV YOUR WAY' })).toBeVisible();
    await expect(page.getByText('Xtream Codes')).toBeVisible();
    await expect(page.getByText('M3U URL')).toBeVisible();
    await expect(page.getByText('Upload Playlist')).toBeVisible();
  });

  test('Xtream form validates before it will submit', async ({ page }) => {
    await page.goto('/welcome');
    await page.getByText('Xtream Codes').click();

    const connect = page.getByRole('button', { name: 'Connect' });
    await expect(connect).toBeDisabled();

    await page.getByLabel('Server / Host URL').fill('http://example.invalid');
    await page.getByLabel('Username').fill('user');
    await page.getByLabel('Password').fill('pass');
    await expect(connect).toBeEnabled();
  });

  test('an unreachable Xtream host reports a usable error and leaks no password', async ({
    page,
  }) => {
    await page.goto('/welcome');
    await page.getByText('Xtream Codes').click();
    await page.getByLabel('Playlist Name').fill('Bad');
    await page.getByLabel('Server / Host URL').fill('http://nonexistent-provider-xyz.invalid');
    await page.getByLabel('Username').fill('user1234');
    await page.getByLabel('Password').fill('secret9876');
    await page.getByRole('button', { name: 'Connect' }).click();

    const alert = page.locator('text=/could not be resolved|unreachable|timed out|authenticate/i');
    await expect(alert.first()).toBeVisible({ timeout: 30_000 });

    // The password must never appear anywhere in the rendered page.
    await expect(page.locator('body')).not.toContainText('secret9876');
  });

  test('M3U file upload parses into a real catalogue', async ({ page }) => {
    await page.goto('/welcome');
    await page.getByText('Upload Playlist').click();

    await page.setInputFiles('input[type="file"]', {
      name: 'sample.m3u',
      mimeType: 'audio/x-mpegurl',
      buffer: Buffer.from(SAMPLE_M3U),
    });

    await expect(page.getByText(/entries/)).toBeVisible();
    await page.getByRole('button', { name: 'Connect' }).click();

    await expect(page.getByText('Playlist connected successfully')).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText('Live Channels')).toBeVisible();

    await page.getByRole('button', { name: 'CONTINUE TO TV' }).click();
    await expect(page).toHaveURL(/\/home/);
  });

  test('sample data path connects and lands on Home', async ({ page }) => {
    await page.goto('/welcome');
    await page.getByText('Explore with sample data instead').click();
    await expect(page.getByText('Playlist connected successfully')).toBeVisible({
      timeout: 30_000,
    });
    await page.getByRole('button', { name: 'CONTINUE TO TV' }).click();
    await expect(page).toHaveURL(/\/home/);
  });
});
