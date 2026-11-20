import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { control, fixture, login } from './helpers';

test('cobrar una visita con cita recupera tratamiento, profesional y precio reservado', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await control(page.request, 'reset');
  await page.goto('/login');
  await login(page);
  await page.request.get('/api/auth/csrf/');
  const csrf = (await page.context().cookies()).find(
    (cookie) => cookie.name === 'csrftoken',
  )!.value;
  const changed = await page.request.patch(
    '/api/admin/catalogo/servicios/' + fixture.agenda.service + '/',
    {
      data: { precio_base: '125.00' },
      headers: {
        Origin: 'https://localhost:4443',
        'X-CSRFToken': csrf,
        'Idempotency-Key': randomUUID(),
      },
    },
  );
  expect(changed.ok()).toBe(true);
  await page.request.post('/api/public/checkin/' + fixture.finance.token + '/', {
    data: { telefono: '+51944123003' },
  });
  const visits = await (
    await page.request.get('/api/visitas/?estado=ABIERTA&clienta=' + fixture.agenda.clients[3])
  ).json();
  const visit = visits.results[0];
  expect(visit).toBeTruthy();
  await page.goto('/admin/visitas');
  await page
    .locator('[data-visit-id="' + visit.id + '"]')
    .getByRole('button', { name: 'Cobrar', exact: true })
    .click();
  const checkout = page.getByRole('dialog', { name: 'Cobrar', exact: true });
  await expect(checkout.getByTestId('sale-total')).toHaveText(/S\/\s*100\.00/);
  await expect(checkout.locator('bm-sale-editor')).toHaveCount(0);
  await expect(checkout.locator('bm-sale-detail')).toHaveCount(0);
  await expect(checkout.getByRole('button')).toHaveCount(2);
  await expect(checkout.getByText(/Agenda F6 E2E/)).toBeVisible();
  await expect(checkout.getByText(/Cantidad:.*1\.000/)).toContainText('30 min');
  const official = await (await page.request.get('/api/visitas/' + visit.id + '/')).json();
  const sale = await (await page.request.get('/api/ventas/' + official.venta_id + '/')).json();
  expect(sale.lineas).toHaveLength(1);
  expect(sale.lineas[0]).toMatchObject({
    servicio_id: fixture.agenda.service,
    profesional_id: fixture.agenda.professional,
    precio_unitario: '100.00',
  });
  expect(sale.estado).toBe('BORRADOR');
  await expect(page).toHaveURL(/\/admin\/visitas$/);
  for (const theme of ['light', 'dark']) {
    if (theme === 'dark')
      await page.evaluate(() => {
        document.documentElement.dataset['theme'] = 'dark';
      });
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect
        .poll(() => checkout.evaluate((el) => el.scrollWidth <= el.clientWidth))
        .toBe(true);
    }
    expect(
      (
        await new AxeBuilder({ page })
          .include('.cdk-overlay-container')
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.screenshot({ path: '.artifacts/checkout-summary-' + theme + '.png' });
  }
  await checkout.getByRole('button', { name: 'Cobrar', exact: true }).click();
  await expect(checkout.getByRole('heading', { name: 'Datos del pago recibido' })).toBeVisible();
  await expect(checkout.getByRole('button', { name: 'Cobrar', exact: true })).toBeDisabled();
  await checkout.getByLabel('Monto recibido (PEN)').fill('40.00');
  await checkout.getByLabel('Verifiqué los servicios').check();
  await checkout.getByRole('button', { name: 'Cobrar', exact: true }).click();
  await expect(
    checkout.getByRole('status').filter({ hasText: 'Cobro registrado correctamente' }),
  ).toBeVisible();
  await expect(checkout.getByTestId('sale-balance')).toHaveText(/S\/\s*60\.00/);
  await checkout.getByRole('button', { name: 'Cobrar', exact: true }).click();
  await checkout.getByLabel('Medio de pago').selectOption('YAPE');
  await checkout.getByLabel('Referencia de operación').fill('RESUMEN-' + randomUUID());
  await checkout.getByLabel('Verifiqué los servicios').check();
  await checkout.getByRole('button', { name: 'Cobrar', exact: true }).click();
  await expect(checkout.getByTestId('sale-balance')).toHaveText(/S\/\s*0\.00/);
  await expect(checkout.getByRole('button', { name: 'Cobrar', exact: true })).toHaveCount(0);
  const payments = await (await page.request.get('/api/pagos/?venta=' + sale.id)).json();
  expect(payments.results).toHaveLength(2);
});
