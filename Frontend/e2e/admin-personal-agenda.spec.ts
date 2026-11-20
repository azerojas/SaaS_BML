import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { control, fixture, login } from './helpers';
import { randomUUID } from 'node:crypto';

let createdProfile: number | null = null;

test.beforeEach(async ({ request }) => {
  createdProfile = null;
  await control(request, 'reset');
  await control(request, 'booking-mode');
});

test.afterEach(async ({ page }) => {
  if (!createdProfile) return;
  const csrf = (await page.context().cookies()).find(
    (cookie) => cookie.name === 'csrftoken',
  )!.value;
  const headers = () => ({
    'X-CSRFToken': csrf,
    'Idempotency-Key': randomUUID(),
    Origin: 'https://localhost:4443',
  });
  const day = new Date(Date.parse(fixture.agenda.date + 'T12:00:00Z') + 86400000)
    .toISOString()
    .slice(0, 10);
  const end = new Date(Date.parse(day + 'T12:00:00Z') + 86400000).toISOString().slice(0, 10);
  const rows = (
    await (
      await page.request.get('/api/v1/agenda/calendario/', {
        params: { profesional_id: createdProfile, desde: day, hasta: end },
      })
    ).json()
  ).results;
  for (const row of rows)
    if (['PROGRAMADA', 'CONFIRMADA', 'PENDIENTE_PAGO'].includes(row.estado)) {
      expect(
        (
          await page.request.post('/api/v1/agenda/citas/' + row.id + '/cancelar/', {
            data: { motivo: 'Fin de prueba de calendario personal' },
            headers: headers(),
          })
        ).status(),
      ).toBe(200);
    }
  expect(
    (
      await page.request.post('/api/v1/agenda/disponibilidad-diaria/restablecer/', {
        data: { fecha: day, profesional_id: createdProfile },
        headers: headers(),
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await page.request.patch('/api/v1/agenda/profesionales/' + createdProfile + '/', {
        data: { activa: false, visible_reservas: false, usuario_id: null },
        headers: headers(),
      })
    ).status(),
  ).toBe(200);
});

test('el administrador publica sus fechas y recibe reservas con su propia ficha', async ({
  page,
  browser,
}) => {
  test.setTimeout(90000);
  page.setDefaultTimeout(10000);
  await page.goto('/login');
  await login(page);
  await page.goto('/admin/agenda');
  await expect(page.getByRole('heading', { name: /^Mis fechas y citas/ })).toBeVisible();
  await expect(page.locator('bm-calendar-page .calendar-frame')).toBeVisible();
  await expect(page.locator('#personal-profile-form')).toHaveCount(0);
  await expect(page.getByLabel('Filtrar por especialista', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Mi calendario', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('button', { name: 'Publicar mis cupos', exact: true })).toHaveCount(
    0,
  );
  await expect(page.getByRole('button', { name: 'Mis cupos del día', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Configurar mi aten/ })).toHaveCount(0);
  await expect(page.locator('#personal-profile-form')).toHaveCount(0);
  const account = await (await page.request.get('/api/auth/me/')).json();
  const professionals = (
    await (await page.request.get('/api/v1/agenda/profesionales/?page_size=100')).json()
  ).results;
  const profile = professionals.find(
    (row: { usuario_id: number }) => row.usuario_id === account.id,
  );
  createdProfile = profile.id;
  expect(profile.usuario_id).toBeTruthy();
  expect(profile.publicacion_propia).toBe(true);
  expect(profile.servicios).toEqual([]);
  const specialties = await (
    await page.request.get('/api/v1/agenda/profesionales/' + profile.id + '/especialidades/')
  ).json();
  expect(specialties.servicios).toEqual([]);
  await page.goto('/admin/catalogo/servicios');
  const treatment = page.getByRole('article', { name: 'Servicio agenda F6 E2E', exact: true });
  await treatment
    .getByRole('button', { name: 'Editar tratamiento Servicio agenda F6 E2E', exact: true })
    .click();
  const catalogEditor = page.getByRole('dialog');
  await catalogEditor
    .getByRole('combobox', { name: 'Añadir persona', exact: true })
    .selectOption(String(profile.id));
  await catalogEditor.getByRole('button', { name: 'Guardar tratamiento', exact: true }).click();
  await expect(catalogEditor).toHaveCount(0);
  await page.goto('/admin/agenda/mis-fechas');
  const day = new Date(Date.parse(fixture.agenda.date + 'T12:00:00Z') + 86400000)
    .toISOString()
    .slice(0, 10);
  await page
    .getByRole('button', { name: /^Configurar horario del / })
    .first()
    .click();
  const modal = page.getByRole('dialog', { name: 'Publicar mis cupos', exact: true });
  await modal.getByLabel('Fecha disponible', { exact: true }).fill(day);
  for (const time of ['16:00', '17:00', '18:00'])
    await modal.getByRole('button', { name: new RegExp('^' + time) }).click();
  await modal.getByRole('button', { name: 'Guardar disponibilidad', exact: true }).click();
  await expect(modal).toHaveCount(0);
  await expect(page.locator('.working-band')).toHaveCount(3);
  await page.reload();
  await expect(page.getByRole('heading', { name: /^Mis fechas y citas/ })).toBeVisible();
  await page.getByLabel('Fecha del calendario', { exact: true }).fill(day);
  await page.getByRole('button', { name: 'Día', exact: true }).click();
  await expect(page.locator('.working-band')).toHaveCount(3);
  await page.getByRole('button', { name: 'Semana', exact: true }).click();
  await expect(page.locator('.working-band')).toHaveCount(3);
  await page.getByRole('button', { name: 'Mes', exact: true }).click();
  await expect(page.locator('.month-grid')).toBeVisible();
  await page.getByRole('button', { name: 'Día', exact: true }).click();
  const customer = await browser.newContext({
    baseURL: 'https://localhost:4443',
    ignoreHTTPSErrors: true,
  });
  try {
    const guest = await customer.newPage();
    await guest.goto('/reservar?servicio=' + fixture.agenda.service);
    await guest
      .getByRole('combobox', { name: 'Profesional', exact: true })
      .selectOption(String(profile.id));
    await guest.getByLabel('Fecha', { exact: true }).fill(day);
    await guest.getByRole('button', { name: 'Ver horarios', exact: true }).click();
    for (const time of ['16:00', '17:00', '18:00'])
      await expect(
        guest.getByRole('button', { name: time + ' – ' + time.slice(0, 2) + ':30', exact: true }),
      ).toBeVisible();
    await expect(guest.getByRole('button', { name: '16:15 – 16:45', exact: true })).toHaveCount(0);
    await guest.getByRole('button', { name: '16:00 – 16:30', exact: true }).click();
    await guest.getByLabel('Nombres', { exact: true }).fill('Clienta');
    await guest.getByLabel('Apellidos', { exact: true }).fill('Administradora E2E');
    await guest.getByLabel('Teléfono', { exact: true }).fill('+51977123881');
    await guest.getByRole('checkbox', { name: /He leído y acepto/ }).check();
    await guest.getByRole('button', { name: 'Enviar solicitud de reserva', exact: true }).click();
    await expect(
      guest.getByText('Solicitud recibida. Falta la confirmación del salón.', { exact: true }),
    ).toBeVisible();
  } finally {
    await customer.close();
  }
  await page.goto('/admin/agenda/solicitudes');
  await page
    .getByRole('article')
    .filter({ hasText: '+51977123881' })
    .getByRole('button', { name: 'Revisar solicitud' })
    .click();
  await page.getByLabel('Verifiqué la identidad de la clienta').check();
  await page.getByLabel('Verifiqué el consentimiento para la reserva').check();
  await page.getByRole('button', { name: 'Confirmar cita sin anticipo', exact: true }).click();
  await expect(
    page.getByText(
      'Solicitud resuelta. La clienta puede consultar el estado con su teléfono y clave de gestión.',
      { exact: true },
    ),
  ).toBeVisible();
  await page.goto('/admin/agenda/mis-fechas');
  await page.getByLabel('Fecha del calendario', { exact: true }).fill(day);
  await page.getByRole('button', { name: 'Día', exact: true }).click();
  await expect(page.locator('a[data-state]')).toHaveCount(1);
  await expect(page.locator('.working-band')).toHaveCount(2);
  for (const width of [320, 390, 440, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await page.setViewportSize({ width: 390, height: 844 });
  expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
  await page.screenshot({ path: '.artifacts/admin-personal-agenda-mobile.png', fullPage: true });
  await expect(
    page.getByRole('link', { name: 'Volver a la agenda del salón', exact: true }),
  ).toHaveCount(0);
  await page.goto('/admin/agenda');
  await expect(page.getByRole('button', { name: 'Mi calendario', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'Calendario del equipo', exact: true }).click();
  await expect(page.getByLabel('Filtrar por especialista', { exact: true })).toBeVisible();
  await expect(
    page.getByLabel('Filtrar por especialista').locator('option[value="' + profile.id + '"]'),
  ).toHaveCount(0);
  await expect(page.locator('a[data-professional-id="' + profile.id + '"]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Configurar horario del / })).toHaveCount(0);
});

test('una especialista no puede activar una ficha de administrador', async ({ page }) => {
  await control(page.request, 'specialist-mode');
  await page.goto('/login');
  await login(page, 'specialist');
  await page.goto('/admin/agenda/mis-fechas');
  await expect(page).toHaveURL(/\/admin\/acceso-denegado$/);
});
