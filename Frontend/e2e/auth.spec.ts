import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { fixture, control, login, firstFactor, totp } from './helpers';
test.beforeEach(async ({ request }) => {
  await control(request, 'reset');
});

test('sesión MFA vencida vuelve al login y permite verificar un acceso nuevo', async ({
  page,
  request,
}) => {
  await page.goto('/login');
  await firstFactor(page);
  await control(request, 'expire');
  await page.getByLabel('Código de verificación').fill(totp(fixture.users.admin.totp_secret));
  await page.getByRole('button', { name: 'Verificar y entrar' }).click();
  await expect(page.getByRole('button', { name: 'Entrar a mi espacio' })).toBeVisible();
  await expect(page.getByText('La sesión de verificación venció.', { exact: false })).toBeVisible();
  await firstFactor(page);
  await page.getByLabel('Código de verificación').fill(totp(fixture.users.admin.totp_secret));
  await page.getByRole('button', { name: 'Verificar y entrar' }).click();
  await expect(page).toHaveURL(/\/admin/);
});

test('login real MFA, permiso recibido, refresh, cookies y logout remoto', async ({
  page,
  context,
}) => {
  await page.goto('/login');
  const post = page.waitForRequest(
    (request) => request.url().endsWith('/api/auth/login/') && request.method() === 'POST',
  );
  await login(page);
  expect((await post).headers()['x-csrftoken']).toBeTruthy();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Equipo de prueba E2E');
  const me = await page.request.get('/api/auth/me/');
  expect(me.status()).toBe(200);
  expect((await me.json()).permissions).toContain('negocio.view_clientas');
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Equipo de prueba E2E');
  const cookies = await context.cookies();
  const session = cookies.find((cookie) => cookie.name === 'sessionid')!;
  expect(session.secure).toBe(true);
  expect(session.httpOnly).toBe(true);
  expect(session.sameSite).toBe('Lax');
  expect(
    await page.evaluate(() => ({
      local: Object.keys(localStorage),
      session: Object.keys(sessionStorage),
    })),
  ).toEqual({ local: [], session: [] });
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Cerrar sesión', exact: true })
    .click();
  await expect(page).toHaveURL(/\/login$/);
  expect((await page.request.get('/api/auth/me/')).status()).toBe(403);
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/login/);
});

test('contraseña incorrecta y usuario no staff no obtienen sesión', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Usuario', { exact: true }).fill('cuenta_que_no_existe');
  await page.getByLabel('Contraseña', { exact: true }).fill('Clave-invalida-para-E2E');
  await page.getByRole('button', { name: 'Entrar a mi espacio' }).click();
  await expect(page.getByRole('alert')).toContainText('No pudimos validar');
  await page.getByLabel('Usuario', { exact: true }).fill(fixture.users.regular.username);
  await page.getByLabel('Contraseña', { exact: true }).fill(fixture.users.regular.password);
  await page.getByRole('button', { name: 'Entrar a mi espacio' }).click();
  await expect(page.getByRole('alert')).toContainText('No pudimos validar');
  expect((await page.request.get('/api/auth/me/')).status()).toBe(403);
});

test('CSRF se verifica incluso en login anónimo', async ({ page }) => {
  await page.goto('/login');
  const response = await page.request.post('/api/auth/login/', {
    data: { username: fixture.users.admin.username, password: fixture.users.admin.password },
    headers: { Origin: 'https://localhost:4443' },
  });
  expect(response.status()).toBe(403);
  expect((await response.json()).code).toBe('csrf');
});

test('MFA inválido no concede acceso y admite recuperación real', async ({ page }) => {
  await page.goto('/login');
  await firstFactor(page);
  const forbidden = new Set(
    [-1, 0, 1].map((offset) => totp(fixture.users.admin.totp_secret, offset)),
  );
  let invalid = '000000';
  while (forbidden.has(invalid)) invalid = (Number(invalid) + 1).toString().padStart(6, '0');
  await page.getByLabel('Código de verificación').fill(invalid);
  await page.getByRole('button', { name: 'Verificar y entrar' }).click();
  await expect(page.getByRole('alert')).toContainText('código no es válido');
  expect((await page.request.get('/api/auth/me/')).status()).toBe(403);
  await page.getByRole('button', { name: 'Usar un código de recuperación', exact: true }).click();
  await page
    .getByLabel('Código de recuperación', { exact: true })
    .fill(fixture.users.admin.recovery_code);
  await page.getByRole('button', { name: 'Verificar y entrar' }).click();
  await expect(page).toHaveURL(/\/admin$/);
});

