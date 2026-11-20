import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { control, fixture, login } from './helpers';

test('ficha en modal y visita sin servicio no inventa una venta', async ({ page }) => {
  await control(page.request, 'reset');
  await page.goto('/login');
  await login(page);
  await page.request.post('/api/public/checkin/' + fixture.finance.token + '/', {
    data: { telefono: fixture.finance.phone },
  });
  const visits = await (
    await page.request.get('/api/visitas/?estado=ABIERTA&clienta=' + fixture.finance.client)
  ).json();
  const visit = visits.results[0];
  await page.goto('/admin/visitas');
  const row = page.locator('[data-visit-id="' + visit.id + '"]');
  await row.getByRole('button', { name: 'Ficha de la clienta', exact: true }).click();
  const profile = page.getByRole('dialog', { name: 'Ficha de la clienta', exact: true });
  await expect(
    profile.getByRole('link', { name: fixture.finance.phone, exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/visitas$/);
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(() => profile.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  }
  expect(
    (
      await new AxeBuilder({ page })
        .include('.cdk-overlay-container')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
  await profile.getByRole('button', { name: 'Cerrar ficha de la clienta', exact: true }).click();
  await expect(profile).toHaveCount(0);
  await expect(row.getByRole('button', { name: 'Ficha de la clienta', exact: true })).toBeFocused();
  await row.getByRole('button', { name: 'Cobrar', exact: true }).click();
  const checkout = page.getByRole('dialog', { name: 'Cobrar', exact: true });
  await expect(
    checkout.getByText(
      'No hay servicios registrados para cobrar en esta visita. Primero registra su atención.',
    ),
  ).toBeVisible();
  await expect(checkout.locator('bm-sale-editor')).toHaveCount(0);
  await checkout.getByRole('button', { name: 'Cerrar cobro', exact: true }).click();
  const official = await (await page.request.get('/api/visitas/' + visit.id + '/')).json();
  expect(official.venta_id).toBeNull();
});
