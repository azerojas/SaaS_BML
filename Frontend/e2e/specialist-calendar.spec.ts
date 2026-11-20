import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { control, fixture, login } from './helpers';
import { randomUUID } from 'node:crypto';

test.beforeEach(async ({ request }) => control(request, 'reset'));

test('la especialista publica tres cupos y una reserva web ocupa solamente uno', async ({
  page,
  browser,
}) => {
  await control(page.request, 'booking-mode');
  await control(page.request, 'specialist-mode');
  await page.goto('/login');
  await login(page, 'specialist');
  const day = new Date(Date.parse(fixture.agenda.date + 'T12:00:00Z') + 86400000)
    .toISOString()
    .slice(0, 10);
  await page.getByLabel('Fecha del calendario', { exact: true }).fill(day);
  await page.locator('.view-switcher button[aria-pressed="true"]').click();
  await page
    .getByRole('button', { name: /^Configurar horario del / })
    .first()
    .click();
  const editor = page.getByRole('dialog', { name: 'Publicar mis cupos', exact: true });
  for (const time of ['16:00', '17:00', '18:00'])
    await editor.getByRole('button', { name: new RegExp('^' + time) }).click();
  await expect(editor.locator('.interval-card')).toHaveCount(3);
  await editor.getByRole('button', { name: 'Guardar disponibilidad', exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect(page.locator('.working-band')).toHaveCount(3);
  const admin = await browser.newContext({
    baseURL: 'https://localhost:4443',
    ignoreHTTPSErrors: true,
  });
  try {
    const overview = await admin.newPage();
    await overview.goto('/login');
    await login(overview);
    await overview.goto('/admin/agenda');
    await overview.getByRole('button', { name: 'Calendario del equipo', exact: true }).click();
    await overview.getByLabel('Fecha del calendario', { exact: true }).fill(day);
    await overview.getByRole('button', { name: 'Semana', exact: true }).click();
    await expect(overview.getByRole('button', { name: 'Semana', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(
      overview.locator('.working-band').filter({ hasText: 'Una reserva por cupo' }),
    ).toHaveCount(3);
  } finally {
    await admin.close();
  }
  const customer = await browser.newContext({
    baseURL: 'https://localhost:4443',
    ignoreHTTPSErrors: true,
  });
  try {
    const guest = await customer.newPage();
    await guest.goto('/reservar?servicio=' + fixture.agenda.service);
    await expect(guest.getByRole('checkbox', { name: /Servicio agenda F6 E2E/ })).toBeChecked();
    await guest
      .getByRole('combobox', { name: 'Profesional', exact: true })
      .selectOption(String(fixture.agenda.professional));
    await guest.getByLabel('Fecha', { exact: true }).fill(day);
    await guest.getByRole('button', { name: 'Ver horarios', exact: true }).click();
    for (const time of ['16:00', '17:00', '18:00'])
      await expect(
        guest.getByRole('button', { name: time + ' – ' + time.slice(0, 2) + ':30', exact: true }),
      ).toBeVisible();
    await expect(guest.getByRole('button', { name: '16:15 – 16:45', exact: true })).toHaveCount(0);
    await guest.getByRole('button', { name: '16:00 – 16:30', exact: true }).click();
    await guest.getByLabel('Nombres', { exact: true }).fill('Clienta');
    await guest.getByLabel('Apellidos', { exact: true }).fill('Cupo de prueba');
    await guest.getByLabel('Teléfono', { exact: true }).fill('+51977123991');
    await guest.getByRole('checkbox', { name: /He leído y acepto/ }).check();
    await guest.getByRole('button', { name: 'Enviar solicitud de reserva', exact: true }).click();
    await expect(
      guest.getByText('Solicitud recibida. Falta la confirmación del salón.', { exact: true }),
    ).toBeVisible();
    await page.locator('.view-switcher button[aria-pressed="true"]').click();
    await expect(page.locator('.working-band')).toHaveCount(2);
    await expect(page.getByText('Cupo ocupado', { exact: true })).toHaveCount(0);
    const slots = await guest.request.get('/api/v1/public/agenda/disponibilidad/', {
      params: {
        fecha: day,
        profesional_id: fixture.agenda.professional,
        servicios: String(fixture.agenda.service),
      },
    });
    expect(
      (await slots.json()).slots.map((slot: { inicio_en: string }) => slot.inicio_en.slice(11, 16)),
    ).toEqual(['17:00', '18:00']);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(
      (await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa']).analyze())
        .violations,
    ).toEqual([]);
    // Release this test's hold through the customer's supported cancellation flow.
    const requests = await guest.request.get('/api/v1/public/reservas/solicitudes/');
    const id = (await requests.json()).results.find((row: { inicio_en: string }) =>
      row.inicio_en.startsWith(day),
    ).id;
    const csrf = (await customer.cookies()).find((cookie) => cookie.name === 'csrftoken')!.value;
    const cancelled = await guest.request.post(
      '/api/v1/public/reservas/solicitudes/' + id + '/cancelar/',
      {
        data: { motivo: 'Fin de prueba de cupos individuales' },
        headers: {
          'X-CSRFToken': csrf,
          'Idempotency-Key': randomUUID(),
          Origin: 'https://localhost:4443',
        },
      },
    );
    expect(cancelled.status()).toBe(200);
  } finally {
    await customer.close();
  }
});

test('cada especialista entra en su agenda y no puede consultar otra ni finanzas', async ({
  page,
}) => {
  await page.goto('/login');
  await login(page, 'specialist');
  await expect(page).toHaveURL(/\/admin\/agenda$/);
  await expect(page.getByRole('heading', { name: 'Mi agenda', exact: false })).toBeVisible();
  await expect(page.getByLabel('Filtrar por especialista')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Más opciones', exact: true })).toHaveCount(0);
  const response = await page.request.get('/api/v1/agenda/citas/', {
    headers: { 'X-Beauty-Contract': '1' },
  });
  expect(response.status()).toBe(200);
  const rows = (await response.json()).results;
  expect(rows.length).toBeGreaterThan(0);
  expect(
    rows.every(
      (row: { profesional_id: number }) => row.profesional_id === fixture.agenda.professional,
    ),
  ).toBe(true);
  const foreign = await page.request.get('/api/v1/agenda/profesionales/', {
    headers: { 'X-Beauty-Contract': '1' },
  });
  expect((await foreign.json()).results.map((row: { id: number }) => row.id)).toEqual([
    fixture.agenda.professional,
  ]);
  await page.getByLabel('Fecha del calendario', { exact: true }).fill(fixture.agenda.date);
  await page.locator('.view-switcher button[aria-pressed="true"]').click();
  const appointment = page.getByRole('link', {
    name: new RegExp('^Cita #' + fixture.agenda.appointment + ' ·'),
  });
  await expect(appointment).toBeVisible();
  for (const event of await page.locator('.calendar-event').all()) {
    await expect(event).toHaveAttribute(
      'data-professional-id',
      String(fixture.agenda.professional),
    );
  }
  await appointment.click();
  await expect(page.getByRole('dialog', { name: 'Detalle de cita', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cambiar horario', exact: true })).toHaveCount(0);
  expect(
    (await page.request.get('/api/ventas/', { headers: { 'X-Beauty-Contract': '1' } })).status(),
  ).toBe(403);
});

test('el administrador ve nombres y columnas por especialista y puede filtrar sin perder el día', async ({
  page,
}) => {
  await page.goto('/login');
  await login(page);
  await page.goto('/admin/agenda');
  await page.getByRole('button', { name: 'Calendario del equipo', exact: true }).click();
  await page.getByLabel('Fecha del calendario', { exact: true }).fill(fixture.agenda.date);
  await page.locator('.view-switcher button[aria-pressed="true"]').click();
  const filter = page.getByLabel('Filtrar por especialista');
  await expect(filter.locator('option')).not.toHaveCount(1);
  await expect(page.locator('.specialist-avatar').first()).toBeVisible();
  await page.screenshot({ path: '.artifacts/agenda-specialist-columns.png', fullPage: true });
  await filter.selectOption(String(fixture.agenda.professional));
  await expect(page.getByText('Especialista seleccionada', { exact: true })).toHaveCount(0);
  await expect(page.locator('.specialist-avatar')).toHaveCount(1);
  await expect(
    page.getByRole('button', { name: new RegExp('^Cita #' + fixture.agenda.appointment + ' ·') }),
  ).toBeVisible();
  for (const event of await page.locator('.calendar-event').all()) {
    await expect(event).toHaveAttribute(
      'data-professional-id',
      String(fixture.agenda.professional),
    );
  }
  await expect(
    page
      .getByRole('button', { name: new RegExp('^Cita #' + fixture.agenda.appointment + ' ·') })
      .filter({ hasText: 'Agenda F6 0 E2E' }),
  ).toBeVisible();
  for (const width of [390, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  expect(
    (await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa']).analyze())
      .violations,
  ).toEqual([]);
});
