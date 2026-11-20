import { test, expect, Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { fixture, control, login } from './helpers';
const f = fixture.agenda;
const nextDate = new Date(Date.parse(f.date + 'T12:00:00Z') + 86400000).toISOString().slice(0, 10);

test.beforeEach(async ({ request }) => control(request, 'reset'));
test.afterEach(async ({ page }) => {
  await page.unroute('**/api/v1/agenda/disponibilidad-diaria/');
  await page.request.get('/api/auth/csrf/');
  const csrf = (await page.context().cookies()).find((row) => row.name === 'csrftoken')?.value;
  for (const date of [f.date, nextDate]) {
    const response = await page.request.post('/api/v1/agenda/disponibilidad-diaria/', {
      data: { fecha: date, franjas: [{ inicio: '09:00', fin: '17:00' }] },
      headers: {
        'X-CSRFToken': csrf ?? '',
        'X-Beauty-Contract': '1',
        'Idempotency-Key': randomUUID(),
        Origin: 'https://localhost:4443',
      },
    });
    expect(response.status()).toBe(200);
  }
});

async function calendar(page: Page, view = 'day') {
  await page.goto('/login');
  await login(page, 'admin');
  await page.goto('/admin/agenda');
  await page.getByLabel('Fecha del calendario').fill(f.date);
  const viewButton = page.getByRole('button', {
    name: view === 'day' ? 'Día' : view === 'week' ? 'Semana' : 'Mes',
    exact: true,
  });
  await viewButton.click();
  await expect(viewButton).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.calendar-loading')).toHaveCount(0);
  await expect(page.locator('.working-band')).toHaveCount(view === 'month' ? 0 : 1);
}
const editor = (page: Page) =>
  page.getByRole('dialog', { name: 'Configurar disponibilidad del día', exact: true });

test('arrastrar publica disponibilidad sin clienta ni servicio y conserva los horarios anteriores', async ({
  page,
}) => {
  await calendar(page);
  const unrelated: string[] = [];
  page.on('request', (request) => {
    if (
      /\/api\/clientas\/|\/api\/admin\/catalogo\/servicios\//.test(request.url()) ||
      (request.url().endsWith('/agenda/citas/') && request.method() === 'POST')
    )
      unrelated.push(request.url());
  });
  const start = page.getByRole('button', {
    name: `Añadir disponibilidad el ${f.date} a las 18:00`,
    exact: true,
  });
  await start.scrollIntoViewIfNeeded();
  const box = (await start.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + 4);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 1.5 + 3, { steps: 5 });
  await expect(page.locator('.selection-preview')).toContainText('18:00');
  await page.mouse.up();
  const dialog = editor(page);
  await expect(dialog.getByLabel('Inicio de franja 2')).toHaveValue('18:00');
  await expect(dialog.getByLabel('Fin de franja 2')).toHaveValue('19:00');
  await expect(dialog.getByLabel('Inicio de franja 1')).toHaveValue('09:00');
  await expect(dialog.getByText('Clienta', { exact: true })).toHaveCount(0);
  const saved = page.waitForResponse(
    (response) =>
      response.url().endsWith('/agenda/disponibilidad-diaria/') &&
      response.request().method() === 'POST',
  );
  await dialog.getByRole('button', { name: 'Guardar disponibilidad', exact: true }).click();
  const response = await saved;
  expect(response.status()).toBe(200);
  expect(response.request().postDataJSON()).toEqual({
    fecha: f.date,
    franjas: [
      { inicio: '09:00', fin: '17:00' },
      { inicio: '18:00', fin: '19:00' },
    ],
  });
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole('button', {
      name: `Editar disponibilidad del ${f.date} de 18:00 a 19:00`,
      exact: true,
    }),
  ).toBeVisible();
  expect(unrelated).toEqual([]);
  await page.reload();
  await page.getByLabel('Fecha del calendario').fill(f.date);
  await page.getByRole('button', { name: 'Día', exact: true }).click();
  await page.locator('.view-switcher button[aria-pressed="true"]').click();
  await expect(
    page.getByRole('button', {
      name: `Editar disponibilidad del ${f.date} de 18:00 a 19:00`,
      exact: true,
    }),
  ).toBeVisible();
});

