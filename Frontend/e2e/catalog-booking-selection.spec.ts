import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { control, fixture } from './helpers';

test('reservar desde una tarjeta mantiene el tratamiento sin pedir elegirlo de nuevo', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await control(page.request, 'reset');
  await control(page.request, 'booking-mode');
  await page.goto('/catalogo');
  const card = page
    .locator('.public-card')
    .filter({ has: page.getByRole('heading', { name: 'Servicio agenda F6 E2E', exact: true }) });
  await card.getByRole('link', { name: 'Reservar cita', exact: true }).click();
  await expect(page).toHaveURL(new RegExp('/reservar\\?servicio=' + fixture.agenda.service + '$'));
  await expect(page.locator('.chosen-treatment')).toContainText('Servicio agenda F6 E2E');
  await expect(page.locator('.service-option')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /Elige tus servicios/ })).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.chosen-treatment')).toContainText('Servicio agenda F6 E2E');
  await page
    .getByRole('combobox', { name: 'Profesional', exact: true })
    .selectOption(String(fixture.agenda.professional));
  await page.getByLabel('Fecha', { exact: true }).fill(fixture.agenda.date);
  await page.getByRole('button', { name: 'Ver horarios', exact: true }).click();
  await page.getByRole('button', { name: '16:00 – 16:30', exact: true }).click();
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
  }
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({ path: '.artifacts/catalog-selected-booking.png', fullPage: true });
  await page.getByLabel('Nombres', { exact: true }).fill('Reserva desde tarjeta');
  await page.getByLabel('Apellidos', { exact: true }).fill('Prueba');
  await page.getByLabel('Teléfono', { exact: true }).fill('+51977555331');
  await page.getByRole('checkbox', { name: /He leído y acepto/ }).check();
  await page.getByRole('button', { name: 'Enviar solicitud de reserva', exact: true }).click();
  await expect(page.getByLabel('Clave de gestión (8 cifras)')).toBeVisible();
  const requests = await (await page.request.get('/api/v1/public/reservas/solicitudes/')).json();
  expect(
    requests.results[0].servicios.map((service: { servicio_id: number }) => service.servicio_id),
  ).toEqual([fixture.agenda.service]);
  const csrf = (await page.context().cookies()).find(
    (cookie) => cookie.name === 'csrftoken',
  )!.value;
  const cancelled = await page.request.post(
    '/api/v1/public/reservas/solicitudes/' + requests.results[0].id + '/cancelar/',
    {
      data: { motivo: 'Fin del ensayo de reserva' },
      headers: {
        Origin: 'https://localhost:4443',
        'X-CSRFToken': csrf,
        'Idempotency-Key': randomUUID(),
      },
    },
  );
  expect(cancelled.ok()).toBe(true);
});

test('el enlace de un tratamiento no reservable informa el problema', async ({ page }) => {
  await control(page.request, 'reset');
  await control(page.request, 'booking-mode');
  await page.goto('/reservar?servicio=99999999');
  await expect(page.getByRole('alert')).toContainText('El tratamiento elegido no está disponible');
  await expect(page.locator('.chosen-treatment')).toHaveCount(0);
  await expect(page.locator('.service-option')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Ver tratamientos', exact: true })).toBeVisible();
});

test('la entrada directa a reservar tampoco muestra una lista de servicios', async ({ page }) => {
  await control(page.request, 'reset');
  await control(page.request, 'booking-mode');
  await page.goto('/reservar');
  await expect(page.getByRole('link', { name: 'Ver tratamientos', exact: true })).toBeVisible();
  await expect(page.locator('.service-option')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /Elige tus servicios/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Ver horarios', exact: true })).toHaveCount(0);
});
