import { test, expect, Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { spawn } from 'node:child_process';
import { bookClientForQr, fixture, control, login } from './helpers';
const f = fixture.agenda;
test('Django rechaza un contrato viejo y el navegador bloquea escrituras sin perder UUID', async ({
  page,
  request,
}) => {
  await enter(page);
  await control(request, 'contract-on');
  const old = await page.request.post('/api/v1/agenda/citas/expirar/', { data: {} });
  expect(old.status()).toBe(503);
  expect((await old.json()).code).toBe('APP_UPDATE_REQUIRED');
  await page.goto('/admin/agenda');
  await control(request, 'contract-next');
  await page.getByRole('button', { name: 'Procesar vencimientos en Django' }).click();
  await expect(
    page.getByRole('heading', { name: 'Actualización necesaria', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Procesar vencimientos en Django' }),
  ).toBeDisabled();
  expect(
    await page.evaluate(() =>
      Object.keys(sessionStorage).some((key) => key.startsWith('lasheo.agenda.')),
    ),
  ).toBe(true);
});
test.beforeEach(async ({ request }) => control(request, 'reset'));
async function enter(page: Page, role: 'admin' | 'agenda_manager' = 'admin') {
  await page.goto('/login');
  await login(page, role);
}
async function pickBooking(page: Page, time: string, phone = '944123004') {
  await page.goto('/admin/agenda/citas/nueva');
  await page.getByLabel('Buscar clienta por nombre o teléfono').fill(phone);
  await page.getByRole('button', { name: 'Buscar clienta', exact: true }).click();
  await page.getByRole('button', { name: /Agenda F6 .*E2E/ }).click();
  await page
    .getByRole('button', { name: 'Servicio agenda F6 E2E · #' + f.service, exact: true })
    .click();
  await page.getByLabel('Profesional', { exact: true }).selectOption(String(f.professional));
  await page.getByLabel('Fecha disponible').fill(f.date);
  await page.getByRole('button', { name: 'Consultar disponibilidad', exact: true }).click();
  await page
    .locator('bm-slot-picker')
    .getByRole('button', { name: new RegExp('^' + time + ' –') })
    .click();
  await page.getByLabel('He revisado clienta').check();
}
test('rol operativo reserva sin recibir comisiones ni permisos de editar profesionales', async ({
  page,
}) => {
  await enter(page, 'agenda_manager');
  const response = await page.request.get('/api/v1/agenda/profesionales/');
  expect(response.status()).toBe(200);
  for (const row of (await response.json()).results) {
    expect(row).not.toHaveProperty('comision_porcentaje');
    expect(row).not.toHaveProperty('usuario_id');
    expect(row).not.toHaveProperty('telefono');
  }
  await pickBooking(page, '13:30');
  await page.getByRole('button', { name: 'Crear reserva', exact: true }).click();
  await expect(page).toHaveURL(/agenda\/citas\/\d+$/);
  await expect(page.getByRole('button', { name: 'Guardar profesional' })).toHaveCount(0);
});
test('agenda perdida y recarga: recupera desde Django sin reenviar POST ni guardar notas', async ({
  page,
}) => {
  await enter(page);
  await pickBooking(page, '13:00', '944123000');
  await page.getByLabel('Notas de la cita').fill('PRIVATE_SENTINEL_F7');
  let writes = 0;
  await page.route('**/api/v1/agenda/citas/', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    writes++;
    const response = await route.fetch();
    expect(response.status()).toBe(201);
    await route.abort('connectionreset');
  });
  await page.getByRole('button', { name: 'Crear reserva', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Consultar resultado de agenda' })).toBeVisible();
  expect(
    await page.evaluate(() => JSON.stringify({ ...sessionStorage, ...localStorage })),
  ).not.toContain('PRIVATE_SENTINEL_F7');
  page.once('dialog', (dialog) => dialog.accept());
  await page.reload();
  await page.getByRole('button', { name: 'Consultar resultado de agenda' }).click();
  await expect(page).toHaveURL(/agenda\/citas\/\d+$/);
  expect(writes).toBe(1);
  await expect(page.getByText('PRIVATE_SENTINEL_F7', { exact: true })).toBeVisible();
});
test.describe('Service worker real', () => {
  test.use({ serviceWorkers: 'allow' });
  test('PWA real: shell offline, APIs privadas fuera de caché y ninguna operación offline', async ({
    page,
    context,
  }) => {
    await enter(page);
    await page.evaluate(async () => {
      await navigator.serviceWorker.register('/ngsw-worker.js');
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    const cdp = await context.newCDPSession(page);
    const installability = await cdp.send('Page.getInstallabilityErrors');
    expect(installability.installabilityErrors).toEqual([]);
    await cdp.detach();
    const policy = await page.evaluate(async () => {
      const response = await fetch('/api/clientas/');
      await response.json();
      return response.headers.get('Cache-Control');
    });
    expect(policy).toContain('no-store');
    const cached = await page.evaluate(async () => {
      const urls: string[] = [];
      for (const name of await caches.keys()) {
        const cache = await caches.open(name);
        for (const request of await cache.keys()) urls.push(request.url);
      }
      return urls;
    });
    expect(cached.some((url) => url.includes('/api/'))).toBe(false);
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Sin conexión', exact: true })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Entrar a mi espacio', exact: true }),
    ).toBeDisabled();
    await context.setOffline(false);
    await expect(page.getByRole('heading', { name: 'Sin conexión', exact: true })).toHaveCount(0);
  });
  test('actualización real del SW bloquea operaciones y requiere recarga explícita', async ({
    page,
    context,
  }) => {
    await enter(page);
    await page.evaluate(async () => {
      await navigator.serviceWorker.register('/ngsw-worker.js');
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    await page.goto('/admin/agenda');
    await expect(
      page.getByRole('button', { name: 'Procesar vencimientos en Django' }),
    ).toBeVisible();
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    await context.route('**/ngsw.json*', async (route) => {
      const response = await route.fetch();
      const manifest = await response.json();
      await route.fulfill({
        response,
        json: { ...manifest, appData: { test_release: 'phase7-new-version' } },
      });
    });
    await page.evaluate(() =>
      navigator.serviceWorker.controller!.postMessage({ action: 'CHECK_FOR_UPDATES', nonce: 101 }),
    );
    await expect(
      page.getByRole('heading', { name: 'Actualización necesaria', exact: true }),
    ).toBeVisible({ timeout: 20000 });
    await expect(
      page.getByRole('button', { name: 'Procesar vencimientos en Django' }),
    ).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Recargar versión segura' })).toBeEnabled();
  });
});
test('formulario conserva cambios si se rechaza navegación y pide confirmación para descartarlos', async ({
  page,
}) => {
  await enter(page);
  await page.goto('/admin/clientas/nueva');
  await page.getByLabel('Nombres').fill('Pendiente F7');
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('link', { name: 'Cancelar', exact: true }).click();
  await expect(page).toHaveURL(/clientas\/nueva$/);
  await expect(page.getByLabel('Nombres')).toHaveValue('Pendiente F7');
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('link', { name: 'Cancelar', exact: true }).click();
  await expect(page).toHaveURL(/admin\/clientas$/);
});
test('accesibilidad WCAG y responsive 360,390,768,1024,1440 con navegación por teclado', async ({
  page,
}) => {
  await page.goto('/login');
  for (const width of [360, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const audit = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(audit.violations).toEqual([]);
  }
  await page.getByLabel('Usuario', { exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Contraseña', { exact: true })).toBeFocused();
  await page.screenshot({ path: '.artifacts/phase7-login.png' });
});
test('Lighthouse reproducible en login anónimo aislado', async () => {
  test.setTimeout(120000);
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/lighthouse-check.mjs'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let error = '';
    child.stderr.on('data', (chunk) => (error += chunk));
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error('Lighthouse failed: ' + error.slice(-500))),
    );
    child.on('error', reject);
  });
});

import { randomUUID } from 'node:crypto';
import { money } from '../src/app/features/dashboard/domain/analytics';
const milli = (value: string) => {
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, '0'));
};
async function post(page: Page, path: string, data: unknown, key = randomUUID()) {
  await page.request.get('/api/auth/csrf/');
  const csrf = (await page.context().cookies()).find(
    (cookie) => cookie.name === 'csrftoken',
  )!.value;
  return page.request.post(path, {
    data,
    headers: {
      Origin: 'https://localhost:4443',
      'X-CSRFToken': csrf,
      'Idempotency-Key': key,
      'X-Beauty-Contract': '1',
    },
  });
}
async function stock(page: Page, article: number) {
  return (
    await (
      await page.request.get('/api/inventario/stock/?articulo=' + article + '&activo=all')
    ).json()
  ).results[0].existencia as string;
}
async function confirmDialog(page: Page) {
  await page.getByRole('dialog').getByRole('button', { name: 'Confirmar', exact: true }).click();
}
async function registeredVisit(page: Page, phone: string) {
  const clients = await (
    await page.request.get('/api/clientas/?search=' + encodeURIComponent(phone))
  ).json();
  expect(clients.count).toBe(1);
  const visits = await (
    await page.request.get('/api/visitas/?estado=ABIERTA&clienta=' + clients.results[0].id)
  ).json();
  expect(visits.count).toBe(1);
  return visits.results[0];
}
async function publicArrival(page: Page, phone: string, fresh: boolean) {
  if (fresh) await bookClientForQr(page, phone, 'Integral F7', 'Ficticia');
  await page.goto('/registro/' + fixture.finance.token);
  await page.getByLabel('Tel\u00e9fono', { exact: true }).fill(phone);
  await page.getByRole('button', { name: 'Registrar mi visita', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Registro recibido' })).toBeVisible();
}

test.describe('UAT con PWA habilitada', () => {
  test.use({ serviceWorkers: 'allow' });
  test('integracion F7: QR → visita automática → tratamiento/producto → consumos → pago real', async ({
    page,
  }) => {
    test.setTimeout(90000);
    const f = fixture.finance;
    await enter(page);
    await control(page.request, 'contract-on');
    const day = new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);
    const tomorrow = new Date(Date.parse(day + 'T12:00:00Z') + 86400000).toISOString().slice(0, 10);
    const query =
      'desde=' + day + '&hasta=' + tomorrow + '&granularidad=day&timezone=America%2FLima';
    const before = (await (await page.request.get('/api/v1/analytics/overview/?' + query)).json())
      .indicadores;
    await publicArrival(page, '+51955123777', true);
    expect(
      await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage })),
    ).not.toContain('955123001');
    const beforeProduct = await stock(page, f.product);
    const beforeMaterial = await stock(page, f.material);
    const registered = await registeredVisit(page, '+51955123777');
    const visit = registered.id;
    await page.goto('/admin/visitas/' + visit);
    await page.getByRole('link', { name: 'Preparar tratamientos y venta' }).click();
    const services = page
      .locator('bm-catalog-picker')
      .filter({ has: page.getByRole('heading', { name: 'Tratamientos', exact: true }) });
    await services.getByLabel('Buscar por nombre o SKU').fill('Tratamiento caja F4');
    await services.getByRole('button', { name: 'Buscar Tratamientos', exact: true }).click();
    await services.getByRole('button', { name: /Tratamiento caja F4 E2E ·/ }).click();
    const products = page
      .locator('bm-catalog-picker')
      .filter({ has: page.getByRole('heading', { name: 'Productos', exact: true }) });
    await products.getByLabel('Buscar por nombre o SKU').fill('Producto caja F4');
    await products.getByRole('button', { name: 'Buscar Productos', exact: true }).click();
    await products.getByRole('button', { name: /Producto caja F4 E2E ·/ }).click();
    await page.getByRole('button', { name: 'Guardar borrador de venta', exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/ventas\/\d+$/);
    const sale = Number(page.url().split('/').at(-1));
    await expect(page.getByTestId('sale-total')).toContainText('100.00');
    expect(await stock(page, f.product)).toBe(beforeProduct);
    await page.getByRole('button', { name: 'Usar receta como propuesta editable' }).click();
    await page.getByLabel('Cantidad real total').fill('0.300');
    await page.getByLabel('Revisé estas cantidades reales').check();
    await page.getByLabel('Revisé tratamientos, productos').check();
    const responsePromise = page.waitForResponse(
      (response) =>
        response.url().endsWith('/confirmar/') && response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Confirmar venta y consumos', exact: true }).click();
    await confirmDialog(page);
    const confirmation = await responsePromise;
    expect(confirmation.status()).toBe(200);
    const key = confirmation.request().headers()['idempotency-key'];
    expect(key).toMatch(/^[0-9a-f-]{36}$/);
    expect(confirmation.request().headers()['x-csrftoken']).toBeTruthy();
    const repeated = await post(
      page,
      '/api/ventas/' + sale + '/confirmar/',
      confirmation.request().postDataJSON(),
      key,
    );
    expect(repeated.status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'Registrar dinero recibido' })).toBeVisible();
    expect(milli(await stock(page, f.product))).toBe(milli(beforeProduct) - 1000n);
    expect(milli(await stock(page, f.material))).toBe(milli(beforeMaterial) - 300n);
    await page.getByLabel('Monto recibido (PEN)').fill('40.00');
    await page.getByLabel('Verifiqué personalmente la recepción').check();
    await page.getByRole('button', { name: 'Revisar y registrar cobro' }).click();
    await confirmDialog(page);
    await expect(page.getByTestId('sale-balance')).toContainText('60.00');
    await page.getByLabel('Medio de pago', { exact: true }).selectOption('YAPE');
    await page.getByLabel('Monto recibido (PEN)').fill('60.00');
    await page.getByLabel('Referencia de operación').fill('F7-INTEGRAL-001');
    await page.getByLabel('Verifiqué personalmente la recepción').check();
    await page.getByRole('button', { name: 'Revisar y registrar cobro' }).click();
    await confirmDialog(page);
    await expect(page.getByTestId('sale-balance')).toHaveText(/S\/\s*0\.00/);
    const detail = await (await page.request.get('/api/ventas/' + sale + '/')).json();
    expect(detail.saldo.pagos_confirmados).toBe('100.00');
    expect(detail.lineas[0].consumos).toHaveLength(1);
    expect((await (await page.request.get('/api/visitas/' + visit + '/')).json()).estado).toBe(
      'FINALIZADA',
    );
    const after = (await (await page.request.get('/api/v1/analytics/overview/?' + query)).json())
      .indicadores;
    expect(milli(after.ventas_confirmadas) - milli(before.ventas_confirmadas)).toBe(100000n);
    expect(milli(after.cobros_registrados) - milli(before.cobros_registrados)).toBe(100000n);
    await page.goto('/admin');
    await expect(page.getByTestId('kpi-cobros_registrados')).toContainText(
      money(after.cobros_registrados),
    );
    await page.goto('/admin/reportes');
    await page.getByLabel('Reporte', { exact: true }).selectOption('overview');
    const exportResponse = page.waitForResponse((response) =>
      response.url().includes('/reports/export.xlsx'),
    );
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Exportar reporte Excel', exact: true }).click();
    expect((await exportResponse).status()).toBe(200);
    expect((await exportResponse).headers()['cache-control']).toContain('no-store');
    expect((await download).suggestedFilename()).toContain('.xlsx');
  });
});