test('editar una franja y abrir por teclado conserva la duración seleccionada', async ({
  page,
}) => {
  await calendar(page);
  await page
    .getByRole('button', {
      name: `Editar disponibilidad del ${f.date} de 09:00 a 17:00`,
      exact: true,
    })
    .click();
  const dialog = editor(page);
  await dialog.getByLabel('Fin de franja 1').fill('18:00');
  await dialog.getByRole('button', { name: 'Guardar disponibilidad', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const start = page.getByRole('button', {
    name: `Añadir disponibilidad el ${f.date} a las 18:30`,
    exact: true,
  });
  await start.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(dialog.getByLabel('Inicio de franja 2')).toHaveValue('19:00');
  await expect(dialog.getByLabel('Fin de franja 2')).toHaveValue('19:30');
});

test('la disponibilidad mensual permite cambiar fecha y horas desde el móvil', async ({ page }) => {
  await calendar(page, 'month');
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole('button', { name: `Añadir disponibilidad el ${f.date}`, exact: true })
    .click();
  const dialog = editor(page);
  await dialog.getByRole('button', { name: 'Abrir calendario', exact: true }).click();
  const picker = page.locator('.agenda-date-panel');
  await expect(picker).toBeVisible();
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
  ).toEqual([]);
  await page.screenshot({
    path: '.artifacts/agenda-date-picker-mobile.png',
    animations: 'disabled',
  });
  await picker
    .locator('.mat-calendar-body-cell-content')
    .getByText(String(Number(nextDate.slice(-2))), { exact: true })
    .click();
  await expect(dialog.getByLabel('Fecha disponible', { exact: true })).toHaveValue(nextDate);

  await expect(dialog.getByLabel('Fin de franja 1')).toHaveValue('17:00');
  await dialog.getByLabel('Fin de franja 1').fill('18:00');
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
  ).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: '.artifacts/availability-calendar-mobile.png',
    animations: 'disabled',
  });
  await dialog.getByRole('button', { name: 'Guardar disponibilidad', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByLabel('Fecha del calendario')).toHaveValue(nextDate);
  await expect(
    page.getByRole('button', {
      name: `Editar disponibilidad del ${nextDate} de 09:00 a 18:00`,
      exact: true,
    }),
  ).toBeVisible();
});

