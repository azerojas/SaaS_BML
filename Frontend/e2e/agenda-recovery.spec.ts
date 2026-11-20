import { randomUUID } from 'node:crypto';
import { test, expect, Page } from '@playwright/test';
import { fixture, control, login } from './helpers';

test.beforeEach(async ({ request }) => control(request, 'reset'));

async function restorePending(page: Page, key: string) {
  const user = await (await page.request.get('/api/auth/me/')).json();
  await page.evaluate(
    ({ actor, key }) => {
      sessionStorage.setItem(
        'lasheo.agenda.' + actor,
        JSON.stringify({
          key,
          path: '/api/v1/agenda/horarios/',
          method: 'POST',
          digest: 'a'.repeat(64),
        }),
      );
    },
    { actor: user.id, key },
  );
  await page.goto('/admin/agenda/profesionales');
}

test('resolver un intento sin cambios permite guardar el horario con una clave nueva', async ({
  page,
}) => {
  await page.goto('/login');
  await login(page, 'admin');
  const key = randomUUID();
  await restorePending(page, key);
  await page.getByRole('button', { name: 'Resolver operación pendiente', exact: true }).click();
  await expect(
    page.getByText('El intento anterior no realizó cambios y quedó cerrado.', { exact: false }),
  ).toBeVisible();
  const professional = await (
    await page.request.get('/api/v1/agenda/profesionales/' + fixture.agenda.professional + '/')
  ).json();
  await page
    .getByRole('button', {
      name: professional.nombres + ' ' + professional.apellidos + ' · Activa',
      exact: true,
    })
    .click();
  await page.getByRole('combobox', { name: 'Día de semana', exact: true }).selectOption('7');
  await page.getByLabel('Hora de inicio', { exact: true }).fill('08:00');
  await page.getByLabel('Hora de fin', { exact: true }).fill('09:00');
  const saved = page.waitForResponse(
    (response) =>
      response.url().endsWith('/agenda/horarios/') && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Guardar horario', exact: true }).click();
  const response = await saved;
  expect(response.status()).toBe(201);
  expect(response.request().headers()['idempotency-key']).not.toBe(key);
  await expect(
    page.getByRole('button', { name: 'Resolver operación pendiente', exact: true }),
  ).toHaveCount(0);
});
