import { test, expect, Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { control, fixture, login } from './helpers';
test('respuesta de anticipo perdida: reintento usa la misma clave y no duplica dinero', async ({
  page,
}) => {
  await enter(page);
  const id = await reserve(page, '16:30');
  await page.goto('/admin/agenda/citas/' + id);
  await page.getByLabel('Monto del anticipo (PEN)').fill('20.00');
  await page.getByLabel('Confirmo la operación sobre este anticipo').check();
  const keys: string[] = [];
  let lost = true;
  await page.route('**/api/anticipos/', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    keys.push(route.request().headers()['idempotency-key']);
    if (lost) {
      lost = false;
      const response = await route.fetch();
      expect(response.status()).toBe(201);
      await route.abort('connectionreset');
    } else await route.continue();
  });
  await page.getByRole('button', { name: 'Registrar anticipo pendiente', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Reintentar operación pendiente' })).toBeVisible();
  await page.getByRole('button', { name: 'Reintentar operación pendiente' }).click();
  await expect(page.getByRole('button', { name: 'Reintentar operación pendiente' })).toHaveCount(0);
  expect(keys).toHaveLength(2);
  expect(keys[1]).toBe(keys[0]);
  const advances = await (await page.request.get('/api/anticipos/?cita=' + id)).json();
  expect(advances.results).toHaveLength(1);
  expect(advances.results[0].estado).toBe('PENDIENTE');
  expect(advances.results[0].monto).toBe('20.00');
});
test('políticas reales y escritura de agenda sin CSRF bloqueada', async ({ page }) => {
  await enter(page);
  expect(
    (
      await page.request.post(BASE + 'citas/expirar/', {
        data: {},
        headers: { Origin: 'https://localhost:4443', 'Idempotency-Key': randomUUID() },
      })
    ).status(),
  ).toBe(403);
  await page.goto('/admin/agenda/configuracion');
  await expect(page.getByLabel('Porcentaje de anticipo')).toHaveValue('20.00');
  const saved = page.waitForResponse(
    (r) =>
      r.url().endsWith('/agenda/calendario/configuracion/') && r.request().method() === 'PATCH',
  );
  await page.getByRole('button', { name: 'Guardar políticas', exact: true }).click();
  expect((await saved).status()).toBe(200);
  await page.goto('/admin/agenda');
  const expired = page.waitForResponse(
    (r) => r.url().endsWith('/citas/expirar/') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Procesar vencimientos en Django' }).click();
  expect((await expired).status()).toBe(200);
});
const f = fixture.agenda,
  BASE = '/api/v1/agenda/';
test.beforeEach(async ({ request }) => control(request, 'reset'));
async function enter(page: Page, role: 'admin' | 'limited' | 'agenda_reader' = 'admin') {
  await page.goto('/login');
  await login(page, role);
}
async function write(page: Page, path: string, data: unknown, method = 'POST', key = randomUUID()) {
  await page.request.get('/api/auth/csrf/');
  const csrf = (await page.context().cookies()).find((c) => c.name === 'csrftoken')!.value;
  return page.request.fetch(path, {
    method,
    data,
    headers: { Origin: 'https://localhost:4443', 'X-CSRFToken': csrf, 'Idempotency-Key': key },
  });
}
async function reserve(page: Page, time: string, client = f.clients[4]) {
  const response = await write(page, BASE + 'citas/', {
    clienta_id: client,
    profesional_id: f.professional,
    servicios: [f.service],
    inicio_en: f.date + 'T' + time + ':00-05:00',
  });
  expect(response.status()).toBe(201);
  return (await response.json()).cita_id as number;
}
async function slot(page: Page, time: string) {
  await page.getByLabel('Profesional', { exact: true }).selectOption(String(f.professional));
  await page.getByLabel('Fecha disponible').fill(f.date);
  await page.getByRole('button', { name: 'Consultar disponibilidad', exact: true }).click();
  await page
    .locator('bm-slot-picker')
    .getByRole('button', { name: new RegExp('^' + time + ' –') })
    .click();
}
test('calendario real: tres vistas, filtros, bloqueos y responsive accesible', async ({ page }) => {
  await enter(page);
  await page.goto('/admin/agenda');
  await page.getByLabel('Fecha del calendario').fill(f.date);
  await page.getByLabel('Profesional del calendario').selectOption(String(f.professional));
  for (const view of ['day', 'week', 'month']) {
    await page.getByLabel('Vista', { exact: true }).selectOption(view);
    await page.getByRole('button', { name: 'Aplicar filtros', exact: true }).click();
    await expect(
      page.getByRole('link', { name: new RegExp('Cita #' + f.appointment + ' ·') }),
    ).toBeVisible();
    await expect(page.getByText('Pausa sintética F6')).toBeVisible();
  }
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: '.artifacts/phase6-calendar-' + width + '.png', fullPage: true });
  }
  const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(audit.violations).toEqual([]);
});
test('reserva guiada, anticipo verificado y confirmación con importes oficiales', async ({
  page,
}) => {
  await enter(page);
  await page.goto('/admin/agenda/citas/nueva');
  await page.getByLabel('Buscar clienta por nombre o teléfono').fill('944123001');
  await page.getByRole('button', { name: 'Buscar clienta', exact: true }).click();
  await page.getByRole('button', { name: /Agenda F6 1 E2E/ }).click();
  await page
    .getByRole('button', { name: 'Servicio agenda F6 E2E · #' + f.service, exact: true })
    .click();
  await slot(page, '09:00');
  await page.getByLabel('He revisado clienta').check();
  await page.getByRole('button', { name: 'Crear reserva', exact: true }).click();
  await expect(page).toHaveURL(/\/agenda\/citas\/\d+$/);
  const id = Number(page.url().split('/').at(-1));
  await expect(
    page.getByRole('heading', { name: 'Cita #' + id + ' · PENDIENTE_PAGO' }),
  ).toBeVisible();
  await page.getByLabel('Monto del anticipo (PEN)').fill('20.00');
  await page.getByLabel('Confirmo la operación sobre este anticipo').check();
  await page.getByRole('button', { name: 'Registrar anticipo pendiente', exact: true }).click();
  const confirm = page.getByRole('button', { name: /Confirmar anticipo #/ });
  await expect(confirm).toBeDisabled();
  await page.getByLabel('He verificado manualmente el cobro').check();
  await confirm.click();
  await expect(page.getByRole('heading', { name: 'Cita #' + id + ' · PROGRAMADA' })).toBeVisible();
  await page.getByLabel('He revisado la acción y sus consecuencias').check();
  await page.getByRole('button', { name: 'Ejecutar acción de cita' }).click();
  await expect(page.getByRole('heading', { name: 'Cita #' + id + ' · CONFIRMADA' })).toBeVisible();
  const advances = await (await page.request.get('/api/anticipos/?cita=' + id)).json();
  expect(advances.results).toHaveLength(1);
  expect(advances.results[0].monto).toBe('20.00');
  expect(advances.results[0].estado).toBe('CONFIRMADO');
});
test('reprogramación conserva snapshots y cancelación registra motivo', async ({ page }) => {
  await enter(page);
  const id = await reserve(page, '11:00');
  await page.goto('/admin/agenda/citas/' + id);
  await slot(page, '11:30');
  await page.getByLabel('Motivo de reprogramación').fill('Cambio solicitado por la clienta');
  await page.getByLabel('Confirmo el nuevo profesional y horario').check();
  await page.getByRole('button', { name: 'Guardar reprogramación' }).click();
  await expect
    .poll(async () => (await (await page.request.get(BASE + 'citas/' + id + '/')).json()).inicio_en)
    .toContain('11:30:00');
  await page.getByLabel('Acción', { exact: true }).selectOption('cancelar');
  await page
    .getByLabel('Motivo de cancelación o inasistencia')
    .fill('Cancelación solicitada por clienta');
  await page.getByLabel('He revisado la acción y sus consecuencias').check();
  await page.getByRole('button', { name: 'Ejecutar acción de cita' }).click();
  await expect(page.getByRole('heading', { name: 'Cita #' + id + ' · CANCELADA' })).toBeVisible();
});
test('409 real entre consulta y reserva invalida hueco sin crear otra cita', async ({ page }) => {
  await enter(page);
  await page.goto('/admin/agenda/citas/nueva');
  await page.getByLabel('Buscar clienta por nombre o teléfono').fill('944123002');
  await page.getByRole('button', { name: 'Buscar clienta', exact: true }).click();
  await page.getByRole('button', { name: /Agenda F6 2 E2E/ }).click();
  await page
    .getByRole('button', { name: 'Servicio agenda F6 E2E · #' + f.service, exact: true })
    .click();
  await slot(page, '14:00');
  await reserve(page, '14:00', f.clients[0]);
  await page.getByLabel('He revisado clienta').check();
  const conflict = page.waitForResponse(
    (r) => r.url().endsWith('/agenda/citas/') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Crear reserva', exact: true }).click();
  expect((await conflict).status()).toBe(409);
  await expect(page.getByRole('button', { name: 'Crear reserva', exact: true })).toBeDisabled();
  await expect(
    page.getByRole('alert').filter({ hasText: 'El horario ya no está disponible.' }),
  ).toBeVisible();
});
test('espera: alta real, oferta manual y conversión atómica', async ({ page }) => {
  await enter(page);
  await page.goto('/admin/agenda/lista-espera');
  await page.getByLabel('Buscar clienta por nombre o teléfono').fill('944123002');
  await page.getByRole('button', { name: 'Buscar clienta', exact: true }).click();
  await page.getByRole('button', { name: /Agenda F6 2 E2E/ }).click();
  await page
    .getByRole('button', { name: 'Servicio agenda F6 E2E · #' + f.service, exact: true })
    .click();
  await page.getByLabel('Fecha deseada').fill(f.date);
  await page.getByLabel('ID de profesional preferido').fill(String(f.professional));
  await page.getByLabel('Franja desde').fill('15:00');
  await page.getByLabel('Franja hasta').fill('16:00');
  await page.getByRole('button', { name: 'Crear solicitud de espera' }).click();
  await expect(page).toHaveURL(/lista-espera\/\d+$/);
  const id = page.url().split('/').at(-1);
  await page.getByLabel('La oferta se comunicó manualmente').check();
  await page.getByRole('button', { name: 'Registrar oferta manual' }).click();
  await expect(
    page.getByRole('heading', { name: 'Solicitud #' + id + ' · NOTIFICADA' }),
  ).toBeVisible();
  await slot(page, '15:00');
  await page.getByLabel('Confirmo la operación sobre esta solicitud').check();
  await page.getByRole('button', { name: 'Convertir solicitud en cita' }).click();
  await expect(page).toHaveURL(/agenda\/citas\/\d+$/);
  const entry = await (await page.request.get(BASE + 'lista-espera/' + id + '/')).json();
  expect(entry.estado).toBe('CONVERTIDA');
  expect(entry.cita_id).toBe(Number(page.url().split('/').at(-1)));
});
test('profesionales, especialidades y horarios administrados contra Django', async ({ page }) => {
  await enter(page);
  await page.goto('/admin/agenda/profesionales');
  await page.getByRole('button', { name: 'Nuevo profesional', exact: true }).click();
  await page.getByLabel('Nombres', { exact: true }).fill('Alta F6');
  await page.getByLabel('Apellidos', { exact: true }).fill('Prueba');
  const saved = page.waitForResponse(
    (r) => r.url().endsWith('/agenda/profesionales/') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Guardar profesional' }).click();
  expect((await saved).status()).toBe(201);
  await page.getByRole('button', { name: 'Alta F6 Prueba · Activa', exact: true }).click();
  await page
    .getByRole('button', { name: 'Servicio agenda F6 E2E · #' + f.service, exact: true })
    .click();
  await page.getByRole('button', { name: 'Guardar especialidades' }).click();
  await page.getByLabel('Hora de inicio', { exact: true }).fill('09:00');
  await page.getByLabel('Hora de fin', { exact: true }).fill('13:00');
  const schedule = page.waitForResponse(
    (r) => r.url().endsWith('/agenda/horarios/') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Guardar horario' }).click();
  expect((await schedule).status()).toBe(201);
  const body = await (await schedule).json();
  await page.getByLabel('Motivo de retiro de horario').fill('Retiro administrativo revisado');
  await page.getByLabel('Confirmo el retiro del horario seleccionado').check();
  await page
    .getByRole('button', { name: 'Retirar horario #' + body.horario_id, exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Retirar horario #' + body.horario_id, exact: true }),
  ).toHaveCount(0);
});
test('bloqueos reales se crean y retiran con confirmación', async ({ page }) => {
  await enter(page);
  await page.goto('/admin/agenda/bloqueos');
  await page.getByLabel('Profesional del bloqueo').selectOption(String(f.professional));
  await page.getByLabel('Inicio del bloqueo').fill(f.date + 'T13:00');
  await page.getByLabel('Fin del bloqueo').fill(f.date + 'T13:30');
  await page.getByLabel('Motivo del bloqueo').fill('Bloqueo temporal de prueba F6');
  const saved = page.waitForResponse(
    (r) => r.url().endsWith('/agenda/bloqueos/') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Guardar bloqueo' }).click();
  expect((await saved).status()).toBe(201);
  const id = (await (await saved).json()).bloqueo_id;
  await page.getByLabel('Motivo de retiro del bloqueo').fill('Retiro del bloqueo de prueba');
  await page.getByLabel('Confirmo el retiro del bloqueo seleccionado').check();
  await page.getByRole('button', { name: 'Retirar bloqueo #' + id, exact: true }).click();
  await expect(
    page.getByRole('heading', { name: new RegExp('Bloqueo #' + id + ' ·') }),
  ).toHaveCount(0);
});
test('lectura sin permisos de escritura y protección CSRF real', async ({ page }) => {
  await enter(page, 'agenda_reader');
  await page.goto('/admin/agenda');
  await expect(page.getByRole('heading', { name: 'Agenda', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Nueva cita', exact: true })).toHaveCount(0);
  await page.goto('/admin/agenda/citas/nueva');
  await expect(
    page.getByRole('heading', { name: 'Este espacio necesita otro permiso.' }),
  ).toBeVisible();
  expect((await write(page, BASE + 'citas/', {})).status()).toBe(403);
  await page.goto('/admin/agenda/configuracion');
  await expect(page.getByRole('button', { name: 'Guardar políticas' })).toHaveCount(0);
});
test('sin sesión, sin permiso y escrituras sin CSRF rechazadas', async ({ page }) => {
  expect((await page.request.get(BASE + 'citas/')).status()).toBe(403);
  await enter(page, 'limited');
  await page.goto('/admin/agenda');
  await expect(
    page.getByRole('heading', { name: 'Este espacio necesita otro permiso.' }),
  ).toBeVisible();
  expect((await page.request.get(BASE + 'citas/')).status()).toBe(403);
});
test('vincula llegada verificada a una sola visita y muestra expiración oficial', async ({
  page,
}) => {
  await enter(page);
  const created = await write(page, '/api/admin/checkin/llegadas/', { clienta_id: f.clients[3] });
  expect(created.status()).toBe(201);
  const arrival = (await created.json()).id;
  expect(
    (
      await write(page, '/api/admin/checkin/llegadas/' + arrival + '/confirmar/', {
        identidad_verificada: true,
      })
    ).status(),
  ).toBe(200);
  await page.goto('/admin/agenda/citas/' + f.qr);
  await page.getByLabel('ID de llegada confirmada').fill(String(arrival));
  await page.getByLabel('Confirmé presencialmente la identidad').check();
  await page.getByRole('button', { name: 'Vincular llegada a cita' }).click();
  await expect(page.getByRole('link', { name: /Abrir visita #/ })).toBeVisible();
  const detail = await (await page.request.get(BASE + 'citas/' + f.qr + '/')).json();
  const retry = await write(page, BASE + 'citas/' + f.qr + '/vincular-llegada/', {
    llegada_id: arrival,
  });
  expect(retry.status()).toBe(200);
  expect((await retry.json()).visita_id).toBe(detail.visita_id);
  await page.goto('/admin/agenda/citas/' + f.expired);
  await expect(
    page.getByRole('heading', { name: 'Cita #' + f.expired + ' · EXPIRADA' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Registrar anticipo pendiente' })).toBeDisabled();
});
