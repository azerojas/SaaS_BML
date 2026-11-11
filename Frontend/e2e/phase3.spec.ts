import { test, expect, Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { control, fixture, login } from './helpers';
const ORIGIN = 'https://localhost:4443';
test.beforeEach(async ({ request }) => control(request, 'reset'));
async function enter(page: Page) {
  await page.goto('/login');
  await login(page);
}
async function post(page: Page, path: string, data: unknown, key?: string) {
  await page.request.get('/api/auth/csrf/');
  const token = (await page.context().cookies()).find(
    (cookie) => cookie.name === 'csrftoken',
  )!.value;
  return page.request.post(path, {
    data,
    headers: { Origin: ORIGIN, 'X-CSRFToken': token, ...(key ? { 'Idempotency-Key': key } : {}) },
  });
}
function payload(document: string, article = fixture.inventory.articles[0], quantity = '2.125') {
  return {
    proveedor_id: fixture.inventory.supplier,
    numero_documento: document,
    observaciones: 'Aceptación aislada E2E',
    detalles: [
      {
        articulo_id: article,
        unidad_id: fixture.inventory.unit,
        cantidad: quantity,
        costo_unitario: '3.2500',
        numero_lote: 'LOTE-E2E',
        vencimiento: null,
      },
    ],
  };
}
async function fillPurchase(page: Page, document: string) {
  await page.goto('/admin/compras/nueva');
  await page.locator('#field-numero_documento').fill(document);
  await expect(
    page.locator('#purchase-supplier option').filter({ hasText: 'Proveedor base E2E' }),
  ).toHaveCount(1);
  await page.locator('#purchase-supplier').selectOption(String(fixture.inventory.supplier));
  await expect(
    page.locator('#purchase-article-0 option').filter({ hasText: 'ZZ insumo E2E 00' }),
  ).toHaveCount(1);
  await page.locator('#purchase-article-0').selectOption(String(fixture.inventory.articles[0]));
  await page.locator('#purchase-quantity-0').fill('2.125');
  await page.locator('#purchase-cost-0').fill('3.2500');
}
async function savePurchase(page: Page) {
  await page.getByRole('button', { name: 'Guardar borrador', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/compras\/\d+$/);
  return Number(page.url().split('/').at(-1));
}
async function stock(page: Page, id: number) {
  const response = await page.request.get('/api/inventario/stock/?articulo=' + id + '&activo=all');
  expect(response.status()).toBe(200);
  return (await response.json()).results[0];
}
test('proveedores reales: alta, edición, estado, búsqueda y paginación', async ({ page }) => {
  await enter(page);
  await page.goto('/admin/proveedores');
  await expect(page.locator('.record-row')).toHaveCount(20);
  await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
  await expect(page.locator('.record-row')).toHaveCount(2);
  await page.getByRole('link', { name: 'Nuevo proveedor', exact: true }).click();
  await page.locator('#field-nombre').fill('Distribuidora creada E2E');
  await page.locator('#field-ruc').fill('SYNTHETIC-CREATED');
  await page.locator('#field-telefono').fill('966123456');
  await page.locator('#field-email').fill('provider@example.test');
  await page.getByRole('button', { name: 'Guardar proveedor', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/proveedores\/\d+$/);
  await expect(page.locator('#field-telefono')).toHaveValue('+51966123456');
  await page.locator('#field-nombre').fill('Distribuidora editada E2E');
  await page.getByRole('button', { name: 'Guardar proveedor', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Proveedor guardado' })).toBeVisible();
  await page.getByRole('button', { name: 'Desactivar proveedor', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Desactivar', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Reactivar proveedor', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Reactivar proveedor', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Reactivar', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Desactivar proveedor', exact: true }),
  ).toBeVisible();
  await page.goto('/admin/proveedores');
  await page.getByLabel('Buscar proveedores', { exact: true }).fill('SYNTHETIC-CREATED');
  await expect(page.locator('.record-row')).toHaveCount(1);
  await expect(page.locator('.record-row')).toContainText('Distribuidora editada E2E');
});
test('compra real: borrador, PATCH, recepción y stock consultado sin doble entrada', async ({
  page,
}) => {
  await enter(page);
  const before = await stock(page, fixture.inventory.articles[0]);
  await fillPurchase(page, 'COMPRA-UI-E2E');
  await expect(page.locator('.purchase-estimate')).toContainText('6.91');
  const requestPromise = page.waitForRequest(
    (request) => request.url().endsWith('/api/compras/') && request.method() === 'POST',
  );
  const id = await savePurchase(page);
  const request = await requestPromise;
  expect(request.headers()['idempotency-key']).toMatch(/^[a-f0-9-]{36}$/);
  expect(request.headers()['x-csrftoken']).toBeTruthy();
  expect(request.postDataJSON().detalles[0].cantidad).toBe('2.125');
  expect(request.postDataJSON().detalles[0].costo_unitario).toBe('3.2500');
  expect((await stock(page, fixture.inventory.articles[0])).existencia).toBe(before.existencia);
  await page.getByRole('link', { name: 'Editar borrador', exact: true }).click();
  await page.locator('#field-observaciones').fill('Observación modificada E2E');
  await page.getByRole('button', { name: 'Guardar borrador', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/compras\/\d+$/);
  await expect(page.getByText('Observación modificada E2E', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Preparar recepción', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar recepción', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Recibir compra', exact: true })
    .click();
  await expect(page.getByRole('status').filter({ hasText: 'Recepción confirmada' })).toBeVisible();
  await expect(page.locator('.stock-card')).toHaveCount(1);
  await expect(page.locator('.stock-card')).toContainText('2.125');
  expect((await post(page, '/api/compras/' + id + '/recibir/', {})).status()).toBe(200);
  expect(
    (
      await page.request
        .get('/api/inventario/movimientos/?compra=' + id)
        .then((response) => response.json())
    ).count,
  ).toBe(1);
  expect((await stock(page, fixture.inventory.articles[0])).existencia).toBe('2.125');
  await expect(page.getByRole('button', { name: 'Confirmar recepción', exact: true })).toHaveCount(
    0,
  );
});
test('respuesta perdida después de crear: reintento reutiliza UUID y no duplica compra', async ({
  page,
}) => {
  await enter(page);
  await fillPurchase(page, 'COMPRA-RESPUESTA-PERDIDA');
  let committed = 0;
  await page.route('**/api/compras/', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    expect(response.status()).toBe(201);
    committed = (await response.json()).id;
    await route.abort('failed');
  });
  await page.getByRole('button', { name: 'Guardar borrador', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Reintentar la misma compra', exact: true }),
  ).toBeVisible();
  await expect(page.locator('#field-numero_documento')).toBeDisabled();
  const storage = await page.evaluate(() => ({ ...sessionStorage }));
  expect(Object.keys(storage)).toHaveLength(1);
  expect(JSON.stringify(storage)).not.toContain('COMPRA-RESPUESTA-PERDIDA');
  await page.unroute('**/api/compras/');
  await page.getByRole('button', { name: 'Reintentar la misma compra', exact: true }).click();
  await expect(page).toHaveURL(ORIGIN + '/admin/compras/' + committed);
  const rows = await (
    await page.request.get('/api/compras/?search=COMPRA-RESPUESTA-PERDIDA')
  ).json();
  expect(rows.count).toBe(1);
  expect(await page.evaluate(() => Object.keys(sessionStorage))).toEqual([]);
});
test('recarga tras respuesta perdida recupera la compra real desde Django', async ({ page }) => {
  await enter(page);
  await fillPurchase(page, 'COMPRA-RECARGA-E2E');
  let id = 0;
  await page.route('**/api/compras/', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    id = (await response.json()).id;
    await route.abort('failed');
  });
  await page.getByRole('button', { name: 'Guardar borrador', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Reintentar la misma compra', exact: true }),
  ).toBeVisible();
  await page.unroute('**/api/compras/');
  await page.reload();
  await expect(page).toHaveURL(ORIGIN + '/admin/compras/' + id);
  expect(
    (await (await page.request.get('/api/compras/?search=COMPRA-RECARGA-E2E')).json()).count,
  ).toBe(1);
});
test('dos operadores reciben simultáneamente una compra con una sola entrada', async ({
  page,
  browser,
}) => {
  await enter(page);
  const created = await post(
    page,
    '/api/compras/',
    payload('COMPRA-CONCURRENTE', fixture.inventory.articles[2], '1.000'),
    randomUUID(),
  );
  expect(created.status()).toBe(201);
  const purchase = await created.json();
  const second = await browser.newContext({ baseURL: ORIGIN, ignoreHTTPSErrors: true });
  try {
    const other = await second.newPage();
    await other.goto('/login');
    await login(other, 'second');
    const responses = await Promise.all([
      post(page, '/api/compras/' + purchase.id + '/recibir/', {}),
      post(other, '/api/compras/' + purchase.id + '/recibir/', {}),
    ]);
    expect(responses.map((response) => response.status())).toEqual([200, 200]);
    const movements = await (
      await page.request.get('/api/inventario/movimientos/?compra=' + purchase.id)
    ).json();
    expect(movements.count).toBe(1);
    expect((await stock(page, fixture.inventory.articles[2])).existencia).toBe('1.000');
  } finally {
    await second.close();
  }
});
test('ajuste real: entrada, repetición idempotente y stock insuficiente sin negativo', async ({
  page,
}) => {
  await enter(page);
  await page.goto('/admin/inventario/ajustes/nuevo?articulo=' + fixture.inventory.articles[1]);
  await expect(page.getByText('Existencia actual consultada:', { exact: false })).toBeVisible();
  await page.locator('#adjustment-cantidad').fill('1.125');
  await page.locator('#adjustment-justificacion').fill('Conteo físico aislado E2E');
  const outgoing = page.waitForRequest(
    (request) => request.url().endsWith('/api/inventario/ajustes/') && request.method() === 'POST',
  );
  await page.getByRole('button', { name: 'Revisar ajuste', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Confirmar ajuste', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'Ajuste confirmado', exact: true })).toBeVisible();
  const request = await outgoing;
  const repeated = await post(
    page,
    '/api/inventario/ajustes/',
    request.postDataJSON(),
    request.headers()['idempotency-key'],
  );
  expect(repeated.status()).toBe(200);
  expect((await stock(page, fixture.inventory.articles[1])).existencia).toBe('1.125');
  await page.getByRole('button', { name: 'Registrar otro ajuste', exact: true }).click();
  await page.locator('#adjustment-tipo').selectOption('AJUSTE_SALIDA');
  await page.locator('#adjustment-cantidad').fill('999.000');
  await page.getByRole('button', { name: 'Revisar ajuste', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Confirmar ajuste', exact: true })
    .click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'No hay existencias suficientes' }),
  ).toBeVisible();
  expect((await stock(page, fixture.inventory.articles[1])).existencia).toBe('1.125');
  await page.locator('#adjustment-cantidad').fill('1.000');
  await page.getByRole('button', { name: 'Revisar ajuste', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Confirmar ajuste', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'Ajuste confirmado', exact: true })).toBeVisible();
  expect((await stock(page, fixture.inventory.articles[1])).existencia).toBe('0.125');
});
test('ajuste con respuesta perdida se recupera tras recarga sin otra salida', async ({ page }) => {
  await enter(page);
  await page.goto('/admin/inventario/ajustes/nuevo?articulo=' + fixture.inventory.articles[3]);
  await expect(page.getByText('Existencia actual consultada:', { exact: false })).toBeVisible();
  await page.locator('#adjustment-cantidad').fill('1.000');
  await page.locator('#adjustment-justificacion').fill('Entrada para prueba de recuperación');
  await page.route('**/api/inventario/ajustes/', async (route) => {
    const response = await route.fetch();
    expect(response.status()).toBe(201);
    await route.abort('failed');
  });
  await page.getByRole('button', { name: 'Revisar ajuste', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Confirmar ajuste', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Reintentar el mismo ajuste', exact: true }),
  ).toBeVisible();
  await page.unroute('**/api/inventario/ajustes/');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Ajuste confirmado', exact: true })).toBeVisible();
  const movements = await (
    await page.request.get('/api/inventario/movimientos/?articulo=' + fixture.inventory.articles[3])
  ).json();
  expect(movements.count).toBe(1);
});
test('anulación de borrador y rechazo de compra vacía o vencida no cambian stock', async ({
  page,
}) => {
  await enter(page);
  const created = await post(
    page,
    '/api/compras/',
    payload('COMPRA-ANULAR', fixture.inventory.articles[4]),
    randomUUID(),
  );
  const purchase = await created.json();
  await page.goto('/admin/compras/' + purchase.id);
  await page.getByRole('button', { name: 'Anular borrador', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Anular compra', exact: true })
    .click();
  await expect(page.locator('.feature-heading .badge')).toHaveText('ANULADA');
  expect((await post(page, '/api/compras/' + purchase.id + '/recibir/', {})).status()).toBe(409);
  expect((await stock(page, fixture.inventory.articles[4])).existencia).toBe('0.000');
  const empty = await (
    await post(page, '/api/compras/', { numero_documento: 'COMPRA-VACIA' }, randomUUID())
  ).json();
  expect((await post(page, '/api/compras/' + empty.id + '/recibir/', {})).status()).toBe(400);
  const expired = payload('COMPRA-VENCIDA', fixture.inventory.articles[4]);
  const past = {
    ...expired,
    detalles: expired.detalles.map((row) => ({ ...row, vencimiento: '2020-01-01' })),
  };
  const id = (await (await post(page, '/api/compras/', past, randomUUID())).json()).id;
  await page.goto('/admin/compras/' + id + '/recepcion');
  await page.getByRole('button', { name: 'Confirmar recepción', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Recibir compra', exact: true })
    .click();
  await expect(page.getByRole('alert').filter({ hasText: 'vencida' })).toBeVisible();
  expect((await stock(page, fixture.inventory.articles[4])).existencia).toBe('0.000');
});
test('stock paginado, filtros, detalle, movimientos y alertas reflejan PostgreSQL', async ({
  page,
}) => {
  await enter(page);
  await page.goto('/admin/inventario');
  await expect(page.locator('.stock-card')).toHaveCount(20);
  await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
  await expect(page.locator('.stock-card')).not.toHaveCount(20);
  await page.getByLabel('Buscar existencias', { exact: true }).fill('ZZ insumo E2E 24');
  await expect(page.locator('.stock-card')).toHaveCount(1);
  await page.locator('.stock-card').click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('ZZ insumo E2E 24');
  await expect(
    page.getByText('No aparece en recetas de tratamientos.', { exact: true }),
  ).toBeVisible();
  await page.goto('/admin/inventario/alertas');
  await page.getByLabel('Buscar artículos por reponer', { exact: true }).fill('ZZ insumo E2E 24');
  await expect(page.locator('.stock-card')).toHaveCount(1);
  await expect(page.locator('.stock-card')).toContainText('Sin movimientos');
  await page.goto('/admin/inventario/movimientos');
  await page.getByLabel('Motivo', { exact: true }).selectOption('COMPRA');
  await expect(page.locator('.movement-row').first()).toBeVisible();
  await page
    .getByLabel('Buscar movimientos por artículo', { exact: true })
    .fill('no-coincide-phase3');
  await expect(
    page.getByRole('heading', { name: 'No hay movimientos registrados para estos filtros' }),
  ).toBeVisible();
  await page.goto('/admin/compras');
  await page.getByLabel('Buscar por documento', { exact: true }).fill('COMPRA-UI-E2E');
  await expect(page.locator('.purchase-row')).toHaveCount(1);
  await page.getByLabel('Estado de compra', { exact: true }).selectOption('RECIBIDA');
  await expect(page.locator('.purchase-row')).toHaveCount(1);
});
test('permisos, CSRF y cuerpos numéricos inválidos se rechazan en Django', async ({ page }) => {
  await enter(page);
  const invalid = {
    ...payload('NUMERO-INVALIDO'),
    detalles: payload('NUMERO-INVALIDO').detalles.map((row) => ({ ...row, cantidad: 2.125 })),
  };
  expect((await post(page, '/api/compras/', invalid, randomUUID())).status()).toBe(400);
  const csrf = await page.request.post('/api/inventario/ajustes/', {
    headers: { Origin: ORIGIN },
    data: {
      articulo_id: fixture.inventory.articles[0],
      unidad_id: fixture.inventory.unit,
      tipo: 'AJUSTE_ENTRADA',
      cantidad: '1.000',
      justificacion: 'Sin token de seguridad',
    },
  });
  expect(csrf.status()).toBe(403);
  expect((await csrf.json()).code).toBe('csrf');
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Cerrar sesión', exact: true })
    .click();
  await login(page, 'limited');
  await page.goto('/admin/inventario/ajustes/nuevo');
  await expect(page).toHaveURL(/acceso-denegado/);
  expect((await page.request.get('/api/inventario/stock/resumen/')).status()).toBe(403);
  expect((await post(page, '/api/compras/', payload('SIN-PERMISO'), randomUUID())).status()).toBe(
    403,
  );
});
for (const width of [360, 390, 768, 1280])
  test('fase 3 responsive y accesible ' + width, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await enter(page);
    for (const path of [
      '/admin/inventario',
      '/admin/compras/nueva',
      '/admin/inventario/ajustes/nuevo',
      '/admin/proveedores/nuevo',
    ]) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      if (path === '/admin/inventario')
        await expect(page.locator('.stock-card').first()).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      expect(
        (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
          .violations,
      ).toEqual([]);
    }
    await page.goto('/admin/inventario');
    await expect(page.locator('.stock-card').first()).toBeVisible();
    if (width === 1280 || width === 390)
      await page.screenshot({ path: '.artifacts/inventario-' + width + '.png', fullPage: true });
  });
