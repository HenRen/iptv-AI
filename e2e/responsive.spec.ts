import { test, expect, connectMock, resetServer } from './fixtures';

/**
 * §23 — mobile is a different layout, not a shrunken desktop.
 */
test.describe('mobile', () => {
  test.beforeEach(async ({ page }) => {
    await resetServer(page);
    await connectMock(page);
  });

  test('bottom navigation replaces the sidebar', async ({ page }) => {
    await page.goto('/home');
    const navs = page.getByRole('navigation', { name: 'Main' });
    // Both exist in the DOM; exactly one is visible at this width.
    await expect(navs.filter({ has: page.getByText('Live TV') }).first()).toBeVisible();

    const sidebarVisible = await page.evaluate(() => {
      const nav = document.querySelector('nav.md\\:flex');
      if (!nav) return false;
      return getComputedStyle(nav).display !== 'none';
    });
    expect(sidebarVisible).toBe(false);
  });

  test('the page never scrolls horizontally', async ({ page }) => {
    for (const path of ['/home', '/live', '/movies', '/search']) {
      await page.goto(path);
      await page.waitForTimeout(400);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      );
      expect(overflow, `${path} scrolls horizontally`).toBe(false);
    }
  });

  test('Live TV shows a horizontal category strip instead of the rail', async ({ page }) => {
    await page.goto('/live');
    await expect(page.getByRole('button', { name: 'All', exact: true })).toBeVisible({
      timeout: 15_000,
    });
  });
});
