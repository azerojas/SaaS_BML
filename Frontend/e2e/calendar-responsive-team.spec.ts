import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { control, fixture, login } from './helpers';

test.use({ hasTouch: true, isMobile: true });
test('calendario personal inicial, equipo de consulta y vistas móviles sin desplazamiento horizontal', async ({
  page,
}) => {
  test.setTimeout(90000);
  await control(page.request, 'reset');
  await page.goto('/login');
  await login(page);
  await page.goto('/admin/agenda');
  await expect(page.getByRole('button', { name: 'Mi calendario', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('button', { name: 'Publicar mis cupos', exact: true })).toHaveCount(
    0,
  );
  await expect(page.getByRole('button', { name: 'Mis cupos del día', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Calendario del equipo', exact: true }).click();
  await page.getByLabel('Fecha del calendario', { exact: true }).fill(fixture.agenda.date);
  await page.getByRole('button', { name: 'Día', exact: true }).click();
  await expect(page.locator('.calendar-event').first()).toBeVisible();
  await page.locator('.calendar-event').first().click();
  const preview = page.getByRole('dialog', { name: 'Detalle de cita', exact: true });
  await expect(preview).toBeVisible();
  await expect(preview.getByRole('button', { name: 'Cambiar horario', exact: true })).toHaveCount(
    0,
  );
  await expect(
    preview.getByRole('link', { name: 'Abrir ficha de la cita', exact: true }),
  ).toHaveCount(0);
  await preview.getByRole('button', { name: 'Cerrar', exact: true }).click();
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 375, height: 667 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
    { width: 440, height: 956 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport);
    expect((await page.locator('.calendar-scope-switch').boundingBox())!.height).toBeGreaterThanOrEqual(54);
    expect((await page.getByRole('button', { name: 'Calendario del equipo', exact: true }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
    for (const view of ['Día', 'Semana', 'Mes']) {
      await page.getByRole('button', { name: view, exact: true }).click();
      await expect(page.locator('.calendar-page.compact-calendar')).toBeVisible();
      const grid = page.locator(view === 'Mes' ? '.month-grid' : '.time-body');
      await expect(grid).toBeVisible();
      const bounds = await grid.boundingBox();
      expect(bounds!.width).toBeLessThanOrEqual(viewport.width);
      expect(await grid.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      ).toBe(true);
      if (view === 'Semana') {
        await expect(page.locator('.mobile-week button')).toHaveCount(7);
        await expect(page.locator('.day-column')).toHaveCount(1);
        await page.locator('.mobile-week button').last().click();
        await expect(page.locator('.mobile-week button').last()).toHaveAttribute(
          'aria-pressed',
          'true',
        );
      }
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    (document.activeElement as HTMLElement)?.blur();
    window.scrollTo(0, 0);
  });
  expect(
    (
      await new AxeBuilder({ page })
        .include('main')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.screenshot({ path: '.artifacts/calendar-team-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Mi calendario', exact: true }).click();
  await expect(page.getByLabel('Filtrar por especialista')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /^Mis fechas y citas/ })).toBeVisible();
});
