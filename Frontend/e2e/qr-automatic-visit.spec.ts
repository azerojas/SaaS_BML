import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { bookClientForQr, control, fixture, login } from './helpers';

test.beforeEach(async ({ request }) => control(request, 'reset'));

test('QR registra una visita sin recepción ni walk-in y los reenvíos no la duplican', async ({
  page,
  browser,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await bookClientForQr(page, '+51955123881', 'Autónoma QR', 'Ficticia');
  await page.goto('/registro/' + fixture.finance.token);
  await page.getByLabel('Teléfono', { exact: true }).fill('955123881');
  await expect(page.getByRole('checkbox')).toHaveCount(0);
  await expect(page.getByLabel('Nombres', { exact: true })).toHaveCount(0);
  const sent = page.waitForRequest(
    (request) => request.method() === 'POST' && request.url().includes('/api/public/checkin/'),
  );
  await page.getByRole('button', { name: 'Registrar mi visita', exact: true }).click();
  expect((await sent).postDataJSON()).toEqual({ telefono: '+51955123881' });
  await expect(page.getByRole('heading', { name: 'Registro recibido' })).toBeVisible();
  await expect(page.getByText('No necesitas confirmar tu llegada en recepción.')).toBeVisible();
  expect(
    await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage })),
  ).not.toContain('955123881');

  const adminContext = await browser.newContext({
    ignoreHTTPSErrors: true,
    baseURL: new URL(page.url()).origin,
  });
  try {
    const admin = await adminContext.newPage();
    await admin.goto('/login');
    await login(admin);
    const clients = await (await admin.request.get('/api/clientas/?search=955123881')).json();
    expect(clients.count).toBe(1);
    const client = await (
      await admin.request.get('/api/clientas/' + clients.results[0].id + '/')
    ).json();
    expect(client.activa).toBe(true);
    expect(client.consentimiento_datos).toBe(true);
    const visits = await (await admin.request.get('/api/visitas/?clienta=' + client.id)).json();
    expect(visits.count).toBe(1);
    expect(visits.results[0].estado).toBe('ABIERTA');
    const visitId = visits.results[0].id;

    await admin.goto('/admin/visitas');
    await expect(admin.getByRole('link', { name: 'Llegadas & Check-in' })).toHaveCount(0);
    await expect(admin.getByRole('link', { name: 'Registrar Walk-in' })).toHaveCount(0);
    await expect(admin.getByText('Autónoma QR Ficticia', { exact: false }).first()).toBeVisible();
    await admin.goto('/admin/visitas/nueva');
    await expect(admin).toHaveURL(/\/admin\/visitas$/);
    await admin.goto('/admin/llegadas');
    await expect(admin).toHaveURL(/\/admin\/visitas$/);

    await page.goto('/registro/' + fixture.finance.token);
    await page.getByLabel('Teléfono', { exact: true }).fill('955123881');
    await page.getByRole('button', { name: 'Registrar mi visita', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Registro recibido' })).toBeVisible();
    const repeat = await (await admin.request.get('/api/visitas/?clienta=' + client.id)).json();
    expect(repeat.count).toBe(1);
    expect(repeat.results[0].id).toBe(visitId);
  } finally {
    await adminContext.close();
  }
});

test('el formulario QR solo pide teléfono y valida el número en móvil', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/registro/' + fixture.finance.token);
  await expect(page.getByRole('checkbox')).toHaveCount(0);
  await expect(page.locator('form input')).toHaveCount(1);
  let submissions = 0;
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().includes('/api/public/checkin/'))
      submissions++;
  });
  await page.getByRole('button', { name: 'Registrar mi visita', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'teléfono válido' })).toBeVisible();
  expect(submissions).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(
    (await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa']).analyze())
      .violations,
  ).toEqual([]);
});
