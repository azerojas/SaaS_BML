import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { control, login } from './helpers';

test('clientas: crear, ver, editar, eliminar y activar mantienen el listado abierto', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await control(page.request, 'reset');
  await page.goto('/login');
  await login(page);
  await page.goto('/admin/clientas');
  const url = page.url();
  await page.getByRole('button', { name: 'Nueva clienta', exact: true }).click();
  const create = page.getByRole('dialog', { name: 'Nueva clienta', exact: true });
  await create.locator('#field-nombres').fill('Clienta acciones');
  await create.locator('#field-apellidos').fill('Modal E2E');
  await create.locator('#field-telefono').fill('977321987');
  await create.getByRole('button', { name: 'Guardar clienta', exact: true }).click();
  await expect(create).toHaveCount(0);
  await expect(page).toHaveURL(url);
  await page.getByLabel('Buscar clientas', { exact: true }).fill('+51977321987');
  const row = page.getByRole('article', { name: 'Clienta acciones Modal E2E', exact: true });
  await expect(row).toBeVisible();
  await expect(row.getByRole('link')).toHaveCount(0);
  await expect(row.getByRole('button')).toHaveCount(3);
  await row.getByRole('button', { name: 'Ver', exact: true }).click();
  const profile = page.getByRole('dialog', { name: 'Ficha de la clienta', exact: true });
  await expect(
    profile.getByRole('heading', { name: 'Clienta acciones Modal E2E', exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(url);
  await profile.getByRole('button', { name: 'Cerrar ficha de la clienta', exact: true }).click();
  await expect(row.getByRole('button', { name: 'Ver', exact: true })).toBeFocused();
  await row.getByRole('button', { name: 'Editar', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Editar ficha', exact: true });
  await expect(editor.locator('#field-nombres')).toHaveValue('Clienta acciones');
  await editor.locator('#field-nombres').fill('Clienta editada');
  await editor.getByRole('button', { name: 'Guardar clienta', exact: true }).click();
  await expect(editor).toHaveCount(0);
  const updated = page.getByRole('article', { name: 'Clienta editada Modal E2E', exact: true });
  await expect(updated).toBeVisible();
  await expect(page).toHaveURL(url);
  await page.getByLabel('Estado', { exact: true }).selectOption('all');
  await updated.getByRole('button', { name: 'Eliminar', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: 'Eliminar clienta', exact: true });
  await expect(confirm.getByText(/Su ficha y su historial se conservan/)).toBeVisible();
  await confirm.getByRole('button', { name: 'Eliminar', exact: true }).click();
  await expect(updated.getByText('Inactiva', { exact: true })).toBeVisible();
  const id = await updated.getAttribute('data-client-id');
  expect((await (await page.request.get('/api/clientas/' + id + '/')).json()).activa).toBe(false);
  await updated.getByRole('button', { name: 'Activar', exact: true }).click();
  await expect(updated.getByText('Activa', { exact: true })).toBeVisible();
  expect((await (await page.request.get('/api/clientas/' + id + '/')).json()).activa).toBe(true);
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
    await expect(updated.getByRole('button', { name: 'Ver', exact: true })).toBeVisible();
  }
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({ path: '.artifacts/clientas-actions-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: '.artifacts/clientas-actions-mobile.png' });
});
