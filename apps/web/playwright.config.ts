import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

/**
 * Some environments ship a pre-installed Chromium whose build number does not
 * match this Playwright release. Point at it rather than downloading a second
 * copy; fall back to Playwright's own resolution when it is absent.
 */
const PREINSTALLED_CHROMIUM = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const executablePath = existsSync(PREINSTALLED_CHROMIUM) ? PREINSTALLED_CHROMIUM : undefined;

/**
 * End-to-end suite (§35).
 *
 * Runs against a production build with a throwaway data directory and the
 * mock provider, so the journeys are real — a genuine connect, a genuine
 * catalogue, a genuine guide — without needing an IPTV subscription in CI.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3210',
    trace: 'retain-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'desktop',
      testIgnore: /responsive\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        launchOptions: { executablePath },
      },
    },
    {
      name: 'mobile',
      testMatch: /responsive\.spec\.ts/,
      use: { ...devices['Pixel 7'], launchOptions: { executablePath } },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'npm run start -- --port 3210',
        url: 'http://127.0.0.1:3210/api/playlists',
        reuseExistingServer: false,
        timeout: 60_000,
        env: {
          HENREN_SECRET: 'e2e-test-secret-key-not-for-production',
          HENREN_DATA_DIR: '.e2e-data',
          // The suite drives these endpoints far harder than a person does.
          // Production defaults stay unchanged; only the test server opts out.
          HENREN_RATE_LIMIT: 'off',
        },
      },
});
