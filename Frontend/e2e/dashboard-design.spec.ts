import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { control, login } from './helpers';
test.beforeEach(async ({ request }) => control(request, 'reset'));

test('dashboard reúne los reportes como gráficos con un solo filtro y exportación detallada', async ({
  page,
}) => {
  await page.goto('/login');
  await login(page);
  await page.goto('/admin/reportes');
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
  await expect(page.locator('main select')).toHaveCount(1);
  await expect(page.locator('main input, main table, main details')).toHaveCount(0);
  const overview = page.locator('bm-report-chart').first();
  await expect(overview.locator('.overview-metrics .metric')).toHaveCount(4);
  await expect(overview.locator('bm-report-distribution .donut')).toBeVisible();
  await expect(overview.locator('bm-report-distribution .donut > div')).toHaveCount(1);
  await expect(overview.locator('.vertical-bars')).toBeVisible();
  const bar = overview
    .locator('.vertical-bars .chart-row')
    .filter({ hasText: 'Ventas confirmadas' })
    .locator('.chart-bar');
  const barSize = await bar.boundingBox();
  expect(barSize!.height).toBeGreaterThan(barSize!.width);
  expect(
    await overview.evaluate((element) => {
      const metrics = element.querySelector('.overview-metrics')!.getBoundingClientRect();
      const charts = element.querySelector('.report-chart-grid')!.getBoundingClientRect();
      return metrics.bottom <= charts.top;
    }),
  ).toBe(true);
  await expect(page.locator('a[href="/admin/reportes"]')).toHaveCount(0);
  const report = page.getByRole('combobox', { name: 'Reporte', exact: true });
  const reports = await report
    .locator('option')
    .evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value));
  expect(reports).toHaveLength(7);
  for (const value of reports) {
    const response = page.waitForResponse(
      (response) => new URL(response.url()).pathname === '/api/v1/analytics/' + value + '/',
    );
    await report.selectOption(value);
    expect((await response).status()).toBe(200);
    const charts = page.locator('bm-report-chart').last().locator('figure');
    await expect(charts).toHaveCount(value === 'payment-methods' ? 3 : 2);
    for (const chart of await charts.all()) await expect(chart).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Gráfico general del negocio', exact: true }),
    ).toBeVisible();
    if (value === 'revenue-series') {
      await expect(page.locator('bm-dashboard-trend svg circle').first()).toBeVisible();
    }
    if (value === 'payment-methods') {
      await expect(page.locator('bm-dashboard-methods .donut')).toHaveCount(2);
    }
    await expect(page.locator('main table, main details, main input')).toHaveCount(0);
  }
  await report.selectOption('inventory-alerts');
  await expect(page.locator('bm-report-chart').last()).toContainText('Cantidad de artículos');
  const exportResponse = page.waitForResponse(
    (response) => new URL(response.url()).pathname === '/api/v1/reports/export.xlsx',
  );
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar reporte Excel', exact: true }).click();
  const download = await downloadPromise;
  const response = await exportResponse;
  expect(response.status()).toBe(200);
  expect(new URL(response.url()).searchParams.get('report')).toBe('inventory-alerts');
  expect(new URL(response.url()).searchParams.has('page')).toBe(false);
  expect(download.suggestedFilename()).toMatch(/\.xlsx$/);
  const stream = (await download.createReadStream())!;
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const bytes = Buffer.concat(chunks);
  expect(bytes.subarray(0, 4).toString('hex')).toBe('504b0304');
  expect(bytes.length).toBeGreaterThan(1000);
  for (const width of [320, 390, 768, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await expect(page.locator('main select')).toHaveCount(1);
    const content = await page.locator('main').boundingBox();
    expect(content?.width).toBeCloseTo(width, 0);
    const general = await page.locator('.general-report').boundingBox();
    expect(general?.width).toBeGreaterThan(width - 60);
    if (width >= 1440) {
      const figures = page.locator('.general-report figure');
      const bars = (await figures.nth(0).boundingBox())!;
      const donut = (await figures.nth(1).boundingBox())!;
      expect(Math.abs(bars.y - donut.y)).toBeLessThan(1);
      expect(donut.x).toBeGreaterThan(bars.x + bars.width);
    }
    if (width === 390 || width === 1440)
      await page.screenshot({
        path: 'test-results/dashboard-graph-' + width + '.png',
        fullPage: true,
        animations: 'disabled',
      });
  }
  expect(
    (await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa']).analyze())
      .violations,
  ).toEqual([]);
});

test('dashboard conserva datos no disponibles y acceso sin reportes', async ({ page }) => {
  await page.route('**/api/v1/analytics/overview/**', async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    data.indicadores.utilidad_estimada = null;
    data.utilidad_estimada_habilitada = false;
    await route.fulfill({ response, json: data });
  });
  await page.goto('/login');
  await login(page);
  const row = page.locator('bm-report-chart .chart-row').filter({ hasText: 'Utilidad estimada' });
  await expect(row).toContainText('No disponible');
  await expect(row).not.toContainText('S/ 0.00');
});

test('sin permisos de reportes se conserva la bienvenida', async ({ page }) => {
  await page.goto('/login');
  await login(page, 'limited');
  await expect(page.locator('bm-reports-page')).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'Reporte', exact: true })).toHaveCount(0);
});

for (const entry of [
  { role: 'clients' as const, report: 'top-clients' },
  { role: 'inventory' as const, report: 'inventory-alerts' },
]) {
  test('dashboard respeta el acceso exclusivo de ' + entry.role, async ({ page }) => {
    await page.goto('/login');
    await login(page, entry.role);
    const selection = page.getByRole('combobox', { name: 'Reporte', exact: true });
    await expect(selection.locator('option')).toHaveCount(1);
    await expect(selection).toHaveValue(entry.report);
    await expect(page.locator('bm-report-chart figure')).toHaveCount(2);
    await expect(page.locator('bm-report-chart figure').first()).toBeVisible();
    await expect(page.locator('.general-report')).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Exportar reporte Excel', exact: true }),
    ).toHaveCount(0);
  });
}
