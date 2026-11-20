import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { control, fixture, login } from './helpers';

test.beforeEach(async ({ request }) => control(request, 'reset'));

test('la creación se concentra en Compras y guarda desde el modal sin cambiar existencias', async ({
  page,
}) => {
  await page.goto('/login');
  await login(page);
  await page.goto('/admin/inventario');
  await expect(page.getByRole('button', { name: 'Compra', exact: true })).toHaveCount(0);
  await page
    .getByRole('navigation', { name: 'Operación de inventario', exact: true })
    .getByRole('link', { name: 'Compras', exact: true })
    .click();
  await expect(page).toHaveURL(/\/admin\/compras$/);
  const url = page.url();
  const stockUrl =
    '/api/inventario/stock/?articulo=' + fixture.inventory.articles[0] + '&activo=all';
  const before = await (await page.request.get(stockUrl)).json();
  const open = page.getByRole('button', { name: 'Compra', exact: true });
  await expect(open.locator('bm-icon')).toBeVisible();
  const iconBounds = (await open.locator('bm-icon').boundingBox())!;
  const textBounds = (await open.locator('.purchase-trigger-content > span').boundingBox())!;
  expect(
    Math.abs(iconBounds.y + iconBounds.height / 2 - textBounds.y - textBounds.height / 2),
  ).toBeLessThan(1);
  await expect(page.getByRole('link', { name: 'Preparar una compra' })).toHaveCount(0);
  await open.click();
  const modal = page.getByRole('dialog');
  await expect(modal.getByRole('heading', { name: 'Nueva compra', exact: true })).toBeVisible();
  await modal.getByRole('button', { name: 'Guardar borrador', exact: true }).click();
  await expect(modal.getByText('Selecciona un artículo.', { exact: true })).toBeVisible();
  await expect(modal.getByRole('link', { name: 'Volver a compras' })).toHaveCount(0);
  await modal.locator('#field-numero_documento').fill('COMPRA-MODAL-REPOSICION');
  await expect(
    modal.locator('#purchase-supplier option').filter({ hasText: 'Proveedor base E2E' }),
  ).toHaveCount(1);
  await modal.locator('#purchase-supplier').selectOption(String(fixture.inventory.supplier));
  await expect(
    modal.locator('#purchase-article-0 option').filter({ hasText: 'ZZ insumo E2E 00' }),
  ).toHaveCount(1);
  await modal.locator('#purchase-article-0').selectOption(String(fixture.inventory.articles[0]));
  await modal.locator('#purchase-quantity-0').fill('2.125');
  await modal.locator('#purchase-cost-0').fill('3.2500');
  await expect(
    modal
      .locator('mat-dialog-actions')
      .getByRole('button', { name: 'Guardar borrador', exact: true }),
  ).toBeVisible();
  await expect(modal.locator('mat-dialog-actions')).toContainText('Total estimado');
  await modal.locator('mat-dialog-content').evaluate((element) => {
    element.scrollTop = 0;
  });
  await page.screenshot({
    path: 'test-results/purchase-modal-desktop.png',
    animations: 'disabled',
  });
  await modal.getByRole('button', { name: 'Guardar borrador', exact: true }).click();
  await expect(modal).toHaveCount(0);
  await expect(page).toHaveURL(url);
  await expect(
    page.locator('.purchase-row').filter({ hasText: 'COMPRA-MODAL-REPOSICION' }),
  ).toBeVisible();
  const purchases = await (
    await page.request.get('/api/compras/?search=COMPRA-MODAL-REPOSICION')
  ).json();
  expect(purchases.count).toBe(1);
  expect(purchases.results[0].estado).toBe('BORRADOR');
  const saved = await (
    await page.request.get('/api/compras/' + purchases.results[0].id + '/')
  ).json();
  expect(saved.detalles[0].cantidad).toBe('2.125');
  expect(saved.proveedor_id).toBe(fixture.inventory.supplier);
  const listUrl = page.url();
  await page.getByRole('button', { name: 'Visualizar compra ' + saved.id, exact: true }).click();
  const details = page.getByRole('dialog');
  await expect(
    details.getByRole('heading', { name: 'Detalle de compra', exact: true }),
  ).toBeVisible();
  await expect(details).toContainText('COMPRA-MODAL-REPOSICION');
  await expect(details).toContainText('ZZ insumo E2E 00');
  await page.screenshot({ path: '.artifacts/purchase-preview.png', animations: 'disabled' });
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
  await page.screenshot({ path: '.artifacts/purchase-preview-mobile.png', animations: 'disabled' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page).toHaveURL(listUrl);
  await details.getByRole('button', { name: 'Cerrar compra', exact: true }).click();
  await expect(details).toHaveCount(0);
  const after = await (await page.request.get(stockUrl)).json();
  expect(after.results[0].existencia).toBe(before.results[0].existencia);
  await page.setViewportSize({ width: 390, height: 844 });
  await open.click();
  await modal.locator('#field-numero_documento').fill('Sin guardar');
  await page.screenshot({ path: 'test-results/purchase-modal-mobile.png', animations: 'disabled' });
  page.once('dialog', (dialog) => dialog.dismiss());
  await modal.getByRole('button', { name: 'Cerrar compra', exact: true }).click();
  await expect(modal).toBeVisible();
  expect(await modal.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  expect(
    (
      await new AxeBuilder({ page })
        .include('.cdk-overlay-container')
        .withTags(['wcag2a', 'wcag2aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
  page.once('dialog', (dialog) => dialog.accept());
  await modal.press('Escape');
  await expect(modal).toHaveCount(0);
  await expect(page).toHaveURL(url);
});
