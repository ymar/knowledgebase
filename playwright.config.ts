import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests against `astro dev` with a fresh local D1 (see tests/global-setup.ts).
 * One worker: the tests share one database and one dev server. Every test makes its own
 * uniquely named data, so they don't depend on each other or on run order.
 */
export default defineConfig({
  testDir: 'tests',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 8_000 },
  reporter: process.env.CI ? 'github' : 'list',
  globalSetup: './tests/global-setup.ts',
  globalTeardown: './tests/global-teardown.ts',
  use: {
    baseURL: 'http://localhost:4321',
    trace: 'off',
    viewport: { width: 1280, height: 900 },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } } }],
});
