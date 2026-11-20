import { test, expect } from '@playwright/test';
import { control, login } from './helpers';

const photos = [
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAMCAIAAADkharWAAAAGElEQVR4nGP8z0AaYCJRPcOoBmLAcAglAGavARduQJjLAAAAAElFTkSuQmCC',
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAMCAIAAADkharWAAAAGklEQVR4nGNkYPjPQApgIkk1w6gG4sBwCFYAZLEBF7/CHPgAAAAASUVORK5CYII=',
];

test.beforeEach(async ({ request }) => control(request, 'reset'));

test('subir y cambiar la foto conserva el tratamiento y publica una imagen real', async ({
  page,
  request,
}) => {
  await page.goto('/login');
  await login(page);
  await page.goto('/admin/catalogo/servicios');
  await page.getByRole('button', { name: 'Añadir tratamiento', exact: true }).click();
  const modal = page.getByRole('dialog');
  await modal.locator('#field-nombre').fill('Tratamiento con foto');
  await modal.locator('#field-precio_base').fill('85');
  await modal.locator('#field-visible_catalogo').check();
  await modal.locator('#treatment-photo').setInputFiles({
    name: 'foto.png',
    mimeType: 'image/png',
    buffer: Buffer.from(photos[0], 'base64'),
  });
  await expect(modal.getByAltText('Foto del tratamiento')).toHaveAttribute(
    'src',
    /^data:image\/png/,
  );
  await modal.getByRole('button', { name: 'Guardar tratamiento', exact: true }).click();
  await expect(modal).toHaveCount(0);
  const row = page.getByRole('article', { name: 'Tratamiento con foto', exact: true });
  await expect(row.locator('.catalog-thumbnail')).toBeVisible();
  await expect
    .poll(() =>
      row.locator('.catalog-thumbnail').evaluate((img: HTMLImageElement) => img.naturalWidth),
    )
    .toBeGreaterThan(0);
  const href = (await row.locator('a').first().getAttribute('href'))!;
  const id = href.split('/').at(-1)!;
  const initial = await (
    await page.request.get('/api/admin/catalogo/servicios/' + id + '/')
  ).json();
  expect(initial.imagen_principal).toMatch(/^\/api\/catalogo\/fotos\/[a-f0-9]{32}\.jpg$/);
  const image = await request.get(initial.imagen_principal);
  expect(image.status()).toBe(200);
  expect(image.headers()['content-type']).toBe('image/jpeg');
  expect((await image.body()).subarray(0, 2).toString('hex')).toBe('ffd8');

  await row
    .getByRole('button', { name: 'Editar tratamiento Tratamiento con foto', exact: true })
    .click();
  await expect(modal.getByAltText('Foto del tratamiento')).toHaveAttribute(
    'src',
    initial.imagen_principal,
  );
  // A second valid image, with a different color, must replace the principal photo.
  await modal.locator('#treatment-photo').setInputFiles({
    name: 'nueva.png',
    mimeType: 'image/png',
    buffer: Buffer.from(photos[1], 'base64'),
  });
  await modal.getByRole('button', { name: 'Guardar tratamiento', exact: true }).click();
  await expect(modal).toHaveCount(0);
  const updated = await (
    await page.request.get('/api/admin/catalogo/servicios/' + id + '/')
  ).json();
  expect(updated.id).toBe(initial.id);
  expect(updated.imagen_principal).not.toBe(initial.imagen_principal);
  expect((await request.get(updated.imagen_principal)).status()).toBe(200);
  await row
    .getByRole('button', { name: 'Editar tratamiento Tratamiento con foto', exact: true })
    .click();
  await modal.locator('#field-precio_base').fill('90');
  await modal.getByRole('button', { name: 'Guardar tratamiento', exact: true }).click();
  await expect(modal).toHaveCount(0);
  expect(
    (await (await page.request.get('/api/admin/catalogo/servicios/' + id + '/')).json())
      .imagen_principal,
  ).toBe(updated.imagen_principal);
});

test('rechaza archivos que no sean fotos antes de guardar', async ({ page }) => {
  await page.goto('/login');
  await login(page);
  await page.goto('/admin/catalogo/servicios');
  await page.getByRole('button', { name: 'Añadir tratamiento', exact: true }).click();
  const modal = page.getByRole('dialog');
  await modal.locator('#treatment-photo').setInputFiles({
    name: 'archivo.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from('<svg/>'),
  });
  await expect(modal.getByRole('alert')).toContainText(/JPG|PNG|WebP/);
  await expect(modal.getByAltText('Foto del tratamiento')).toHaveCount(0);
});
