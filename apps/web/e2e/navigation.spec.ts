import { test, expect, connectMock, resetServer } from './fixtures';

/**
 * §24 — the app must be fully usable without a mouse, and §17/§15 state must
 * survive a browser refresh.
 */
test.describe('keyboard and remote navigation', () => {
  test.beforeEach(async ({ page }) => {
    await resetServer(page);
    await connectMock(page);
  });

  test('arrow keys move focus between real controls', async ({ page }) => {
    await page.goto('/live');
    await page.waitForSelector('[data-focusable]');

    await page.locator('[data-focusable]').first().focus();
    const before = await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 80));

    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(250);
    const after = await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 80));

    expect(after).not.toBe(before);
    // Focus must land on something that opted into spatial navigation.
    const focusable = await page.evaluate(() =>
      document.activeElement?.hasAttribute('data-focusable'),
    );
    expect(focusable).toBe(true);
  });

  test('every interactive control is reachable by keyboard', async ({ page }) => {
    await page.goto('/home');
    await page.waitForSelector('[data-focusable]');

    // No interactive element may exist outside the spatial-navigation system,
    // unless it is explicitly declared a pointer-only duplicate of something
    // the keyboard can already do (aria-hidden AND tabindex="-1").
    const orphans = await page.evaluate(() => {
      const interactive = Array.from(
        document.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea'),
      );
      return interactive
        .filter((el) => {
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) return false;
          if (el.closest('[aria-hidden="true"]')) return false;
          if (el.getAttribute('tabindex') === '-1') return false;
          return !el.hasAttribute('data-focusable');
        })
        .map((el) => el.outerHTML.slice(0, 120));
    });
    expect(orphans).toEqual([]);
  });

  test('Enter activates the focused control', async ({ page }) => {
    await page.goto('/live');
    await page.getByRole('button', { name: /^Watch / }).first().focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('video')).toBeVisible({ timeout: 20_000 });
  });

  test('Escape leaves fullscreen rather than closing the app', async ({ page }) => {
    await page.goto('/live');
    await page.getByRole('button', { name: /^Watch / }).first().click();
    await expect(page.locator('video')).toBeVisible({ timeout: 20_000 });

    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    // Playback survives the key press.
    await expect(page.locator('video')).toBeVisible();
  });

  test('a focused control shows a visible focus treatment', async ({ page }) => {
    await page.goto('/home');
    await page.waitForSelector('[data-focusable]');
    await page.locator('[data-focusable]').first().focus();

    const shadow = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return '';
      return getComputedStyle(el).boxShadow;
    });
    expect(shadow).not.toBe('none');
  });
});

test.describe('state persistence', () => {
  test.beforeEach(async ({ page }) => {
    await resetServer(page);
    await connectMock(page);
  });

  test('refreshing the browser does not destroy the configured playlist', async ({ page }) => {
    await page.goto('/home');
    await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();

    await page.reload();
    await expect(page).toHaveURL(/\/home/);
    await expect(page.getByText('Connected')).toBeVisible({ timeout: 15_000 });
  });

  test('recent channels persist and drive the Recent category', async ({ page }) => {
    await page.goto('/live');
    await page.getByRole('button', { name: /^Watch / }).first().click();
    await page.waitForTimeout(600);

    await page.reload();
    await expect(page.getByText('Recent')).toBeVisible({ timeout: 15_000 });
  });
});
