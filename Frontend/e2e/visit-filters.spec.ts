import { test, expect } from '@playwright/test';
import { control, login } from './helpers';

test('el rango de visitas se conserva al navegar, recargar y volver de otra aplicación', async ({
  page,
}) => {
  await control(page.request, 'reset');
  await page.goto('/login');
  await login(page);
  await page.goto('/admin/visitas');
  await page.getByRole('textbox', { name: 'Desde', exact: true }).fill('2026-01-01');
  await page.getByRole('textbox', { name: 'Hasta', exact: true }).fill('2026-01-31');
  await page.getByRole('button', { name: /^En atención/ }).click();
  await page.goto('/admin/ventas');
  await page.goto('/admin/visitas');
  await expect(page.getByRole('textbox', { name: 'Desde', exact: true })).toHaveValue('2026-01-01');
  await expect(page.getByRole('textbox', { name: 'Hasta', exact: true })).toHaveValue('2026-01-31');
  await expect(page.getByRole('button', { name: /^En atención/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Desde', exact: true })).toHaveValue('2026-01-01');
  const identity = page.waitForResponse((response) => response.url().endsWith('/api/auth/me/'));
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await identity;
  await expect(page.getByRole('textbox', { name: 'Hasta', exact: true })).toHaveValue('2026-01-31');
  await expect(page.getByRole('button', { name: /^En atención/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});
