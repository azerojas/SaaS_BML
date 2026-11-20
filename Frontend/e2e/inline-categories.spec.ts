import { test, expect } from '@playwright/test';
import { control, login } from './helpers';

test.beforeEach(async ({ request }) => control(request, 'reset'));

test('Otros guarda categorías de tratamientos y productos y las conserva para próximos registros', async ({
  page,
}) => {
  await page.goto('/login');
  await login(page);
  for (const kind of ['servicios', 'articulos']) {
    const product = kind === 'articulos';
    const createName = product ? 'Añadir producto' : 'Añadir tratamiento';
    const saveName = product ? 'Guardar artículo' : 'Guardar tratamiento';
    const closeName = product ? 'Cerrar artículo' : 'Cerrar tratamiento';
    const categoryKind = product ? 'categorias-articulo' : 'categorias-servicio';
    const categoryName = 'Categoría nueva ' + kind;
    const parentName = 'Registro con categoría ' + kind;
    await page.goto('/admin/catalogo/' + kind);
    await expect(
      page
        .getByRole('navigation', { name: 'Secciones del catálogo' })
        .getByRole('link', { name: /Categorías/ }),
    ).toHaveCount(0);
    for (const suffix of ['', '/nuevo', '/1', '/1/editar']) {
      await page.goto('/admin/catalogo/' + categoryKind + suffix);
      await expect(page).toHaveURL(new RegExp('/admin/catalogo/' + kind + '$'));
    }
    await page.getByRole('button', { name: createName, exact: true }).click();
    const modal = page.getByRole('dialog');
    const category = modal.locator('#category');
    await expect(category.locator('option').last()).toHaveText('Otros');
    await category.selectOption('__other__');
    await expect(modal.getByRole('button', { name: saveName, exact: true })).toBeDisabled();
    await modal.locator('#category-new').fill('  ' + categoryName + '  ');
    const creation = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        response.url().endsWith('/api/admin/catalogo/' + categoryKind + '/'),
    );
    await modal.locator('#category-new').press('Enter');
    const response = await creation;
    expect(response.status()).toBe(201);
    const created = await response.json();
    expect(created.nombre).toBe(categoryName);
    await expect(modal.locator('#category-new')).toHaveCount(0);
    await expect(category).toHaveValue(String(created.id));
    await modal.locator('#field-nombre').fill(parentName);
    await modal.locator(product ? '#field-precio_venta' : '#field-precio_base').fill('25');
    if (product) {
      await expect(modal.locator('#unit option').filter({ hasText: 'Mililitro E2E' })).toHaveCount(
        1,
      );
      await modal.locator('#unit').selectOption({ label: 'Mililitro E2E · ML' });
    }
    await modal.getByRole('button', { name: saveName, exact: true }).click();
    await expect(modal).toHaveCount(0);
    const row = page.getByRole('article', { name: parentName, exact: true });
    await expect(row).toContainText(categoryName);
    const id = (await row.locator('a').getAttribute('href'))!.split('/').at(-1)!;
    const parent = await (
      await page.request.get('/api/admin/catalogo/' + kind + '/' + id + '/')
    ).json();
    expect(parent.categoria_id).toBe(created.id);
    await page.reload();
    await page.getByRole('button', { name: createName, exact: true }).click();
    await expect(category.locator('option').filter({ hasText: categoryName })).toHaveCount(1);
    await expect(category.locator('option').last()).toHaveText('Otros');
    await category.selectOption('__other__');
    await modal.locator('#category-new').fill(categoryName);
    await modal.getByRole('button', { name: 'Guardar nueva categoría', exact: true }).click();
    await expect(modal.getByRole('alert')).toBeVisible();
    const matches = await (
      await page.request.get(
        '/api/admin/catalogo/' + categoryKind + '/?search=' + encodeURIComponent(categoryName),
      )
    ).json();
    expect(matches.count).toBe(1);
    await category.selectOption(String(created.id));
    await expect(modal.locator('#category-new')).toHaveCount(0);
    page.once('dialog', (dialog) => dialog.accept());
    await modal.getByRole('button', { name: closeName, exact: true }).click();
    await expect(modal).toHaveCount(0);
  }
});
