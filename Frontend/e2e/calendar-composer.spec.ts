import { test, expect, Page, Locator } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { fixture, control, login } from './helpers';
const f = fixture.agenda;
const created = new Set<number>();

test.beforeEach(async ({ request }) => control(request, 'reset'));
test.afterEach(async ({ page }) => {
  // The shared harness resets financial fixtures, but retains agenda history.
  // Cancel only appointments created here so subsequent calendar tests keep their slots.
  await page.request.get('/api/auth/csrf/');
  const csrf = (await page.context().cookies()).find(
    (cookie) => cookie.name === 'csrftoken',
  )?.value;
  for (const id of created) {
    const response = await page.request.post('/api/v1/agenda/citas/' + id + '/cancelar/', {
      data: { motivo: 'Fin de prueba aislada de calendario' },
      headers: {
        'X-CSRFToken': csrf ?? '',
        'X-Beauty-Contract': '1',
        'Idempotency-Key': randomUUID(),
        Origin: 'https://localhost:4443',
      },
    });
    expect(response.status()).toBe(200);
  }
  created.clear();
});

async function calendar(page: Page, view = 'day') {
  await page.goto('/login');
  await login(page, 'admin');
  await page.goto('/admin/agenda');
  await page.getByLabel('Fecha del calendario').fill(f.date);
  await page
    .getByRole('button', {
      name: view === 'day' ? 'Día' : view === 'week' ? 'Semana' : 'Mes',
      exact: true,
    })
    .click();
  await page.locator('.view-switcher button[aria-pressed="true"]').click();
  await expect(page.locator('.calendar-loading')).toHaveCount(0);
}
async function fillEvent(dialog: Locator) {
  await dialog.getByLabel('Clienta', { exact: true }).fill('944123001');
  await dialog.getByRole('button', { name: 'Buscar clienta', exact: true }).click();
  await dialog.getByRole('button', { name: /Agenda F6 1 E2E/ }).click();
  await expect(
    dialog.getByRole('combobox', { name: 'Añadir servicio', exact: true }),
  ).toContainText('Servicio agenda F6 E2E');
  await dialog
    .getByRole('combobox', { name: 'Añadir servicio', exact: true })
    .selectOption({ label: 'Servicio agenda F6 E2E' });
  await expect(dialog.getByText('✓ Horario disponible', { exact: false })).toBeVisible();
}
async function openClientEvent(page: Page) {
  await page.getByRole('button', { name: 'Más opciones', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Agendar cita para una clienta', exact: true }).click();
}

test('la opción de citas conserva su creación y reprogramación desde una ventana', async ({
  page,
}) => {
  await calendar(page);
  await openClientEvent(page);
  const dialog = page.getByRole('dialog', { name: 'Nueva cita', exact: true });
  await expect(dialog.getByLabel('Fecha', { exact: true })).toHaveValue(f.date);
  await dialog.getByLabel('Inicio', { exact: true }).fill('13:00');
  await fillEvent(dialog);
  await expect(dialog.locator('output')).toHaveText('13:30');
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
  ).toEqual([]);
  await page.screenshot({ path: '.artifacts/calendar-new-event.png', animations: 'disabled' });
  const saved = page.waitForResponse(
    (r) => r.url().endsWith('/agenda/citas/') && r.request().method() === 'POST',
  );
  await dialog.getByRole('button', { name: 'Guardar cita', exact: true }).click();
  const response = await saved;
  expect(response.status()).toBe(201);
  const id = (await response.json()).cita_id;
  created.add(id);
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(/\/admin\/agenda$/);
  await page.getByRole('link', { name: new RegExp('^Cita #' + id + ' ·') }).click();
  const preview = page.getByRole('dialog', { name: 'Detalle de cita', exact: true });
  await expect(preview.getByRole('heading', { name: 'Agenda F6 1 E2E' })).toBeVisible();
  await preview.getByRole('button', { name: 'Cambiar horario', exact: true }).click();
  const edit = page.getByRole('dialog', { name: 'Reprogramar cita', exact: true });
  await edit.getByLabel('Inicio', { exact: true }).fill('14:00');
  await edit.getByLabel('Motivo del cambio').fill('Cambio solicitado por la clienta');
  await expect(edit.getByRole('button', { name: 'Guardar cambio', exact: true })).toBeEnabled();
  await edit.getByRole('button', { name: 'Guardar cambio', exact: true }).click();
  await expect(edit).toHaveCount(0);
  const detail = await (await page.request.get('/api/v1/agenda/citas/' + id + '/')).json();
  expect(detail.inicio_en).toContain('T14:00:00');
  expect(detail.servicios[0].servicio_id).toBe(f.service);
});

test('un horario ocupado no se guarda y el formulario funciona en móvil', async ({ page }) => {
  await calendar(page, 'month');
  await page.setViewportSize({ width: 390, height: 844 });
  await openClientEvent(page);
  const dialog = page.getByRole('dialog', { name: 'Nueva cita', exact: true });
  await dialog.getByLabel('Inicio', { exact: true }).fill('13:00');
  await fillEvent(dialog);
  await dialog.getByLabel('Inicio', { exact: true }).fill('10:00');
  await expect(
    dialog.getByText('Este horario no está disponible.', { exact: false }),
  ).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Guardar cita', exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: '13:30', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Guardar cita', exact: true })).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
  ).toEqual([]);
  await page.screenshot({
    path: '.artifacts/calendar-new-event-mobile.png',
    animations: 'disabled',
  });
});

test('respuesta perdida se recupera desde la ventana sin duplicar la cita', async ({ page }) => {
  await calendar(page);
  await openClientEvent(page);
  const dialog = page.getByRole('dialog', { name: 'Nueva cita', exact: true });
  await dialog.getByLabel('Inicio', { exact: true }).fill('15:00');
  await fillEvent(dialog);
  let writes = 0;
  await page.route('**/api/v1/agenda/citas/', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    writes++;
    const response = await route.fetch();
    expect(response.status()).toBe(201);
    created.add((await response.json()).cita_id);
    await route.abort('connectionreset');
  });
  await dialog.getByRole('button', { name: 'Guardar cita', exact: true }).click();
  await dialog.getByRole('button', { name: 'Resolver operación pendiente', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(writes).toBe(1);
  await expect(
    page.getByText('La cita se guardó en tu calendario.', { exact: true }),
  ).toBeVisible();
});
