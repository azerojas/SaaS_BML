import { test, expect } from '@playwright/test';
import { control, login } from './helpers';
import AxeBuilder from '@axe-core/playwright';

test.beforeEach(async ({ request }) => control(request, 'reset'));

test('Compras reúne reposición al final con todos los agotados y sin pestaña independiente', async ({
  page,
}) => {
  await page.goto('/login');
  await login(page);
  await page.goto('/admin/inventario/alertas');
  await expect(page).toHaveURL(/\/admin\/compras$/);
  await expect(
    page
      .getByRole('navigation', { name: 'Operación de inventario' })
      .getByRole('link', { name: 'Reposición', exact: true }),
  ).toHaveCount(0);
  const purchases = page.getByRole('region', { name: 'Compras registradas', exact: true });
  const replenishment = page.getByRole('region', { name: 'Reposición', exact: true });
  await expect(replenishment.locator('.stock-list-row')).toHaveCount(20);
  const firstId = await replenishment
    .locator('.stock-list-row')
    .first()
    .getAttribute('data-article-id');
  const listUrl = page.url();
  await replenishment
    .getByRole('button', { name: /^Visualizar artículo/ })
    .first()
    .click();
  await expect(page.getByRole('dialog')).toContainText('Existencia actual');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(
    (
      await new AxeBuilder({ page })
        .include('.cdk-overlay-container')
        .withTags(['wcag2a', 'wcag2aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.screenshot({ path: '.artifacts/restock-preview-mobile.png', animations: 'disabled' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page).toHaveURL(listUrl);
  await page.getByRole('dialog').getByRole('button', { name: 'Comprar', exact: true }).click();
  await expect(page.getByRole('dialog').locator('#purchase-article-0')).toHaveValue(firstId!);
  await page.getByRole('button', { name: 'Cerrar compra', exact: true }).click();
  const expected = await (
    await page.request.get('/api/inventario/stock/?activo=true&agotados=true&page_size=100')
  ).json();
  expect(expected.results.every((row: { existencia: string }) => Number(row.existencia) <= 0)).toBe(
    true,
  );
  const listed: number[] = [];
  for (;;) {
    listed.push(
      ...(await replenishment
        .locator('.stock-list-row')
        .evaluateAll((rows) => rows.map((row) => Number(row.getAttribute('data-article-id'))))),
    );
    const next = replenishment.getByRole('button', { name: 'Siguiente', exact: true });
    if (await next.isDisabled()) break;
    const update = page.waitForResponse(
      (response) =>
        response.url().includes('/api/inventario/stock/') &&
        new URL(response.url()).searchParams.get('agotados') === 'true',
    );
    await next.click();
    await update;
    await expect(replenishment.locator('bm-loading')).toHaveCount(0);
  }
  expect(listed.sort((a, b) => a - b)).toEqual(
    expected.results
      .map((row: { articulo_id: number }) => row.articulo_id)
      .sort((a: number, b: number) => a - b),
  );
  await expect(replenishment).not.toContainText('Insumo bajo F5');
  expect((await replenishment.boundingBox())!.y).toBeGreaterThan(
    (await purchases.boundingBox())!.y + (await purchases.boundingBox())!.height,
  );
  await page.getByLabel('Buscar por documento', { exact: true }).fill('sin-compra-asociada');
  await expect(purchases.locator('.purchase-row')).toHaveCount(0);
  await expect(replenishment.locator('.stock-list-row')).not.toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
