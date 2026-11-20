import { test, expect, Locator } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { control, login } from './helpers';

test.beforeEach(async ({ request }) => control(request, 'reset'));

test('Ventas y pagos muestra ambos historiales completos con paginación independiente', async ({
  page,
}) => {
  await page.goto('/login');
  await login(page);
  await page.goto('/admin/ventas');
  async function alignedFilters() {
    await expect(
      page.locator('.sales-filter-fields select, .sales-filter-fields input:not(.calendar-anchor)'),
    ).toHaveCount(3);
    const bounds = await page
      .locator('.sales-filter-fields select, .sales-filter-fields input:not(.calendar-anchor)')
      .evaluateAll((fields) =>
        fields.map((field) => {
          const box = field.getBoundingClientRect();
          return { x: box.x, y: box.y, width: box.width, height: box.height };
        }),
      );
    expect(bounds).toHaveLength(3);
    expect(
      Math.max(...bounds.map((box) => box.y)) - Math.min(...bounds.map((box) => box.y)),
    ).toBeLessThan(1);
    expect(
      Math.max(...bounds.map((box) => box.height)) - Math.min(...bounds.map((box) => box.height)),
    ).toBeLessThan(1);
    expect(bounds[1].x).toBeGreaterThan(bounds[0].x + bounds[0].width);
    expect(bounds[2].x).toBeGreaterThan(bounds[1].x + bounds[1].width);
  }
  await alignedFilters();
  const sales = page.getByRole('region', { name: 'Ventas registradas', exact: true });
  const payments = page.getByRole('region', { name: 'Pagos registrados', exact: true });
  const expectedSales = await (await page.request.get('/api/ventas/?page_size=100')).json();
  const expectedPayments = await (await page.request.get('/api/pagos/?page_size=100')).json();
  expect(expectedSales.count).toBeGreaterThan(0);
  expect(expectedPayments.count).toBeGreaterThan(0);
  async function ids(section: Locator, endpoint: string) {
    const result: number[] = [];
    await expect(section.locator('.finance-history-row').first()).toBeVisible();
    for (;;) {
      result.push(
        ...(await section
          .locator('.finance-record-main > strong')
          .evaluateAll((elements) =>
            elements.map((element) => Number(element.textContent!.split('#')[1])),
          )),
      );
      const next = section.getByRole('button', { name: 'Siguiente', exact: true });
      if (await next.isDisabled()) break;
      const update = page.waitForResponse(
        (response) => new URL(response.url()).pathname === endpoint,
      );
      await next.click();
      await update;
      await expect(section.locator('bm-loading')).toHaveCount(0);
    }
    return result;
  }
  expect(await ids(sales, '/api/ventas/')).toEqual(
    expectedSales.results.map((row: { id: number }) => row.id),
  );
  expect(await ids(payments, '/api/pagos/')).toEqual(
    expectedPayments.results.map((row: { id: number }) => row.id),
  );
  const payment = expectedPayments.results[0];
  const row = payments.locator('.finance-history-row').filter({
    has: page.locator('.finance-record-main > strong', { hasText: 'Pago #' + payment.id }),
  });
  await expect(row).toContainText(payment.metodo);
  await expect(row).toContainText(payment.estado);
  await expect(row).toContainText('Venta #' + payment.venta_id);
  await page.getByLabel('Estado de venta', { exact: true }).selectOption('BORRADOR');
  await page.getByRole('button', { name: 'Filtrar ventas', exact: true }).click();
  await expect(sales.locator('bm-loading')).toHaveCount(0);
  await expect(payments.locator('.finance-history-row')).toHaveCount(
    expectedPayments.results.length,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await alignedFilters();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(
    (
      await new AxeBuilder({ page })
        .include('.finance-records')
        .withTags(['wcag2a', 'wcag2aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
  await row.click();
  await expect(page).toHaveURL(new RegExp('/admin/ventas/' + payment.venta_id + '$'));
});