test('guard preserva retorno seguro y abre clientas reales', async ({ page }) => {
  await page.goto('/admin/clientas');
  await expect(page).toHaveURL(/returnUrl=/);
  await login(page);
  await expect(page).toHaveURL(/\/admin\/clientas$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Clientas');
});

test('un returnUrl externo nunca abandona el origen', async ({ page }) => {
  await page.goto('/login?returnUrl=%2F%2Fevil.example');
  await login(page);
  await expect(page).toHaveURL('https://localhost:4443/admin');
});

test('staff sin permisos recibe rechazo Django y conserva acceso al inicio', async ({ page }) => {
  await page.goto('/login');
  await login(page, 'limited');
  const response = await page.request.get('/api/clientas/');
  expect(response.status()).toBe(403);
  expect((await response.json()).code).toBe('permission_denied');
  await page.goto('/admin/clientas');
  await expect(page).toHaveURL(/acceso-denegado/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('necesita otro permiso');
  await page.getByRole('link', { name: 'Volver al inicio' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Hola,');
});

test('sesión eliminada en Django se detecta al refrescar', async ({ page, request }) => {
  await page.goto('/login');
  await login(page);
  await control(request, 'expire');
  await page.reload();
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole('heading', { name: 'Qué bueno verte de nuevo.' })).toBeVisible();
});

test('red caída durante logout no se anuncia como cierre remoto exitoso', async ({
  page,
  context,
}) => {
  await page.goto('/login');
  await login(page);
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
  await context.setOffline(true);
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Cerrar sesión', exact: true })
    .click();
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole('alert')).toContainText('No pudimos confirmar');
  await context.setOffline(false);
  await page.getByRole('button', { name: 'Reintentar cierre de sesión' }).click();
  await expect(page.getByRole('button', { name: 'Reintentar cierre de sesión' })).toHaveCount(0);
  expect((await page.request.get('/api/auth/me/')).status()).toBe(403);
});

test('límite real de intentos muestra 429 sin bucles ni doble envío', async ({ page, request }) => {
  await control(request, 'throttle');
  await page.goto('/login');
  for (let n = 0; n < 2; n++) {
    await page.getByLabel('Usuario', { exact: true }).fill('test-limite');
    await page.getByLabel('Contraseña', { exact: true }).fill('Intento incorrecto');
    await page.getByRole('button', { name: 'Entrar a mi espacio' }).click();
    await expect(page.getByRole('alert')).toBeVisible();
  }
  await expect(page.getByRole('alert')).toContainText('demasiados intentos');
});

test('layout público no requiere cuenta ni revela el área privada', async ({ page }) => {
  await page.goto('/registro/token-reservado');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Qué gusto recibirte');
  await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toHaveCount(0);
  await expect(page.getByLabel('Usuario', { exact: true })).toHaveCount(0);
});

for (const width of [320, 390, 768, 1440])
  test('responsive y accesibilidad a ' + width + 'px', async ({ page }) => {
    const browserErrors: string[] = [];
    page.on('console', (message) => {
      if (
        message.type() === 'error' &&
        !/^Failed to load resource: the server responded with a status of 403/.test(message.text())
      )
        browserErrors.push(message.text());
    });
    page.on('pageerror', (error) => browserErrors.push(error.message));
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/login');
    await expect(
      page.getByRole('heading', { name: 'Qu\u00e9 bueno verte de nuevo.' }),
    ).toBeVisible();
    await expect(page.locator('.skip-link')).toHaveCSS('position', 'fixed');
    expect(browserErrors).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    if (width === 1440 || width === 390)
      await page.screenshot({ path: '.artifacts/login-' + width + '.png', fullPage: true });
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([]);
    await login(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    if (width <= 760) {
      await page.getByRole('button', { name: 'Abrir menú' }).click();
      await expect(page.getByRole('dialog', { name: 'Menú de navegación' })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog', { name: 'Menú de navegación' })).toHaveCount(0);
    }
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([]);
    if (width === 1440)
      await page.screenshot({ path: '.artifacts/dashboard-desktop.png', fullPage: true });
    if (width === 390)
      await page.screenshot({ path: '.artifacts/dashboard-mobile.png', fullPage: true });
  });

test('formulario accesible por teclado y error de campo', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Usuario', { exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Este campo es obligatorio.').first()).toBeVisible();
  await page.getByLabel('Usuario', { exact: true }).fill(fixture.users.admin.username);
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Contrase\u00f1a', { exact: true })).toBeFocused();
  await page.keyboard.type(fixture.users.admin.password);
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('C\u00f3digo de verificaci\u00f3n')).toBeVisible();
  await page.getByLabel('C\u00f3digo de verificaci\u00f3n').focus();
  await page.keyboard.type(totp(fixture.users.admin.totp_secret));
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/admin$/);
});
