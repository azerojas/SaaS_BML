import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { control, fixture, login } from './helpers';

test('gestionar atención abre modal, guarda notas y conserva el tablero de visitas', async ({
  page,
}) => {
  await control(page.request, 'reset');
  await page.goto('/login');
  await login(page);
  await page.request.post('/api/public/checkin/' + fixture.finance.token + '/', {
    data: { telefono: fixture.finance.phone },
  });
  const response = await page.request.get('/api/visitas/', {
    params: { estado: 'ABIERTA', clienta: fixture.finance.client },
  });
  const visit = (await response.json()).results[0];
  expect(visit).toBeTruthy();
  await page.goto('/admin/visitas');
  const url = page.url();
  const row = page.locator('[data-visit-id="' + visit.id + '"]');
  await row.getByRole('button', { name: 'Gestionar atención y cobro', exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'Atención y cobro', exact: true });
  await expect(modal).toBeVisible();
  await expect(page).toHaveURL(url);
  await expect(
    modal.getByRole('heading', { name: 'Tratamientos y cobro', exact: true }),
  ).toBeVisible();
  await expect(
    modal.getByRole('link', { name: 'Preparar tratamientos y venta', exact: true }),
  ).toBeVisible();
  await expect(modal.getByText(/^Visita abierta/)).toBeVisible();
  await modal
    .getByLabel('Notas de atención', { exact: true })
    .fill('Seguimiento de la atención desde el modal.');
  await modal.getByRole('button', { name: 'Guardar notas', exact: true }).click();
  await expect(modal.getByRole('status').filter({ hasText: 'Notas guardadas' })).toBeVisible();
  expect((await (await page.request.get('/api/visitas/' + visit.id + '/')).json()).notas).toBe(
    'Seguimiento de la atención desde el modal.',
  );
  for (const width of [320, 390, 440, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(await modal.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    (
      await new AxeBuilder({ page })
        .include('.cdk-overlay-container')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
  await modal.locator('mat-dialog-content').evaluate((el) => (el.scrollTop = 0));
  await page.screenshot({ path: '.artifacts/visit-detail-modal-mobile.png' });
  await modal.getByRole('button', { name: 'Cerrar atención y cobro', exact: true }).click();
  await expect(modal).toHaveCount(0);
  await expect(page).toHaveURL(url);
  await row.getByRole('button', { name: 'Gestionar atención y cobro', exact: true }).click();
  await expect(modal.getByLabel('Notas de atención', { exact: true })).toHaveValue(
    'Seguimiento de la atención desde el modal.',
  );
  await modal.getByRole('link', { name: 'Preparar tratamientos y venta', exact: true }).click();
  await expect(page).toHaveURL(new RegExp('/admin/ventas/nueva\\?visita=' + visit.id));
  await expect(modal).toHaveCount(0);
});
