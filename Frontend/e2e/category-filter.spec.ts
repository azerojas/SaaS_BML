import { test, expect } from '@playwright/test';
import { control, login } from './helpers';

test.beforeEach(async ({ request }) => control(request, 'reset'));

test('categoría y proveedor permanecen visibles junto a los demás filtros', async ({ page }) => {
  await page.goto('/login');
  await login(page);
  for (const path of [
    '/admin/catalogo/servicios',
    '/admin/catalogo/articulos',
    '/admin/inventario',
    '/admin/compras',
  ]) {
    await page.setViewportSize({ width: 1680, height: 1000 });
    await page.goto(path);
    const filter = page.locator(
      '.filters bm-reference-picker select, .filters bm-supplier-picker select',
    );
    await expect(filter).toBeVisible();
    await expect(
      page.locator('summary').filter({ hasText: /Filtrar por categoría|Filtrar por proveedor/ }),
    ).toHaveCount(0);
    await expect.poll(() => filter.locator('option').count()).toBeGreaterThan(1);
    const value = (await filter.locator('option').nth(1).getAttribute('value'))!;
    const filtered = page.waitForResponse((response) => {
      const url = new URL(response.url());
      const endpoint =
        path === '/admin/compras'
          ? '/api/compras/'
          : path === '/admin/inventario'
            ? '/api/inventario/stock/'
            : '/api/admin/catalogo/';
      return (
        url.pathname.startsWith(endpoint) &&
        url.searchParams.get(path === '/admin/compras' ? 'proveedor' : 'categoria') === value
      );
    });
    await filter.selectOption(value);
    expect((await filtered).status()).toBe(200);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(filter).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await filter.selectOption('');
  }
});
