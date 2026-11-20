import { test, expect } from '@playwright/test';
import { control, login } from './helpers';

test.beforeEach(async ({ request }) => control(request, 'reset'));

test('los avisos mantienen los campos y botones en su sitio en móvil', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/login');
  await login(page);
  await page.goto('/admin/catalogo/articulos');
  await page.getByRole('button', { name: 'Añadir producto', exact: true }).click();
  const modal = page.getByRole('dialog');
  await expect(modal.locator('#unit option').filter({ hasText: 'Mililitro E2E' })).toHaveCount(1);
  const positions = () =>
    modal.evaluate((dialog) =>
      ['#field-nombre', '#field-descripcion', '#field-tipo', 'mat-dialog-actions'].map(
        (selector) => {
          const rect = dialog.querySelector(selector)!.getBoundingClientRect();
          return { x: rect.x, y: rect.y, height: rect.height };
        },
      ),
    );
  const beforeErrors = await positions();
  await modal.getByRole('button', { name: 'Guardar artículo', exact: true }).click();
  await expect(modal.getByRole('alert').filter({ hasText: 'Revisa' })).toBeVisible();
  const afterErrors = await positions();
  afterErrors.forEach((position, index) => {
    expect(position.x).toBeCloseTo(beforeErrors[index].x, 0);
    expect(position.y).toBeCloseTo(beforeErrors[index].y, 0);
    expect(position.height).toBeCloseTo(beforeErrors[index].height, 0);
  });
});

test('crear producto en modal con unidades del catálogo y sin sección separada', async ({
  page,
}) => {
  await page.goto('/login');
  await login(page);
  for (const path of ['unidades', 'unidades/nuevo', 'unidades/1', 'unidades/1/editar']) {
    await page.goto('/admin/catalogo/' + path);
    await expect(page).toHaveURL(/\/admin\/catalogo\/articulos$/);
    await expect(
      page.getByRole('heading', { name: 'Unidades de medida', exact: true }),
    ).toHaveCount(0);
  }
  await page.goto('/admin/catalogo/articulos');
  const listUrl = page.url();
  await expect(
    page
      .getByRole('navigation', { name: 'Secciones del catálogo' })
      .getByRole('link', { name: 'Unidades de medida' }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Añadir producto', exact: true }).click();
  const modal = page.getByRole('dialog');
  await expect(modal.getByRole('button', { name: 'Guardar artículo', exact: true })).toHaveText(
    'Guardar',
  );
  await expect(modal.locator('#unit option').filter({ hasText: 'Mililitro E2E' })).toHaveCount(1);
  const positions = () =>
    modal.evaluate((dialog) =>
      ['#field-nombre', '#field-descripcion', '#field-tipo', 'mat-dialog-actions'].map(
        (selector) => {
          const element = dialog.querySelector(selector);
          if (!element) throw new Error('Falta elemento: ' + selector);
          const rect = element.getBoundingClientRect();
          return { x: rect.x, y: rect.y, height: rect.height };
        },
      ),
    );
  const beforeErrors = await positions();
  await modal.getByRole('button', { name: 'Guardar artículo', exact: true }).click();
  await expect(modal.getByText('Este campo es obligatorio.', { exact: true })).toBeVisible();
  const afterErrors = await positions();
  afterErrors.forEach((position, index) => {
    expect(position.x).toBeCloseTo(beforeErrors[index].x, 0);
    expect(position.y).toBeCloseTo(beforeErrors[index].y, 0);
    expect(position.height).toBeCloseTo(beforeErrors[index].height, 0);
  });
  await expect(modal.locator('bm-reference-picker input')).toHaveCount(0);
  await expect(modal.getByRole('heading', { name: 'Crear artículo', exact: true })).toBeVisible();
  await modal.locator('#field-nombre').fill('Producto modal con unidad');
  await modal.locator('#field-descripcion').fill('Corta');
  await modal.getByRole('button', { name: 'Guardar artículo', exact: true }).click();
  await expect(modal.getByText('Escribe al menos 10 caracteres.', { exact: true })).toBeVisible();
  await modal.locator('#field-descripcion').fill('Descripción válida del producto de prueba.');
  await modal.locator('#field-tipo').selectOption('VENTA');
  await modal.locator('#field-precio_venta').fill('25.50');
  await modal.getByRole('button', { name: 'Guardar artículo', exact: true }).click();
  await expect(modal.getByRole('alert').filter({ hasText: 'Revisa' })).toBeVisible();
  const option = modal.locator('#unit option').filter({ hasText: 'Mililitro E2E' });
  await expect(option).toHaveCount(1);
  const unit = (await option.getAttribute('value'))!;
  await modal.locator('#unit').selectOption(unit);
  await modal.getByRole('button', { name: 'Guardar artículo', exact: true }).click();
  await expect(modal).toHaveCount(0);
  await expect(page).toHaveURL(listUrl);
  const row = page.getByRole('article', { name: 'Producto modal con unidad', exact: true });
  await expect(row).toBeVisible();
  const id = (await row.locator('a').getAttribute('href'))!.split('/').at(-1)!;
  const data = await (await page.request.get('/api/admin/catalogo/articulos/' + id + '/')).json();
  expect(data.unidad_id).toBe(Number(unit));
  expect(data.precio_venta).toBe('25.50');
  const edit = row.getByRole('button', {
    name: 'Editar producto Producto modal con unidad',
    exact: true,
  });
  await expect(edit).toHaveText('');
  await expect(
    row.getByRole('button', { name: 'Eliminar producto Producto modal con unidad', exact: true }),
  ).toHaveText('');
  await edit.click();
  await expect(modal.locator('#unit')).toHaveValue(unit);
  await modal.locator('#field-precio_venta').fill('30.50');
  await modal.getByRole('button', { name: 'Guardar artículo', exact: true }).click();
  await expect(modal).toHaveCount(0);
  await expect(row).toContainText('30.50');
  await row
    .getByRole('button', { name: 'Desactivar producto Producto modal con unidad', exact: true })
    .click();
  await expect(row).toContainText('Inactivo');
  expect(
    (await (await page.request.get('/api/admin/catalogo/articulos/' + id + '/')).json()).activo,
  ).toBe(false);
  await row
    .getByRole('button', { name: 'Activar producto Producto modal con unidad', exact: true })
    .click();
  await expect(
    row.getByRole('button', { name: 'Desactivar producto Producto modal con unidad', exact: true }),
  ).toBeVisible();
  await row
    .getByRole('button', { name: 'Eliminar producto Producto modal con unidad', exact: true })
    .click();
  await expect(modal).toContainText('Su historial se conserva');
  await modal.getByRole('button', { name: 'Eliminar', exact: true }).click();
  await expect(modal).toHaveCount(0);
  await expect(page.getByText('Producto retirado del catálogo.', { exact: true })).toBeVisible();
  const retired = await (
    await page.request.get('/api/admin/catalogo/articulos/' + id + '/')
  ).json();
  expect(retired.activo).toBe(false);
  expect(retired.unidad_id).toBe(Number(unit));
  expect(retired.precio_venta).toBe('30.50');
  await page.getByRole('button', { name: 'Añadir producto', exact: true }).click();
  await modal.getByRole('button', { name: 'Cerrar artículo', exact: true }).click();
  await expect(modal).toHaveCount(0);
});
