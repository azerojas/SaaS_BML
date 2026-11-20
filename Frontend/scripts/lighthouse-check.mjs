// Only unauthenticated localhost acceptance. No credentials, cookies or business payloads.
import { chromium } from '@playwright/test';
import { launch } from 'chrome-launcher';
import lighthouse from 'lighthouse';
import { mkdirSync, writeFileSync } from 'node:fs';
const target = process.argv[2] || 'https://localhost:4443/login';
const url = new URL(target);
if (
  !['localhost', '127.0.0.1'].includes(url.hostname) ||
  url.pathname !== '/login' ||
  url.search ||
  url.hash
)
  throw new Error('Only isolated unauthenticated localhost login is allowed.');
mkdirSync('.artifacts', { recursive: true });
const browser = await launch({
  chromePath: chromium.executablePath(),
  chromeFlags: ['--headless', '--no-sandbox', '--ignore-certificate-errors'],
});
try {
  const result = await lighthouse(target, {
    port: browser.port,
    output: 'json',
    onlyCategories: ['performance', 'accessibility', 'best-practices'],
    chromeFlags: ['--ignore-certificate-errors'],
  });
  if (!result || result.lhr.runtimeError) throw new Error('Lighthouse did not complete.');
  const report = result.lhr;
  const summary = {
    url: target,
    environment: 'isolated unauthenticated Chromium, simulated mobile throttling',
    fetchTime: report.fetchTime,
    scores: Object.fromEntries(
      Object.entries(report.categories).map(([key, value]) => [key, value.score]),
    ),
    metrics: Object.fromEntries(
      [
        'first-contentful-paint',
        'largest-contentful-paint',
        'total-blocking-time',
        'cumulative-layout-shift',
        'speed-index',
      ].map((key) => [key, report.audits[key].numericValue]),
    ),
  };
  writeFileSync(
    '.artifacts/phase7-lighthouse-summary.json',
    JSON.stringify(summary, null, 2) + '\n',
  );
  console.log(JSON.stringify(summary));
} finally {
  await browser.kill();
}
