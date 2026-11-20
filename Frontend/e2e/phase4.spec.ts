import { test, expect, Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { control, fixture, login } from './helpers';
const f = fixture.finance;
const ORIGIN = 'https://localhost:4443';
test.beforeEach(async ({ request }) => control(request, 'reset'));
async function enter(page: Page, role: 'admin' | 'limited' | 'second' = 'admin') {
  await page.goto('/login');
  await login(page, role);
}
async function post(page: Page, path: string, data: unknown, key = randomUUID()) {
  await page.request.get('/api/auth/csrf/');
  const token = (await page.context().cookies()).find(
    (cookie) => cookie.name === 'csrftoken',
  )!.value;
  return page.request.post(path, {
    data,
    headers: { Origin: ORIGIN, 'X-CSRFToken': token, 'Idempotency-Key': key },
  });
}
async function stock(page: Page, article: number) {
  return (
    await (
      await page.request.get('/api/inventario/stock/?articulo=' + article + '&activo=all')
    ).json()
  ).results[0].existencia as string;
}
async function draft(page: Page, quantity = '1.000') {
  const response = await post(page, '/api/ventas/', {
    lineas: [{ tipo: 'PRODUCTO', articulo_id: f.product, unidad_id: f.unit, cantidad: quantity }],
  });
  expect(response.status()).toBe(201);
  return (await response.json()).venta_id as number;
}
async function confirmDialog(page: Page, name = 'Confirmar') {
  await page.getByRole('dialog').getByRole('button', { name, exact: true }).click();
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
async function publicArrival(page: Page, phone: string, fresh = false) {
  await page.goto('/registro/' + f.token);
  await page.getByLabel('Teléfono', { exact: true }).fill(phone);
  if (fresh) {
    await page.getByLabel('Es mi primera visita').check();
    await page.getByLabel('Nombres', { exact: true }).fill('Nueva QR F4');
    await page.getByLabel('Apellidos', { exact: true }).fill('Ficticia');
    await expect(page.getByLabel('He leído el aviso')).not.toBeChecked();
    await page.getByLabel('He leído el aviso').check();
  }
  await page.getByRole('button', { name: 'Registrar mi visita', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Registro recibido' })).toBeVisible();
}
test('clienta nueva: QR → visita automática → tratamiento/producto → consumos → pago real', async ({
  page,
}) => {
  await publicArrival(page, '+51955123001', true);
  expect(
    await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage })),
  ).not.toContain('955123001');
  await enter(page);
  const beforeProduct = await stock(page, f.product);
  const beforeMaterial = await stock(page, f.material);
  const registered = await registeredVisit(page, '+51955123001');
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
    (response) => response.url().endsWith('/confirmar/') && response.request().method() === 'POST',
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
  expect(Number(await stock(page, f.product))).toBe(Number(beforeProduct) - 1);
  expect(Number(await stock(page, f.material))).toBe(Number(beforeMaterial) - 0.3);
  await page.getByLabel('Monto recibido (PEN)').fill('40.00');
  await page.getByLabel('Verifiqué personalmente la recepción').check();
  await page.getByRole('button', { name: 'Revisar y registrar cobro' }).click();
  await confirmDialog(page);
  await expect(page.getByTestId('sale-balance')).toContainText('60.00');
  await page.getByLabel('Medio de pago', { exact: true }).selectOption('YAPE');
  await page.getByLabel('Monto recibido (PEN)').fill('60.00');
  await page.getByLabel('Referencia de operación').fill('F4-COMPLETO-001');
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
});
test('QR inválido y datos desconocidos no enumeran clientas; reenvíos conservan una sola visita abierta', async ({
  page,
}) => {
  await page.goto('/registro/' + randomUUID());
  await expect(
    page.getByText('Este enlace QR no está disponible.', { exact: false }),
  ).toBeVisible();
  await publicArrival(page, f.phone);
  const first = await page.request.post('/api/public/checkin/' + f.token + '/', {
    data: { telefono: f.phone },
  });
  const unknown = await page.request.post('/api/public/checkin/' + f.token + '/', {
    data: { telefono: '+51955123999' },
  });
  expect(first.status()).toBe(202);
  expect(unknown.status()).toBe(202);
  expect(await first.json()).toEqual(await unknown.json());
  await enter(page);
  const visit = await registeredVisit(page, f.phone);
  const responses = await Promise.all([
    page.request.post('/api/public/checkin/' + f.token + '/', { data: { telefono: f.phone } }),
    page.request.post('/api/public/checkin/' + f.token + '/', { data: { telefono: f.phone } }),
  ]);
  expect(responses.map((response) => response.status())).toEqual([202, 202]);
  expect((await registeredVisit(page, f.phone)).id).toBe(visit.id);
});
test('pago con respuesta perdida se recupera tras recargar sin repetir POST ni sumar dos veces', async ({
  page,
}) => {
  await enter(page);
  const sale = await draft(page);
  expect(
    (
      await post(page, '/api/ventas/' + sale + '/confirmar/', {
        consumos_revisados: true,
        consumos_reales: [],
      })
    ).status(),
  ).toBe(200);
  await page.goto('/admin/ventas/' + sale);
  let posts = 0;
  await page.route('**/api/ventas/' + sale + '/pagar/', async (route) => {
    posts++;
    await route.fetch();
    await route.abort('failed');
  });
  await page.getByLabel('Monto recibido (PEN)').fill('5.00');
  await page.getByLabel('Verifiqué personalmente la recepción').check();
  await page.getByRole('button', { name: 'Revisar y registrar cobro' }).click();
  await confirmDialog(page);
  await expect(page.getByRole('heading', { name: 'Operación por comprobar' })).toBeVisible();
  expect(
    await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage })),
  ).not.toContain('5.00');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Operación por comprobar' })).toBeVisible();
  await page.getByRole('button', { name: 'Consultar resultado de la operación' }).click();
  await expect(page.getByRole('heading', { name: 'Operación por comprobar' })).not.toBeVisible();
  await expect(page.getByTestId('sale-balance')).toContainText('15.00');
  expect(posts).toBe(1);
  expect((await (await page.request.get('/api/pagos/?venta=' + sale)).json()).count).toBe(1);
});
test('stock insuficiente y sobrepago se rechazan sin afectar existencias ni saldo', async ({
  page,
}) => {
  await enter(page);
  const before = await stock(page, f.product);
  const sale = await draft(page, '99999.000');
  await page.goto('/admin/ventas/' + sale);
  await page.getByLabel('Revisé tratamientos, productos').check();
  await page.getByRole('button', { name: 'Confirmar venta y consumos', exact: true }).click();
  await confirmDialog(page);
  await expect(
    page.getByRole('alert').filter({ hasText: 'existencias suficientes' }),
  ).toBeVisible();
  expect(await stock(page, f.product)).toBe(before);
  const good = await draft(page);
  expect(
    (
      await post(page, '/api/ventas/' + good + '/confirmar/', {
        consumos_revisados: true,
        consumos_reales: [],
      })
    ).status(),
  ).toBe(200);
  await page.goto('/admin/ventas/' + good);
  await page.getByLabel('Monto recibido (PEN)').fill('21.00');
  await page.getByLabel('Verifiqué personalmente la recepción').check();
  await page.getByRole('button', { name: 'Revisar y registrar cobro' }).click();
  await confirmDialog(page);
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByTestId('sale-balance')).toContainText('20.00');
  expect((await (await page.request.get('/api/pagos/?venta=' + good)).json()).count).toBe(0);
});
test('permisos, CSRF y expiración de sesión impiden confirmar y cobrar', async ({
  page,
  request,
}) => {
  await enter(page);
  const sale = await draft(page);
  const noCsrf = await page.request.post('/api/ventas/' + sale + '/confirmar/', {
    data: { consumos_revisados: true, consumos_reales: [] },
    headers: { Origin: ORIGIN, 'Idempotency-Key': randomUUID() },
  });
  expect(noCsrf.status()).toBe(403);
  await control(request, 'expire');
  await enter(page, 'limited');
  await page.goto('/admin/llegadas');
  await expect(page).toHaveURL(/acceso-denegado/);
  expect((await page.request.get('/api/admin/checkin/llegadas/')).status()).toBe(403);
  expect((await page.request.get('/api/ventas/')).status()).toBe(403);
  await page.goto('/admin/ventas/nueva');
  await expect(page).toHaveURL(/acceso-denegado/);
  await control(request, 'expire');
  await page.reload();
  await expect(page).toHaveURL(/login/);
});
test('QR administrativo real, revocación y formulario móvil accesible', async ({ page }) => {
  await enter(page);
  await page.goto('/admin/puntos-qr');
  await page.getByLabel('Nombre del punto', { exact: true }).fill('Cartel móvil F4');
  await page.getByRole('button', { name: 'Crear punto QR', exact: true }).click();
  await page.getByRole('button', { name: 'Ver QR de Cartel móvil F4', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Código QR para registrar la visita' })).toBeVisible();
  await page.getByText('Ver enlace de registro', { exact: true }).click();
  const url = await page.locator('.qr-url').innerText();
  expect(url).toMatch(/https:\/\/localhost:4443\/registro\//);
  const row = page.locator('.point-row').filter({ hasText: 'Cartel móvil F4' });
  await row.getByRole('button', { name: 'Revocar Cartel móvil F4', exact: true }).click();
  await confirmDialog(page, 'Revocar');
  await expect(row.getByText('Revocado', { exact: true })).toBeVisible();
  await page.goto(url);
  await expect(
    page.getByText('Este enlace QR no está disponible.', { exact: false }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/registro/' + f.token);
  await expect(page.getByLabel('Teléfono', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(
    accessibility.violations.filter((row) => ['serious', 'critical'].includes(row.impact ?? '')),
  ).toEqual([]);
});
test('anticipo existente se aplica una sola vez, separado de pagos nuevos y con saldo de Django', async ({
  page,
}) => {
  await enter(page);
  await page.goto('/admin/ventas/' + f.advance_sale);
  await page.getByRole('button', { name: 'Consultar anticipos aplicables' }).click();
  await expect(page.locator('#advance-id option').filter({ hasText: 'Disponible' })).toHaveCount(1);
  await page.getByLabel('Anticipo disponible').selectOption(String(f.advance));
  await page.getByLabel('Monto a aplicar (PEN)').fill('10.00');
  await page.getByLabel('Verifiqué que este anticipo').check();
  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith('/aplicar-anticipo/') && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Aplicar anticipo sin nuevo cobro' }).click();
  await confirmDialog(page);
  const response = await responsePromise;
  expect(response.status()).toBe(201);
  await expect(page.getByTestId('sale-balance')).toContainText('10.00');
  const replay = await post(
    page,
    '/api/ventas/' + f.advance_sale + '/aplicar-anticipo/',
    response.request().postDataJSON(),
    response.request().headers()['idempotency-key'],
  );
  expect(replay.status()).toBe(201);
  const extra = await post(page, '/api/ventas/' + f.advance_sale + '/aplicar-anticipo/', {
    anticipo_id: f.advance,
    monto: '0.01',
  });
  expect(extra.status()).toBe(409);
  const detail = await (await page.request.get('/api/ventas/' + f.advance_sale + '/')).json();
  expect(detail.saldo.anticipos_aplicados).toBe('10.00');
  expect(detail.saldo.pagos_confirmados).toBe('0.00');
  expect(detail.aplicaciones_anticipo).toHaveLength(1);
  await page.getByLabel('Monto recibido (PEN)').fill('10.00');
  await page.getByLabel('Verifiqué personalmente la recepción').check();
  await page.getByRole('button', { name: 'Revisar y registrar cobro' }).click();
  await confirmDialog(page);
  await expect(page.getByTestId('sale-balance')).toHaveText(/S\/\s*0\.00/);
});
test('móvil y tablet: visita QR, notas seguras, edición de líneas y cancelación con historial', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enter(page);
  await page.request.post('/api/public/checkin/' + f.token + '/', { data: { telefono: f.phone } });
  const visit = await registeredVisit(page, f.phone);
  await page.goto('/admin/visitas/' + visit.id);
  await page
    .getByLabel('Notas de atención', { exact: true })
    .fill('<img src=x onerror="window.phase4xss=1">');
  await page.getByRole('button', { name: 'Guardar notas', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Notas guardadas' })).toBeVisible();
  expect(await page.evaluate(() => 'phase4xss' in window)).toBe(false);
  await expect(page.locator('.preserve-lines')).toContainText('<img');
  await page
    .getByLabel('Notas de atención', { exact: true })
    .fill('Atención revisada con seguridad');
  await page.getByRole('button', { name: 'Guardar notas', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Notas guardadas' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 820, height: 1180 });
  await page
    .getByLabel('Motivo de cancelación', { exact: false })
    .fill('Cancelación ficticia de prueba');
  await page.getByRole('button', { name: 'Cancelar visita', exact: true }).click();
  await confirmDialog(page, 'Cancelar visita');
  await expect(page.locator('.feature-heading .badge')).toHaveText('CANCELADA');
  const sale = await draft(page);
  await page.goto('/admin/ventas/' + sale + '/editar');
  await expect(page.getByLabel('Cantidad', { exact: true })).toHaveValue('1.000');
  await page.getByLabel('Cantidad', { exact: true }).fill('2.000');
  await page.getByLabel('Descuento de línea (PEN)').fill('1.00');
  await page.getByLabel('Descuento global (PEN)').fill('2.00');
  await page.getByLabel('Propina (PEN)').fill('3.00');
  await page.getByRole('button', { name: 'Guardar borrador de venta', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/ventas\/\d+$/);
  await expect(page.getByTestId('sale-total')).toContainText('40.00');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const axe = await new AxeBuilder({ page }).analyze();
  expect(
    axe.violations.filter((row) => ['serious', 'critical'].includes(row.impact ?? '')),
  ).toEqual([]);
});
test('429 público respeta el bloqueo de reintento sin consultar ni mostrar identidad', async ({
  page,
  request,
}) => {
  await control(request, 'checkin-throttle');
  await page.goto('/registro/' + f.token);
  await page.getByLabel('Teléfono', { exact: true }).fill('+51955123111');
  // Consume the one permitted attempt with the real public API before the form submits.
  await page.request.post('/api/public/checkin/' + f.token + '/', {
    data: { telefono: '+51955123112' },
  });
  await page.getByRole('button', { name: 'Registrar mi visita', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'demasiados intentos' })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Registrar mi visita', exact: true }),
  ).toBeDisabled();
  await expect(page.getByRole('status').filter({ hasText: 'segundos' })).toBeVisible();
});
test('visita QR cancelada conserva historial y pago anulado reabre saldo sin devolver stock', async ({
  page,
}) => {
  await publicArrival(page, '+51955123009', true);
  await enter(page);
  const visit = await registeredVisit(page, '+51955123009');
  await page.goto('/admin/visitas/' + visit.id);
  await page
    .getByLabel('Motivo de cancelación', { exact: false })
    .fill('Retiro ficticio de la clienta');
  await page.getByRole('button', { name: 'Cancelar visita', exact: true }).click();
  await confirmDialog(page, 'Cancelar visita');
  await expect(page.locator('.feature-heading .badge')).toHaveText('CANCELADA');
  const sale = await draft(page);
  await post(page, '/api/ventas/' + sale + '/confirmar/', {
    consumos_revisados: true,
    consumos_reales: [],
  });
  await post(page, '/api/ventas/' + sale + '/pagar/', {
    metodo: 'EFECTIVO',
    monto: '5.00',
    verificado_manualmente: true,
  });
  const before = await stock(page, f.product);
  await page.goto('/admin/ventas/' + sale);
  await page.getByLabel('Motivo de la corrección').fill('Error ficticio de registro');
  await page.getByLabel('Confirmo un error de registro').check();
  const payment = page.getByRole('button', { name: /Anular error de pago #/ });
  await payment.click();
  await confirmDialog(page);
  await expect(page.getByTestId('sale-balance')).toContainText('20.00');
  expect(await stock(page, f.product)).toBe(before);
  expect(
    (await (await page.request.get('/api/pagos/?venta=' + sale)).json()).results[0].estado,
  ).toBe('ANULADO');
});
test('formulario público recupera una caída de red sin invalidar el QR ni reenviar una llegada', async ({
  page,
}) => {
  await page.route('**/api/public/checkin/' + f.token + '/', (route) => route.abort('failed'));
  await page.goto('/registro/' + f.token);
  await expect(
    page.getByRole('button', { name: 'Volver a cargar formulario', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Este enlace QR no está disponible.', { exact: false }),
  ).not.toBeVisible();
  await page.unroute('**/api/public/checkin/' + f.token + '/');
  await page.getByRole('button', { name: 'Volver a cargar formulario', exact: true }).click();
  await expect(page.getByLabel('Teléfono', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Registro recibido' })).not.toBeVisible();
});
test('cobro registrado con GET posterior perdido permite consultar de nuevo sin otro cobro', async ({
  page,
}) => {
  await enter(page);
  const sale = await draft(page);
  expect(
    (
      await post(page, '/api/ventas/' + sale + '/confirmar/', {
        consumos_revisados: true,
        consumos_reales: [],
      })
    ).status(),
  ).toBe(200);
  await page.goto('/admin/ventas/' + sale);
  await expect(page.getByRole('heading', { name: 'Registrar dinero recibido' })).toBeVisible();
  let posts = 0;
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/api/ventas/' + sale + '/pagar/'))
      posts++;
  });
  await page.route('**/api/ventas/' + sale + '/', (route) =>
    route.request().method() === 'GET' ? route.abort('failed') : route.continue(),
  );
  await page.getByLabel('Monto recibido (PEN)').fill('5.00');
  await page.getByLabel('Verifiqué personalmente la recepción').check();
  await page.getByRole('button', { name: 'Revisar y registrar cobro' }).click();
  await confirmDialog(page);
  await expect(
    page.getByRole('alert').filter({ hasText: 'operación fue registrada' }),
  ).toBeVisible();
  await page.unroute('**/api/ventas/' + sale + '/');
  await page.getByRole('button', { name: 'Volver a consultar venta', exact: true }).click();
  await expect(page.getByTestId('sale-balance')).toContainText('15.00');
  expect(posts).toBe(1);
  expect((await (await page.request.get('/api/pagos/?venta=' + sale)).json()).count).toBe(1);
});
