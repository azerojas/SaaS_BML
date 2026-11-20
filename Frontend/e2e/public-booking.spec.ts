import { test, expect, Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { control, fixture, login } from './helpers';

async function enter(page: Page) {
  await control(page.request, 'reset');
  await control(page.request, 'booking-mode');
  await page.goto('/reservar');
  await expect(page.getByRole('heading', { name: 'Reserva tu cita', exact: true })).toBeVisible();
}
async function choose(page: Page, time: string) {
  await page.getByRole('checkbox', { name: /Servicio agenda F6 E2E/ }).check();
  await page
    .getByRole('combobox', { name: 'Profesional', exact: true })
    .selectOption(String(fixture.agenda.professional));
  await page.getByLabel('Fecha', { exact: true }).fill(fixture.agenda.date);
  await page.getByRole('button', { name: 'Ver horarios', exact: true }).click();
  await page.getByRole('button', { name: time, exact: true }).click();
}
async function details(page: Page, phone: string) {
  await page.getByLabel('Nombres', { exact: true }).fill('Reserva');
  await page.getByLabel('Apellidos', { exact: true }).fill('Sintética');
  await page.getByLabel('Teléfono', { exact: true }).fill(phone);
  await page.getByRole('checkbox', { name: /He leído y acepto/ }).check();
}
test('solicitud sin correo, aprobación del salón, clave de acceso, cambio y cancelación', async ({
  page,
  browser,
}) => {
  await enter(page);
  await choose(page, '09:00 – 09:30');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: '.artifacts/reservas-visual-desktop.png',
    fullPage: true,
    animations: 'disabled',
  });
  await details(page, '+51977123451');
  await page.getByRole('button', { name: 'Enviar solicitud de reserva', exact: true }).click();
  await expect(
    page.getByText('Solicitud recibida. Falta la confirmación del salón.', { exact: true }),
  ).toBeVisible();
  const code = await page.getByLabel('Clave de gestión (8 cifras)').inputValue();
  expect(code).toMatch(/^\d{8}$/);
  const requests = await (await page.request.get('/api/v1/public/reservas/solicitudes/')).json();
  expect(requests.results).toHaveLength(1);
  expect(requests.results[0].estado).toBe('PENDIENTE');
  expect(requests.results[0].cita_id).toBeNull();
  const staff = await browser.newContext({ ignoreHTTPSErrors: true, serviceWorkers: 'block' });
  try {
    const admin = await staff.newPage();
    await admin.goto('https://localhost:4443/login');
    await login(admin);
    await admin.goto('https://localhost:4443/admin/agenda/solicitudes');
    const article = admin.getByRole('article').filter({ hasText: '+51977123451' });
    await article.getByRole('button', { name: 'Revisar solicitud' }).click();
    await admin.evaluate(() => window.scrollTo(0, 0));
    await admin.screenshot({
      path: '.artifacts/solicitudes-visual-desktop.png',
      fullPage: true,
      animations: 'disabled',
    });
    expect(
      (await new AxeBuilder({ page: admin }).include('.requests-page').analyze()).violations,
    ).toEqual([]);
    await admin.setViewportSize({ width: 390, height: 844 });
    await admin.screenshot({
      path: '.artifacts/solicitudes-visual-mobile.png',
      fullPage: true,
      animations: 'disabled',
    });
    expect(
      await admin.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    expect(
      (await new AxeBuilder({ page: admin }).include('.requests-page').analyze()).violations,
    ).toEqual([]);
    await admin.getByLabel('Verifiqué la identidad de la clienta').check();
    await admin.getByLabel('Verifiqué el consentimiento para la reserva').check();
    await admin.getByRole('button', { name: 'Confirmar cita sin anticipo' }).click();
    await expect(
      admin.getByText(
        'Solicitud resuelta. La clienta puede consultar el estado con su teléfono y clave de gestión.',
      ),
    ).toBeVisible();
  } finally {
    await staff.close();
  }
  const fresh = await browser.newContext({ ignoreHTTPSErrors: true, serviceWorkers: 'block' });
  try {
    const customer = await fresh.newPage();
    await customer.goto('/mis-reservas');
    await customer.getByLabel('Teléfono', { exact: true }).fill('+51977123451');
    await customer.getByLabel('Clave de gestión', { exact: true }).fill(code);
    await customer.getByRole('button', { name: 'Consultar reservas', exact: true }).click();
    await expect(customer.getByText('Confirmada por el salón', { exact: true })).toBeVisible();
    await customer.getByRole('button', { name: 'Cambiar horario', exact: true }).click();
    await customer.getByRole('button', { name: 'Consultar horarios', exact: true }).click();
    await customer.getByRole('button', { name: '09:30 – 10:00', exact: true }).click();
    await customer.getByRole('button', { name: 'Guardar nuevo horario', exact: true }).click();
    await expect(customer.getByRole('heading', { name: /Cambiar horario ·/ })).toHaveCount(0);
    const changed = await (
      await customer.request.get('https://localhost:4443/api/v1/public/reservas/solicitudes/')
    ).json();
    expect(new Date(changed.results[0].inicio_en).toISOString()).toBe(
      new Date(fixture.agenda.date + 'T09:30:00-05:00').toISOString(),
    );
    await customer.getByRole('button', { name: 'Cancelar solicitud', exact: true }).click();
    await customer.getByLabel('Motivo de cancelación').fill('Cambio de planes de prueba');
    await customer.getByRole('button', { name: 'Confirmar cancelación', exact: true }).click();
    await expect(customer.getByText('Tu solicitud fue cancelada.', { exact: true })).toBeVisible();
    await customer
      .getByRole('button', { name: 'Cerrar acceso a mis solicitudes', exact: true })
      .click();
    await expect(
      customer.getByText(
        'Ingresa el teléfono y la clave guardada al solicitar la cita para ver tus reservas.',
      ),
    ).toBeVisible();
  } finally {
    await fresh.close();
  }
});
test('respuesta perdida y recarga recuperan una sola solicitud y su clave', async ({ page }) => {
  await enter(page);
  await choose(page, '11:00 – 11:30');
  await details(page, '+51977123452');
  let posts = 0;
  await page.route('**/api/v1/public/reservas/solicitudes/', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    posts++;
    const response = await route.fetch();
    expect(response.status()).toBe(201);
    await route.abort('connectionreset');
  });
  await page.getByRole('button', { name: 'Enviar solicitud de reserva', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Una operación necesita confirmación' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Consultar resultado', exact: true }),
  ).toBeEnabled();
  await page.reload();
  await page.getByRole('button', { name: 'Consultar resultado', exact: true }).click();
  await expect(page.getByLabel('Clave de gestión (8 cifras)')).toBeVisible();
  expect(posts).toBe(1);
  const results = await (await page.request.get('/api/v1/public/reservas/solicitudes/')).json();
  expect(results.results).toHaveLength(1);
});
test('reservas accesibles en móvil y selección invalida horarios anteriores', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enter(page);
  await choose(page, '14:00 – 14:30');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: '.artifacts/reservas-visual-mobile.png',
    fullPage: true,
    animations: 'disabled',
  });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByLabel('Fecha', { exact: true }).fill(fixture.agenda.date.slice(0, 8) + '01');
  await expect(page.getByRole('button', { name: '14:00 – 14:30', exact: true })).toHaveCount(0);
});
