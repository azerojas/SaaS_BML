import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { control, login } from './helpers';

test.use({ hasTouch: true, isMobile: true });
test.beforeEach(async ({ request }) => control(request, 'reset'));

test('las pantallas principales caben en teléfonos pequeños y grandes', async ({ page }) => {
  test.setTimeout(90000);
  await page.goto('/login');
  await login(page);
  for (const width of [320, 440]) {
    await page.setViewportSize({ width, height: 844 });
    for (const path of [
      'clientas',
      'catalogo/articulos',
      'inventario',
      'compras',
      'proveedores',
      'visitas',
      'agenda',
    ]) {
      await page.goto('/admin/' + path);
      await expect(page.getByRole('button', { name: 'Abrir menú de navegación' })).toBeVisible();
      await expect(page.locator('main h1').first()).toBeVisible();
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth), {
          message: path + ' a ' + width + 'px',
        })
        .toBeLessThanOrEqual(1);
    }
  }
});

test('navegación vertical en teléfonos, horizontal en tabletas y escritorio', async ({ page }) => {
  test.setTimeout(90000);
  await page.goto('/login');
  await login(page);
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 375, height: 667 },
    { width: 390, height: 844 },
    { width: 414, height: 896 },
    { width: 430, height: 932 },
    { width: 440, height: 956 },
    { width: 844, height: 390 },
    { width: 956, height: 440 },
  ]) {
    await page.setViewportSize(viewport);
    const trigger = page.getByRole('button', { name: 'Abrir menú de navegación' });
    await expect(trigger).toBeVisible();
    await trigger.click();
    const menu = page.getByRole('dialog', { name: 'Menú de navegación' });
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('button', { name: 'Cerrar menú de navegación' })).toBeFocused();
    await expect(menu.getByRole('link', { name: 'Inicio', exact: true })).toBeVisible();
    const rows = await menu.locator('.mobile-home, summary').evaluateAll((elements) =>
      elements.map((el) => {
        const rect = el.getBoundingClientRect();
        return { x: rect.x, y: rect.y, height: rect.height };
      }),
    );
    rows.forEach((row, index) => {
      expect(row.height).toBeGreaterThanOrEqual(44);
      if (index) expect(row.y).toBeGreaterThanOrEqual(rows[index - 1].y + rows[index - 1].height);
    });
    expect(await menu.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    if (viewport.width === 390) {
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await page.screenshot({ path: '.artifacts/mobile-navigation.png' });
    }
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(trigger).toBeFocused();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Abrir menú de navegación' }).click();
  const menu = page.getByRole('dialog', { name: 'Menú de navegación' });
  await menu.locator('summary').filter({ hasText: 'Inventario' }).click();
  await menu.getByRole('link', { name: 'Proveedores', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/proveedores$/);
  await expect(menu).toHaveCount(0);
  await page.getByRole('button', { name: 'Abrir menú de navegación' }).click();
  await expect(menu).toBeVisible();
  await page.setViewportSize({ width: 768, height: 1024 });
  await expect(menu).toHaveCount(0);
  for (const width of [768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1024 });
    await expect(page.getByRole('button', { name: 'Abrir menú de navegación' })).toHaveCount(0);
    const nav = page.getByRole('navigation', { name: 'Navegación principal' });
    await expect(nav).toHaveCount(1);
    await expect(nav).toBeVisible();
    await expect(nav).toHaveCSS('flex-direction', 'row');
  }
});
