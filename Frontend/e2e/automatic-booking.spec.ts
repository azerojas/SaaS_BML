import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { control, fixture, login } from './helpers';

test('reservar confirma la cita, ocupa el calendario y retira únicamente ese horario', async ({
  page,
  browser,
}) => {
  test.setTimeout(60_000);
  await control(page.request, 'reset');
  await control(page.request, 'booking-mode');
  await control(page.request, 'automatic-booking-mode');
  await control(page.request, 'specialist-mode');
  await page.goto('/login');
  await login(page);
  const day = new Date(Date.parse(fixture.agenda.date + 'T12:00:00Z') + 86400000)
    .toISOString()
    .slice(0, 10);
  await page.request.get('/api/auth/csrf/');
  const csrf = (await page.context().cookies()).find(
    (cookie) => cookie.name === 'csrftoken',
  )!.value;
  const published = await page.request.post('/api/v1/agenda/disponibilidad-diaria/', {
    data: {
      profesional_id: fixture.agenda.professional,
      fecha: day,
      franjas: [
        { inicio: '10:00', fin: '11:00', cupo_unico: true },
        { inicio: '11:00', fin: '12:00', cupo_unico: true },
      ],
    },
    headers: {
      'X-CSRFToken': csrf,
      'X-Beauty-Contract': '1',
      'Idempotency-Key': randomUUID(),
      Origin: 'https://localhost:4443',
    },
  });
  expect(published.ok(), await published.text()).toBe(true);
  await page.goto('/admin/agenda');
  await page.getByRole('button', { name: 'Calendario del equipo', exact: true }).click();
  await page.getByLabel('Fecha del calendario', { exact: true }).fill(day);
  await page.getByRole('button', { name: 'Día', exact: true }).click();
  const context = await browser.newContext({ ignoreHTTPSErrors: true, serviceWorkers: 'block' });
  try {
    const guest = await context.newPage();
    async function slots() {
      await guest.goto('https://localhost:4443/reservar?servicio=' + fixture.agenda.service);
      await guest
        .getByRole('combobox', { name: 'Profesional', exact: true })
        .selectOption(String(fixture.agenda.professional));
      await guest.getByLabel('Fecha', { exact: true }).fill(day);
      await guest.getByRole('button', { name: 'Ver horarios', exact: true }).click();
    }
    await slots();
    await guest.getByRole('button', { name: '10:00', exact: true }).click();
    await guest.getByLabel('Nombres', { exact: true }).fill('Reserva automática');
    await guest.getByLabel('Apellidos', { exact: true }).fill('Prueba');
    await guest.getByLabel('Teléfono', { exact: true }).fill('+51977123881');
    await guest.getByRole('checkbox', { name: /He leído y acepto/ }).check();
    await guest.getByRole('button', { name: 'Confirmar mi cita', exact: true }).click();
    await expect(
      guest.getByRole('heading', { name: 'Reserva confirmada', exact: true }),
    ).toBeVisible();
    await expect(guest.getByText('Pendiente de confirmación', { exact: true })).toHaveCount(0);
    await expect(guest.getByLabel('Clave de gestión (8 cifras)')).toBeVisible();
    const result = (
      await (
        await guest.request.get('https://localhost:4443/api/v1/public/reservas/solicitudes/')
      ).json()
    ).results[0];
    expect(result.estado).toBe('CONFIRMADA');
    expect(result.cita_id).not.toBeNull();
    expect(result.expira_en).toBeNull();
    await slots();
    await expect(guest.getByRole('button', { name: '10:00', exact: true })).toHaveCount(0);
    await expect(guest.getByRole('button', { name: '11:00', exact: true })).toBeVisible();
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    const appointment = page
      .locator('.calendar-event')
      .filter({ hasText: 'Reserva automática Prueba' });
    await expect(appointment).toHaveCount(1);
    await expect(appointment).toHaveAttribute('data-state', 'CONFIRMADA');
    await expect(appointment).toHaveAttribute(
      'data-professional-id',
      String(fixture.agenda.professional),
    );
    await expect(page.locator('.pending-request')).toHaveCount(0);
    await appointment.scrollIntoViewIfNeeded();
    await page.screenshot({ path: '.artifacts/automatic-booking-calendar.png', fullPage: true });
  } finally {
    await context.close();
  }
});
