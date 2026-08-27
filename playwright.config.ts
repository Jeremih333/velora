import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  timeout: 60_000,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    locale: 'en-US',
    timezoneId: 'Europe/Moscow',
  },
  webServer: {
    command:
      'corepack pnpm --filter @velora/web build && corepack pnpm --filter @velora/web preview --host 127.0.0.1',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
  },
  projects: [
    { name: 'android', use: { ...devices['Pixel 7'] } },
    { name: 'iphone', use: { ...devices['iPhone 15'] } },
    { name: 'tablet', use: { ...devices['iPad Pro 11'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
  ],
});
