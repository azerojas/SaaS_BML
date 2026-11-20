import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { control, login } from './helpers';

test.beforeEach(async ({ request }) => control(request, 'reset'));

test('existencias usa filas compactas y legibles en computadora y celular', async ({ page }) => {
  await page.goto('/login');
  await login(page);
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/admin/inventario');
    await expect(page.locator('#stock-search, #stock-type, #stock-active')).toHaveCount(0);
    await expect(page.getByLabel('Situación de stock', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Categoría de artículo', { exact: true })).toBeVisible();
    const list = page.getByRole('list', { name: 'Existencias', exact: true });
    await expect(list.getByRole('listitem')).toHaveCount(20);
    await expect(page.locator('bm-stock-cards')).toHaveCount(0);
    const first = list.locator('.stock-list-row').first();
    const bounds = (await first.boundingBox())!;
    expect(bounds.height).toBeLessThan(width > 1100 ? 110 : 220);
    await expect(first).toContainText(/Mínimo/);
    await expect(first).toContainText(/Costo unitario estimado/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    if (width === 1440 || width === 390) {
      expect(
        (
          await new AxeBuilder({ page })
            .include('bm-stock-rows')
            .withTags(['wcag2a', 'wcag2aa'])
            .analyze()
        ).violations,
      ).toEqual([]);
      await page.screenshot({ path: 'test-results/stock-list-' + width + '.png', fullPage: true });
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(
    page.getByRole('button', { name: 'Actualizar inventario', exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Registrar ajuste', exact: true })).toHaveCount(0);
  const row = page.locator('.stock-list-row').first();
  const id = await row.getAttribute('data-article-id');
  await row.getByRole('button', { name: /^Editar artículo/ }).click();
  const editor = page.getByRole('dialog');
  await expect(editor.locator('#field-stock_minimo')).toBeVisible();
  await editor.locator('#field-stock_minimo').fill('2.000');
  await editor.getByRole('button', { name: 'Guardar artículo', exact: true }).click();
  await expect(editor).toHaveCount(0);
  const edited = page.locator('.stock-list-row[data-article-id="' + id + '"]');
  await edited.getByRole('button', { name: /^Eliminar artículo/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Eliminar', exact: true }).click();
  await expect(edited).toHaveCount(0);
  expect(
    (await (await page.request.get('/api/admin/catalogo/articulos/' + id + '/')).json()).activo,
  ).toBe(false);
});
