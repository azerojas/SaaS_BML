import { test, expect } from '@playwright/test';

test('catálogo tiene un único filtro en computadora y móvil', async ({ page }) => {
  for (const width of [320, 360, 390, 650, 651, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/catalogo');
    const category = page.getByRole('combobox', { name: 'Categoría', exact: true });
    await expect(page.locator('.catalog-filters input')).toHaveCount(0);
    await expect(page.locator('.catalog-filters select')).toHaveCount(1);
    await expect(category).toBeVisible();
    await expect(page.locator('.public-card').first()).toBeVisible();
    const columns = await page
      .locator('.public-grid')
      .evaluate((grid) => getComputedStyle(grid).gridTemplateColumns.split(' ').length);
    expect(columns).toBe(width <= 650 ? 1 : width <= 1000 ? 2 : 3);
    const categoryBox = (await category.boundingBox())!;
    const tabs = (await page.locator('.public-toolbar .feature-tabs').boundingBox())!;
    expect(tabs.y + tabs.height).toBeLessThan(categoryBox.y);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    if (width === 320) {
      await expect.poll(() => category.locator('option').count()).toBeGreaterThan(1);
      const value = (await category.locator('option').nth(1).getAttribute('value'))!;
      const filtered = page.waitForResponse(
        (response) =>
          response.url().includes('/api/catalogo/servicios/') &&
          new URL(response.url()).searchParams.get('categoria') === value,
      );
      await category.selectOption(value);
      expect((await filtered).status()).toBe(200);
    }
    await page.getByRole('button', { name: 'Productos', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Productos', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await category.selectOption('');
    await expect(page.locator('.public-card').first()).toBeVisible();
    if (width === 1440)
      await page.screenshot({ path: 'test-results/catalog-desktop.png', fullPage: true });
    if (width === 320)
      await page.screenshot({ path: 'test-results/catalog-mobile.png', fullPage: true });
  }
});
