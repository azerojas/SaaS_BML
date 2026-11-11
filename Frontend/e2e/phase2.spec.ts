import { test, expect, Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { control, fixture, login } from './helpers';
test.beforeEach(async ({ request }) => control(request, 'reset'));
async function enter(page: Page) {
  await page.goto('/login');
  await login(page);
}
async function field(page: Page, key: string, value: string) {
  await page.locator('#field-' + key).fill(value);
}
async function confirm(page: Page, name: string) {
  await page.getByRole('dialog').getByRole('button', { name, exact: true }).click();
}
async function client(page: Page, phone = '977123456', name = 'Clienta creada E2E') {
  await page.goto('/admin/clientas/nueva');
  await field(page, 'nombres', name);
  await field(page, 'apellidos', 'Aceptación');
  await field(page, 'telefono', phone);
  await field(page, 'notas_privadas', 'PRIVATE_SENTINEL_PHASE2_NEW');
  await page.getByRole('button', { name: 'Guardar clienta', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/clientas\/\d+$/);
}
test('clienta real: crear, consentimiento de servidor, PATCH, desactivar y reactivar', async ({
  page,
}) => {
  await enter(page);
  await client(page);
  const path = page.url();
  const id = path.split('/').at(-1)!;
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Clienta creada E2E');
  let data = await (await page.request.get('/api/clientas/' + id + '/')).json();
  expect(data.telefono).toBe('+51977123456');
  expect(data.consentimiento_datos).toBe(false);
  await page.locator('#consent-otorgado').check();
  await page.locator('#consent-evidencia').fill('Referencia sintética de aceptación');
  await page.getByRole('button', { name: 'Registrar consentimiento', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Consentimiento registrado' }),
  ).toBeVisible();
  data = await (await page.request.get('/api/clientas/' + id + '/')).json();
  expect(data.consentimiento_datos).toBe(true);
  expect(data.consentimiento_fecha).toBeTruthy();
  await page.getByRole('link', { name: 'Editar ficha' }).click();
  await expect(page.locator('#field-nombres')).toHaveValue('Clienta creada E2E');
  await field(page, 'nombres', 'Clienta editada E2E');
  await page.getByRole('button', { name: 'Guardar clienta', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Clienta editada E2E');
  await page.getByRole('button', { name: 'Desactivar', exact: true }).click();
  await confirm(page, 'Desactivar');
  await expect(page.getByRole('button', { name: 'Reactivar', exact: true })).toBeVisible();
  expect((await (await page.request.get('/api/clientas/' + id + '/')).json()).activa).toBe(false);
  await page.getByRole('button', { name: 'Reactivar', exact: true }).click();
  await confirm(page, 'Reactivar');
  await expect(page.getByRole('button', { name: 'Desactivar', exact: true })).toBeVisible();
  await page.goto('/admin/clientas/nueva');
  await field(page, 'nombres', 'Duplicada E2E');
  await field(page, 'apellidos', 'Prueba');
  await field(page, 'telefono', '+51977123456');
  await page.getByRole('button', { name: 'Guardar clienta', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'ese teléfono' }).last()).toBeVisible();
  await expect(page).toHaveURL(/nueva$/);
});
test('listado real: paginación, búsqueda, vacío y recuperación de red', async ({
  page,
  context,
}) => {
  await enter(page);
  await page.goto('/admin/clientas');
  await expect(page.locator('.record-row')).toHaveCount(20);
  const next = page.waitForResponse(
    (response) =>
      response.url().includes('/api/clientas/?') &&
      new URL(response.url()).searchParams.get('page') === '2',
  );
  await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
  expect((await next).status()).toBe(200);
  await expect(page.locator('.record-row').first()).toBeVisible();
  await page.getByLabel('Buscar clientas', { exact: true }).fill('+51980000001');
  await expect(page.locator('.record-row')).toHaveCount(1);
  await page.getByLabel('Buscar clientas', { exact: true }).fill('ninguna-coincidencia-phase2');
  await expect(page.getByRole('heading', { name: 'No encontramos clientas' })).toBeVisible();
  await context.setOffline(true);
  await page.getByLabel('Buscar clientas', { exact: true }).fill('sin-red');
  await expect(page.getByRole('alert').filter({ hasText: 'conectar' }).last()).toBeVisible();
  await context.setOffline(false);
  await page.getByLabel('Buscar clientas', { exact: true }).fill('+51980000002');
  await expect(page.locator('.record-row')).toHaveCount(1);
});
test('categoría y tratamiento: persistencia, decimales y publicación segura', async ({ page }) => {
  await enter(page);
  await page.goto('/admin/catalogo/categorias-servicio/nuevo');
  await field(page, 'nombre', 'Categoría creada E2E');
  await page.getByRole('button', { name: 'Guardar categoría de tratamiento', exact: true }).click();
  await expect(page).toHaveURL(/categorias-servicio\/\d+$/);
  await page.goto('/admin/catalogo/servicios/nuevo');
  await field(page, 'nombre', 'Tratamiento creado E2E');
  await field(page, 'precio_base', '80.10');
  await field(page, 'duracion_minutos', '45');
  await page.locator('#field-visible_catalogo').check();
  await page.locator('#category-search').fill('Categoría creada E2E');
  await expect(
    page.locator('#category option').filter({ hasText: 'Categoría creada E2E' }),
  ).toHaveCount(1);
  await page.locator('#category').selectOption({ label: 'Categoría creada E2E' });
  await page.getByRole('button', { name: 'Guardar tratamiento', exact: true }).click();
  await expect(page).toHaveURL(/servicios\/\d+$/);
  const id = page.url().split('/').at(-1)!;
  let data = await (await page.request.get('/api/admin/catalogo/servicios/' + id + '/')).json();
  expect(data.precio_base).toBe('80.10');
  expect(data.slug).toBeTruthy();
  expect((await page.request.get('/api/catalogo/servicios/' + data.slug + '/')).status()).toBe(200);
  await page.getByRole('link', { name: 'Editar tratamiento', exact: true }).click();
  await field(page, 'precio_base', '90.25');
  await page.getByRole('button', { name: 'Guardar tratamiento', exact: true }).click();
  await expect(page).toHaveURL(/servicios\/\d+$/);
  data = await (await page.request.get('/api/admin/catalogo/servicios/' + id + '/')).json();
  expect(data.precio_base).toBe('90.25');
  await page.getByRole('button', { name: 'Desactivar', exact: true }).click();
  await confirm(page, 'Desactivar');
  await expect(page.getByRole('button', { name: 'Reactivar', exact: true })).toBeVisible();
  expect((await page.request.get('/api/catalogo/servicios/' + data.slug + '/')).status()).toBe(404);
  await page.getByRole('button', { name: 'Reactivar', exact: true }).click();
  await confirm(page, 'Reactivar');
  await expect(page.getByRole('button', { name: 'Desactivar', exact: true })).toBeVisible();
  expect(
    (await (await page.request.get('/api/admin/catalogo/servicios/' + id + '/')).json())
      .visible_catalogo,
  ).toBe(false);
});
test('artículos: unidad real, tipo, SKU, precio y stock solo lectura', async ({ page }) => {
  await enter(page);
  await page.goto('/admin/catalogo/articulos/nuevo');
  await field(page, 'nombre', 'Artículo creado E2E');
  await field(page, 'sku', 'SKU-PHASE2');
  await page.locator('#field-tipo').selectOption('INSUMO');
  await field(page, 'precio_venta', '12.35');
  await field(page, 'stock_minimo', '2.125');
  await expect(page.locator('#unit option').filter({ hasText: 'Mililitro E2E' })).toHaveCount(1);
  await page.locator('#unit').selectOption(String(fixture.catalog.unit));
  await expect(page.locator('#field-visible_catalogo')).toBeDisabled();
  await page.getByRole('button', { name: 'Guardar artículo', exact: true }).click();
  await expect(page).toHaveURL(/articulos\/\d+$/);
  const id = page.url().split('/').at(-1)!;
  await expect(page.getByRole('heading', { name: 'Existencia de inventario' })).toBeVisible();
  const stock = await (await page.request.get('/api/admin/catalogo/stock/?articulo=' + id)).json();
  expect(stock.results[0].existencia).toBe('0.000');
  await page.getByRole('link', { name: 'Editar artículo', exact: true }).click();
  await page.locator('#field-tipo').selectOption('AMBOS');
  await page.locator('#field-visible_catalogo').check();
  await page.getByRole('button', { name: 'Guardar artículo', exact: true }).click();
  await expect(page).toHaveURL(/articulos\/\d+$/);
  const data = await (await page.request.get('/api/admin/catalogo/articulos/' + id + '/')).json();
  expect(data.precio_venta).toBe('12.35');
  expect((await page.request.get('/api/catalogo/productos/' + data.slug + '/')).status()).toBe(200);
  await page.goto('/admin/catalogo/articulos/nuevo');
  await field(page, 'nombre', 'Artículo duplicado E2E');
  await field(page, 'sku', 'SKU-PHASE2');
  await expect(page.locator('#unit option').filter({ hasText: 'Mililitro E2E' })).toHaveCount(1);
  await page.locator('#unit').selectOption(String(fixture.catalog.unit));
  await page.getByRole('button', { name: 'Guardar artículo', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Ya existe' }).last()).toBeVisible();
});
test('receta atómica: cantidad exacta, duplicados y stock inalterado', async ({ page }) => {
  await enter(page);
  const before = await (
    await page.request.get('/api/admin/catalogo/stock/?articulo=' + fixture.catalog.material)
  ).json();
  await page.goto('/admin/catalogo/servicios/' + fixture.catalog.public_service);
  await page.getByRole('button', { name: 'Añadir material', exact: true }).click();
  await expect(
    page.locator('#material-0 option').filter({ hasText: 'Material base E2E' }),
  ).toHaveCount(1);
  await page.locator('#material-0').selectOption(String(fixture.catalog.material));
  await page.locator('#quantity-0').fill('0.125');
  await page.getByRole('button', { name: 'Guardar receta', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Receta guardada' })).toBeVisible();
  const recipe = await (
    await page.request.get(
      '/api/admin/catalogo/servicios/' + fixture.catalog.public_service + '/receta/',
    )
  ).json();
  expect(recipe.insumos[0].cantidad_estimada).toBe('0.125');
  expect(recipe.costo_estimado).toBeNull();
  await page.getByRole('button', { name: 'Añadir material', exact: true }).click();
  await expect(
    page.locator('#material-1 option').filter({ hasText: 'Material base E2E' }),
  ).toHaveCount(1);
  await page.locator('#material-1').selectOption(String(fixture.catalog.material));
  await page.locator('#quantity-1').fill('1.000');
  await page.getByRole('button', { name: 'Guardar receta', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'No repitas' })).toBeVisible();
  const after = await (
    await page.request.get('/api/admin/catalogo/stock/?articulo=' + fixture.catalog.material)
  ).json();
  expect(after).toEqual(before);
});
test('fotografías por URL: alta, edición, principal y eliminación reales', async ({ page }) => {
  await enter(page);
  await page.goto('/admin/catalogo/servicios/' + fixture.catalog.public_service);
  await page.locator('#image-url').fill('https://images.example.test/one.jpg');
  await page.locator('#image-texto_alt').fill('Primera fotografía E2E');
  await page.getByRole('button', { name: 'Añadir fotografía', exact: true }).click();
  await expect(page.locator('.image-card')).toHaveCount(1);
  await page.locator('#image-url').fill('https://images.example.test/two.jpg');
  await page.locator('#image-texto_alt').fill('Segunda fotografía E2E');
  await page.getByRole('button', { name: 'Añadir fotografía', exact: true }).click();
  await expect(page.locator('.image-card')).toHaveCount(2);
  const second = page.locator('.image-card').filter({ hasText: 'Segunda fotografía E2E' });
  await second.getByRole('button', { name: 'Hacer principal', exact: true }).click();
  await expect(second).toContainText('Principal');
  await second.getByRole('button', { name: 'Editar fotografía', exact: true }).click();
  await page.locator('#image-texto_alt').fill('Fotografía editada E2E');
  await page.locator('#image-orden').fill('2');
  await page.getByRole('button', { name: 'Guardar fotografía', exact: true }).click();
  await expect(
    page.locator('.image-card').filter({ hasText: 'Fotografía editada E2E' }),
  ).toBeVisible();
  await page
    .locator('.image-card')
    .filter({ hasText: 'Fotografía editada E2E' })
    .getByRole('button', { name: 'Retirar fotografía', exact: true })
    .click();
  await confirm(page, 'Retirar fotografía');
  await expect(page.locator('.image-card')).toHaveCount(1);
  expect(
    (
      await (
        await page.request.get(
          '/api/admin/catalogo/servicios/' + fixture.catalog.public_service + '/imagenes/',
        )
      ).json()
    ).results[0].es_principal,
  ).toBe(true);
});
test('sin proveedor configurado la galería no simula cargas de archivos', async ({
  page,
  request,
}) => {
  await control(request, 'images-disabled');
  await enter(page);
  await page.goto('/admin/catalogo/articulos/' + fixture.catalog.product);
  await expect(
    page.getByRole('heading', { name: 'Almacenamiento de imágenes pendiente' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Añadir fotografía', exact: true })).toHaveCount(0);
});
test('catálogo público real no revela clientas ni elementos privados', async ({ page }) => {
  await page.goto('/catalogo');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('El cuidado');
  await expect(page.getByRole('link').filter({ hasText: 'Tratamiento visible E2E' })).toBeVisible();
  const publicResponse = await page.request.get('/api/catalogo/servicios/');
  const body = await publicResponse.text();
  expect(body).not.toContain('PRIVATE_SENTINEL');
  expect(body).not.toContain('notas_privadas');
  expect(body).not.toContain('telefono');
  expect(
    (
      await page.request.get('/api/catalogo/servicios/' + fixture.catalog.hidden_slug + '/')
    ).status(),
  ).toBe(404);
  await page.getByRole('link').filter({ hasText: 'Tratamiento visible E2E' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tratamiento visible E2E');
  await expect(page.getByRole('button', { name: /reservar|pagar|comprar/i })).toHaveCount(0);
  expect((await page.request.get('/api/clientas/')).status()).toBe(403);
});
test('staff sin permisos no puede mutar ni abrir administración de catálogo', async ({ page }) => {
  await page.goto('/login');
  await login(page, 'limited');
  await page.goto('/admin/catalogo/articulos');
  await expect(page).toHaveURL(/acceso-denegado/);
  const csrf = await page.request.get('/api/auth/csrf/');
  expect(csrf.status()).toBe(200);
  const cookies = await page.context().cookies();
  const token = cookies.find((cookie) => cookie.name === 'csrftoken')!.value;
  const response = await page.request.post('/api/clientas/', {
    headers: { 'X-CSRFToken': token },
    data: { nombres: 'No permitido', apellidos: 'E2E', telefono: '+51970123456' },
  });
  expect(response.status()).toBe(403);
});
test('categorías de artículos y unidades: altas y edición reales sin estados inventados', async ({
  page,
}) => {
  await enter(page);
  await page.goto('/admin/catalogo/categorias-articulo/nuevo');
  await field(page, 'nombre', 'Categoría artículos E2E');
  await page.getByRole('button', { name: 'Guardar categoría de artículo', exact: true }).click();
  await expect(page).toHaveURL(/categorias-articulo\/\d+$/);
  await expect(page.getByRole('button', { name: 'Desactivar', exact: true })).toHaveCount(0);
  await page.goto('/admin/catalogo/unidades/nuevo');
  await field(page, 'codigo', 'UND-E2E');
  await field(page, 'nombre', 'Unidad creada E2E');
  await page.getByRole('button', { name: 'Guardar unidad de medida', exact: true }).click();
  await expect(page).toHaveURL(/unidades\/\d+$/);
  const id = page.url().split('/').at(-1)!;
  await page.getByRole('link', { name: 'Editar unidad de medida', exact: true }).click();
  await field(page, 'nombre', 'Unidad editada E2E');
  await page.getByRole('button', { name: 'Guardar unidad de medida', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Unidad editada E2E');
  expect(
    (await (await page.request.get('/api/admin/catalogo/unidades/' + id + '/')).json()).codigo,
  ).toBe('UND-E2E');
});
test('ficha pública de producto y búsqueda vacía funcionan sin sesión', async ({ page }) => {
  await page.goto('/catalogo');
  await page.getByRole('button', { name: 'Productos', exact: true }).click();
  await expect(page.getByRole('link').filter({ hasText: 'Producto visible E2E' })).toBeVisible();
  await page.getByRole('link').filter({ hasText: 'Producto visible E2E' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Producto visible E2E');
  await expect(page.locator('.public-price')).toContainText('27.35');
  await page.goto('/catalogo');
  await page.getByLabel('Buscar en el catálogo', { exact: true }).fill('no-hay-resultados-phase2');
  await expect(
    page.getByRole('heading', { name: 'No hay elementos publicados para esta búsqueda' }),
  ).toBeVisible();
});
for (const width of [360, 390, 768, 1280])
  test('fase 2 responsive y accesible ' + width, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await enter(page);
    await page.goto('/admin/clientas');
    await expect(page.locator('.record-row').first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([]);
    await page.goto('/admin/catalogo/articulos/nuevo');
    await expect(page.locator('#field-nombre')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([]);
    await page.goto('/catalogo');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('El cuidado');
    await expect(page.locator('.public-card').first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([]);
    if (width === 1280 || width === 390)
      await page.screenshot({
        path: '.artifacts/catalogo-publico-' + width + '.png',
        fullPage: true,
      });
  });