test('una respuesta perdida recupera el horario guardado sin crear citas', async ({ page }) => {
  await calendar(page);
  await page.getByRole('button', { name: 'Más opciones', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Disponibilidad del día', exact: true }).click();
  const dialog = editor(page);
  await expect(dialog.getByLabel('Fin de franja 1')).toHaveValue('17:00');
  await dialog.getByLabel('Fin de franja 1').fill('18:00');
  let writes = 0;
  await page.route('**/api/v1/agenda/disponibilidad-diaria/', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    writes++;
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    await route.abort('connectionreset');
  });
  await dialog.getByRole('button', { name: 'Guardar disponibilidad', exact: true }).click();
  await dialog.getByRole('button', { name: 'Resolver operación pendiente', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByText('Tu disponibilidad se guardó en el calendario.', { exact: true }),
  ).toBeVisible();
  expect(writes).toBe(1);
});

test('agenda general conserva las horas de 24 horas editables', async ({ page }) => {
  await page.route('**/api/v1/agenda/profesionales/**', (route) => route.abort());
  await calendar(page);
  await expect(page.getByRole('link', { name: 'Solicitudes web', exact: true })).toBeVisible();
  await expect(page.locator('.actions > .subtle-button')).toHaveCount(0);
  await expect(page.locator('.actions > .primary-button')).toHaveCount(0);
  await expect(page.getByLabel('Profesional del calendario', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Agenda general', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Más opciones', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Bloquear horario', exact: true })).toBeVisible();
  await page.getByRole('menuitem', { name: 'Disponibilidad del día', exact: true }).click();
  const dialog = editor(page);
  await expect(dialog.getByLabel('Profesional de la jornada', { exact: true })).toHaveCount(0);
  const day = new Date(Date.parse(f.date + 'T12:00:00Z') + 2 * 86400000).toISOString().slice(0, 10);
  await dialog.getByLabel('Fecha disponible', { exact: true }).fill(day);
  await dialog.getByRole('button', { name: 'Añadir franja horaria', exact: true }).click();
  await expect(dialog.getByLabel('Inicio de franja 1')).toHaveValue('09:00');
  await dialog.getByLabel('Inicio de franja 1').fill('915');
  await dialog.getByLabel('Inicio de franja 1').press('Tab');
  await expect(dialog.getByLabel('Inicio de franja 1')).toHaveValue('09:15');
  await dialog.getByRole('button', { name: 'Mostrar horas de Hasta', exact: true }).click();
  await page.getByRole('option', { name: '18:30', exact: true }).click();
  await expect(dialog.getByLabel('Fin de franja 1')).toHaveValue('18:30');
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
  ).toEqual([]);
  await page.screenshot({
    path: '.artifacts/shared-calendar-time-picker.png',
    animations: 'disabled',
  });
  await dialog.getByRole('button', { name: 'Guardar disponibilidad', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole('button', {
      name: `Editar disponibilidad del ${day} de 09:15 a 18:30`,
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Semana', exact: true }).click();
  await expect(page.locator('.calendar-loading')).toHaveCount(0);
  await expect(
    page.getByRole('button', {
      name: `Editar disponibilidad del ${day} de 09:15 a 18:30`,
      exact: true,
    }),
  ).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('.time-head')).toBeVisible();
  await expect(page.locator('.agenda-notice')).not.toContainText('Consultando');
  await expect(page.locator('.control-strip')).toBeVisible();
  await page.screenshot({
    path: '.artifacts/shared-calendar-desktop.png',
    fullPage: true,
    animations: 'disabled',
  });
});

test('meses separados y fechas alineadas bajo el día correcto en escritorio y móvil', async ({
  page,
}) => {
  await calendar(page, 'month');
  for (const width of [1920, 1280, 390]) {
    await page.setViewportSize({ width, height: 844 });
    const content = await page.locator('main').boundingBox();
    const calendarWidth = await page.locator('.calendar-page').boundingBox();
    expect(content?.width).toBeCloseTo(width, 0);
    expect(calendarWidth?.width).toBeGreaterThan(width - 60);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    let calendarSize: { width: number; height: number } | null = null;
    for (const date of ['2026-12-01', '2027-01-01', '2027-02-01', '2027-05-01', '2027-08-01']) {
      await page.getByLabel('Fecha del calendario', { exact: true }).fill(date);
      await page.getByRole('button', { name: 'Mes', exact: true }).click();
      await expect(page.locator(`.month-cell[aria-label="${date}"]`)).toBeVisible();
      await expect(page.locator('.month-weekday')).toHaveText([
        'Lun',
        'Mar',
        'Mié',
        'Jue',
        'Vie',
        'Sáb',
        'Dom',
      ]);
      await expect(page.locator('.outside-month .month-boundary').first()).toBeVisible();
      await page
        .locator('bm-calendar-page')
        .getByRole('button', { name: 'Abrir calendario', exact: true })
        .click();
      const picker = page.locator('.agenda-date-panel');
      await expect(picker.locator('th[scope="col"] span[aria-hidden="true"]')).toHaveText([
        'Lu',
        'Ma',
        'Mi',
        'Ju',
        'Vi',
        'Sá',
        'Do',
      ]);
      await expect(picker.locator('mat-month-view .mat-calendar-body-label').first()).toBeHidden();
      const firstDate = (await picker
        .locator('.mat-calendar-body-cell-content')
        .getByText('1', { exact: true })
        .boundingBox())!;
      const weekHeader = (await picker.locator('th[scope="col"]').first().boundingBox())!;
      expect(firstDate.y - weekHeader.y - weekHeader.height).toBeLessThan(22);
      const expectedColumn = (new Date(date + 'T12:00:00Z').getUTCDay() + 6) % 7;
      const header = (await picker.locator('th[scope="col"]').nth(expectedColumn).boundingBox())!;
      const first = (await picker
        .locator('.mat-calendar-body-cell-content')
        .getByText('1', { exact: true })
        .boundingBox())!;
      expect(Math.abs(header.x + header.width / 2 - first.x - first.width / 2)).toBeLessThan(1.5);
      const box = (await picker.boundingBox())!;
      if (calendarSize) {
        expect(Math.abs(box.width - calendarSize.width)).toBeLessThan(0.5);
        expect(Math.abs(box.height - calendarSize.height)).toBeLessThan(0.5);
      } else calendarSize = { width: box.width, height: box.height };
      expect(box.width).toBeCloseTo(304, 0);
      expect(box.height).toBeCloseTo(384, 0);

      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      await picker
        .locator('.mat-calendar-body-cell-content')
        .getByText('1', { exact: true })
        .click();
      await expect(picker).toHaveCount(0);
      await expect(page.getByLabel('Fecha del calendario', { exact: true })).toHaveValue(date);
    }
  }
});

test('fecha y vistas permiten navegar sin controles de mes duplicados', async ({ page }) => {
  await calendar(page);
  await expect(page.getByLabel('Mes del calendario', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Aplicar filtros', exact: true })).toHaveCount(0);
  await page.getByLabel('Fecha del calendario', { exact: true }).fill('2026-12-01');
  await page.getByRole('button', { name: 'Mes', exact: true }).click();
  await expect(page.locator('.month-cell[aria-label="2026-12-01"]')).toBeVisible();
  await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
  await expect(page.getByLabel('Fecha del calendario', { exact: true })).toHaveValue('2027-01-01');
  await expect(page.locator('.month-cell[aria-label="2027-01-01"]')).toBeVisible();
  await page.getByLabel('Fecha del calendario', { exact: true }).fill('2027-02-14');
  await expect(page.getByRole('button', { name: 'Día', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('.day-column')).toHaveCount(1);
});
