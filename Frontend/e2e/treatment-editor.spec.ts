import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { control, fixture, login } from './helpers';

test.beforeEach(async ({ request }) => control(request, 'reset'));

test('crear, editar y retirar tratamientos desde el listado conserva datos e historial', async ({
  page,
}) => {
  await page.goto('/login');
  await login(page);
  await page.goto('/admin/catalogo/servicios');
  const listUrl = page.url();
  await page.getByRole('button', { name: 'Añadir tratamiento', exact: true }).click();
  const modal = page.getByRole('dialog');
  await expect(
    modal.getByRole('heading', { name: 'Crear tratamiento', exact: true }),
  ).toBeVisible();
  await expect(modal.getByRole('button', { name: 'Cerrar tratamiento' })).toBeVisible();
  await expect(modal.getByRole('link', { name: 'Cancelar' })).toHaveCount(0);
  await modal.getByRole('button', { name: 'Guardar tratamiento', exact: true }).click();
  await expect(modal.getByRole('alert').filter({ hasText: 'Revisa' })).toBeVisible();
  await modal.locator('#field-nombre').fill('Tratamiento modal E2E');
  await modal.locator('#field-precio_base').fill('75.50');
  await modal.locator('#field-duracion_minutos').fill('45');
  await modal.locator('#field-visible_catalogo').check();
  await modal.locator('#field-reservable_online').check();
  await modal
    .getByRole('combobox', { name: 'Añadir persona', exact: true })
    .selectOption(String(fixture.agenda.professional));
  await modal.getByRole('button', { name: 'Guardar tratamiento', exact: true }).click();
  await expect(modal).toHaveCount(0);
  await expect(page).toHaveURL(listUrl);
  const row = page.getByRole('article', { name: 'Tratamiento modal E2E', exact: true });
  await expect(row).toContainText('75.50');
  const href = (await row.locator('a').first().getAttribute('href'))!;
  const id = href.split('/').at(-1)!;
  const initial = await (
    await page.request.get('/api/admin/catalogo/servicios/' + id + '/')
  ).json();
  expect(initial.precio_base).toBe('75.50');
  expect(initial.reservable_online).toBe(true);
  expect(initial.profesionales_ids).toEqual([fixture.agenda.professional]);

  await row
    .getByRole('button', { name: 'Editar tratamiento Tratamiento modal E2E', exact: true })
    .click();
  await expect(
    modal.getByRole('heading', { name: 'Editar tratamiento', exact: true }),
  ).toBeVisible();
  await expect(modal.locator('#field-precio_base')).toHaveValue('75.50');
  await expect(
    modal.getByRole('list', { name: 'Personas asignadas al tratamiento' }),
  ).toContainText('Agenda F6 E2E');
  await modal.locator('#field-precio_base').fill('80.25');
  await modal.getByRole('button', { name: 'Guardar tratamiento', exact: true }).click();
  await expect(modal).toHaveCount(0);
  await expect(row).toContainText('80.25');
  await row
    .getByRole('button', { name: 'Eliminar tratamiento Tratamiento modal E2E', exact: true })
    .click();
  await expect(modal).toContainText('Su historial se conserva');
  await modal.getByRole('button', { name: 'Cerrar diálogo' }).click();
  await expect(row).toBeVisible();
  await row
    .getByRole('button', { name: 'Eliminar tratamiento Tratamiento modal E2E', exact: true })
    .click();
  await modal.getByRole('button', { name: 'Eliminar', exact: true }).click();
  await expect(modal).toHaveCount(0);
  await expect(page.getByText('Tratamiento retirado del catálogo.', { exact: true })).toBeVisible();
  await expect(row).toHaveCount(0);
  const archived = await (
    await page.request.get('/api/admin/catalogo/servicios/' + id + '/')
  ).json();
  expect(archived.activo).toBe(false);
  expect(archived.visible_catalogo).toBe(false);
  expect(archived.precio_base).toBe('80.25');
  expect((await page.request.get('/api/catalogo/servicios/' + initial.slug + '/')).status()).toBe(
    404,
  );
  await page.locator('#catalog-active').selectOption('false');
  await expect(row).toBeVisible();
  await row
    .getByRole('button', { name: 'Activar tratamiento Tratamiento modal E2E', exact: true })
    .click();
  await expect(page.getByText('Tratamiento reactivado.', { exact: true })).toBeVisible();
  await expect(row).toHaveCount(0);
  await page.locator('#catalog-active').selectOption('true');
  await expect(row).toBeVisible();
  expect(
    (await (await page.request.get('/api/admin/catalogo/servicios/' + id + '/')).json()).activo,
  ).toBe(true);
  await page.locator('#catalog-active').selectOption('all');
  await expect(row).toBeVisible();
  const deactivate = row.getByRole('button', {
    name: 'Desactivar tratamiento Tratamiento modal E2E',
    exact: true,
  });
  await expect(deactivate.locator('bm-icon')).toHaveAttribute('name', 'power');
  await expect(deactivate).toHaveText('');
  await deactivate.click();
  await expect(row).toContainText('Inactivo');
  expect(
    (await (await page.request.get('/api/admin/catalogo/servicios/' + id + '/')).json()).activo,
  ).toBe(false);
  await row
    .getByRole('button', { name: 'Activar tratamiento Tratamiento modal E2E', exact: true })
    .click();
  await expect(
    row.getByRole('button', { name: 'Desactivar tratamiento Tratamiento modal E2E', exact: true }),
  ).toBeVisible();
  expect(
    (await (await page.request.get('/api/admin/catalogo/servicios/' + id + '/')).json()).activo,
  ).toBe(true);
});

test('modal adaptable, cierre con X y aviso de cambios sin guardar', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/login');
  await login(page);
  await page.goto('/admin/catalogo/servicios');
  await page.getByRole('button', { name: 'Añadir tratamiento', exact: true }).click();
  const modal = page.getByRole('dialog');
  await modal.locator('#field-nombre').fill('Borrador sin guardar');
  page.once('dialog', (dialog) => dialog.dismiss());
  await modal.getByRole('button', { name: 'Cerrar tratamiento' }).click();
  await expect(modal.locator('#field-nombre')).toHaveValue('Borrador sin guardar');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(
    (
      await new AxeBuilder({ page })
        .include('.cdk-overlay-container')
        .withTags(['wcag2a', 'wcag2aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
  page.once('dialog', (dialog) => dialog.accept());
  await page.screenshot({ path: '.artifacts/catalog-editor-mobile.png', animations: 'disabled' });
  await modal.press('Escape');
  await expect(modal).toHaveCount(0);
  expect(
    (
      await (
        await page.request.get('/api/admin/catalogo/servicios/?search=Borrador%20sin%20guardar')
      ).json()
    ).count,
  ).toBe(0);
});

test('lectura de tratamientos no concede botones de escritura', async ({ page }) => {
  await page.goto('/login');
  await login(page, 'agenda_manager');
  await page.goto('/admin/catalogo/servicios');
  await expect(page.getByRole('heading', { name: 'Tratamientos', exact: true })).toBeVisible();
  await expect(page.getByRole('article').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Añadir tratamiento' })).toHaveCount(0);
  await expect(page.locator('.catalog-row-actions')).toHaveCount(0);
});
