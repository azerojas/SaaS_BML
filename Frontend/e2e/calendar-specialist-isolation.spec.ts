import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { control, fixture, login } from './helpers';

test('una cita ocupa solo la columna de su especialista en día, semana y móvil', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await control(page.request, 'reset');
  await control(page.request, 'specialist-mode');
  await page.goto('/login');
  await login(page);
  await page.request.get('/api/auth/csrf/');
  const csrf = (await page.context().cookies()).find(
    (cookie) => cookie.name === 'csrftoken',
  )!.value;
  async function post(path: string, data: unknown) {
    const response = await page.request.post('/api/v1/agenda/' + path, {
      data,
      headers: {
        'X-CSRFToken': csrf,
        'X-Beauty-Contract': '1',
        'Idempotency-Key': randomUUID(),
        Origin: 'https://localhost:4443',
      },
    });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  }
  const second = (await post('profesionales/', { nombres: 'Segunda', apellidos: 'Aislada E2E' }))
    .profesional_id;
  const third = (await post('profesionales/', { nombres: 'Tercera', apellidos: 'Aislada E2E' }))
    .profesional_id;
  for (const identifier of [fixture.agenda.professional, second, third]) {
    await post('disponibilidad-diaria/', {
      profesional_id: identifier,
      fecha: fixture.agenda.date,
      franjas: Array.from({ length: 8 }, (_, index) => ({
        inicio: String(index + 9).padStart(2, '0') + ':00',
        fin: String(index + 10).padStart(2, '0') + ':00',
        cupo_unico: true,
      })),
    });
  }
  await page.goto('/admin/agenda');
  await page.getByRole('button', { name: 'Calendario del equipo', exact: true }).click();
  await page.getByLabel('Fecha del calendario', { exact: true }).fill(fixture.agenda.date);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const view of ['Día', 'Semana']) {
      await page.getByRole('button', { name: view, exact: true }).click();
      const event = page.locator('.calendar-event').filter({ hasText: 'Agenda F6 0 E2E' });
      await expect(event).toHaveCount(1);
      await expect(event).toHaveAttribute(
        'data-professional-id',
        String(fixture.agenda.professional),
      );
      const other = page
        .locator(`.working-band[data-professional-id="${second}"]`)
        .filter({ hasText: '10:00' });
      await expect(other).toHaveCount(1);
      await expect
        .poll(async () => {
          const appointment = (await event.boundingBox())!;
          const otherSlot = (await other.boundingBox())!;
          return (
            appointment.x + appointment.width <= otherSlot.x + 1 ||
            otherSlot.x + otherSlot.width <= appointment.x + 1
          );
        })
        .toBe(true);
    }
  }
});
