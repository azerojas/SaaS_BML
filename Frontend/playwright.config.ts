import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 8000 },
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['json', { outputFile: '.artifacts/e2e-results.json' }],
  ],
  use: {
    serviceWorkers: 'block',
    launchOptions: {
      args: process.env['BM_E2E_CERT_SPKI']
        ? ['--ignore-certificate-errors-spki-list=' + process.env['BM_E2E_CERT_SPKI']]
        : [],
    },
    baseURL: 'https://localhost:4443',
    ignoreHTTPSErrors: true,
    trace: 'off',
    video: 'off',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
