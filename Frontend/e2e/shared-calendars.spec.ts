import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { login, control, fixture } from './helpers';

const cases = [
  ['/admin/clientas/nueva', 'Fecha de nacimiento'],
  ['/admin/compras', 'Compras desde'],
  ['/admin/inventario/movimientos', 'Desde'],
  ['/admin/visitas', 'Desde'],
  ['/admin/ventas', 'Desde'],
  ['/admin/llegadas', 'Desde'],
  ['/admin/reportes', 'Desde (Lima)'],
  ['/admin/agenda/bloqueos', 'Inicio del bloqueo (Lima)'],
] as const;
test.beforeEach(async ({ request }) => control(request, 'reset'));
for (const [path, label] of cases)
  test('calendario compartido estable: ' + path, async ({ page }) => {
    await page.goto('/login');
    await login(page, 'admin');
    await page.goto(path);
    await page.setViewportSize({ width: 390, height: 844 });
    if (path === '/admin/reportes') {
      await expect(page.getByLabel('Desde (Lima)', { exact: true })).toHaveAttribute(
        'readonly',
        '',
      );
      await expect(
        page
          .locator('bm-date-field')
          .filter({ has: page.getByLabel(label, { exact: true }) })
          .getByRole('button'),
      ).toBeDisabled();
      await page.getByLabel('Período', { exact: true }).selectOption('custom');
    }
    const field = page.getByLabel(label, { exact: true });
    const dateTime = label.startsWith('Inicio del bloqueo');
    await field.fill('2027-02-01' + (dateTime ? 'T13:45' : ''));
    const calendarField = page.locator('bm-date-field').filter({ has: field });
    await calendarField.getByRole('button', { name: 'Abrir calendario', exact: true }).click();
    const popup = page.locator('.agenda-date-panel');
    await expect(popup).toBeVisible();
    const initial = (await popup.boundingBox())!;
    expect(initial.width).toBeCloseTo(304, 0);
    expect(initial.height).toBeCloseTo(384, 0);
    await popup.locator('.mat-calendar-next-button').click();
    await expect(popup.locator('.mat-calendar-period-button')).toContainText('MARZO');
    const next = (await popup.boundingBox())!;
    expect(next.width).toBe(initial.width);
    expect(next.height).toBe(initial.height);
    await popup.locator('.mat-calendar-body-cell-content').getByText('15', { exact: true }).click();
    await expect(popup).toHaveCount(0);
    await expect(field).toHaveValue('2027-03-15' + (dateTime ? 'T13:45' : ''));
    if (path === '/admin/visitas') {
      await expect(page.getByRole('button', { name: 'Aplicar fechas', exact: true })).toHaveCount(
        0,
      );
      for (const [label, date, desde, hasta] of [
        ['Hasta', '2027-03-31', '2027-03-15', '2027-03-31'],
        ['Desde', '2027-03-16', '2027-03-16', '2027-03-31'],
      ]) {
        const refreshed = page.waitForResponse((response) => {
          const url = new URL(response.url());
          return (
            url.pathname === '/api/visitas/' &&
            url.searchParams.get('desde') === desde &&
            url.searchParams.get('hasta') === hasta &&
            url.searchParams.get('page_size') === '20'
          );
        });
        await page.getByLabel(label, { exact: true }).fill(date);
        expect((await refreshed).status()).toBe(200);
      }
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    if (dateTime) {
      await expect(field).toBeFocused();
      expect(
        (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
      ).toEqual([]);
      await page.screenshot({ path: '.artifacts/shared-calendar-datetime.png', fullPage: true });
    }
  });

test('reservas públicas usan el mismo calendario y respetan fechas pasadas', async ({
  page,
  request,
}) => {
  await control(request, 'booking-mode');
  await page.goto('/reservar');
  const field = page.getByLabel('Fecha', { exact: true });
  await field.fill('2027-02-01');
  await page
    .locator('bm-date-field')
    .getByRole('button', { name: 'Abrir calendario', exact: true })
    .click();
  const popup = page.locator('.agenda-date-panel');
  await expect(popup).toBeVisible();
  expect((await popup.boundingBox())!.height).toBeCloseTo(384, 0);
  await popup.locator('.mat-calendar-body-cell-content').getByText('15', { exact: true }).click();
  await expect(field).toHaveValue('2027-02-15');
  await page.getByRole('checkbox', { name: /Servicio agenda F6 E2E/ }).check();
  await page
    .getByRole('combobox', { name: 'Profesional', exact: true })
    .selectOption(String(fixture.agenda.professional));
  const search = page.getByRole('button', { name: 'Ver horarios', exact: true });
  await expect(search).toBeEnabled();
  await field.fill('2000-01-01');
  await expect(search).toBeDisabled();
  await field.fill('2027-02-31');
  await expect(search).toBeDisabled();
  await field.fill('2027-02-15');
  await expect(search).toBeEnabled();
});
