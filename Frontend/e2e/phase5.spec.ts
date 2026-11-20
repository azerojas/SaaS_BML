import { test, expect, Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { execFileSync } from 'node:child_process';
import { fixture, control, login, ReportingRole, backendPython } from './helpers';
const f = fixture.analytics;
const query = 'desde=2026-10-01&hasta=2026-11-01&granularidad=day&timezone=America%2FLima';
test.beforeEach(async ({ request }) => control(request, 'reset'));
async function enter(page: Page, role: ReportingRole = 'admin') {
  await page.goto('/login');
  await login(page, role);
}
async function range(page: Page, start = f.desde, end = f.hasta) {
  await page.getByLabel('Período', { exact: true }).selectOption('custom');
  await page.getByLabel('Desde (Lima)', { exact: true }).fill(start);
  await page.getByLabel('Hasta inclusive (Lima)', { exact: true }).fill(end);
  await page.getByRole('button', { name: 'Aplicar período', exact: true }).click();
}
test('dashboard real: ventas, caja conciliada, anticipo de otra fecha, descuentos, consumo y devolución', async ({
  page,
}) => {
  await enter(page);
  await range(page);
  const expected = {
    ventas_confirmadas: '95.00',
    cobros_registrados: '20.00',
    anticipos_recibidos: '0.00',
    dinero_recaudado: '17.00',
    saldo_pendiente: '46.00',
    costo_directo: '5.00',
    comisiones: '7.20',
    gastos_operativos: '7.00',
    utilidad_estimada: '68.80',
    ajustes_comerciales: '2.00',
    ventas_netas_ajustes: '93.00',
    salidas_conciliadas: '3.00',
  };
  const response = await page.request.get('/api/v1/analytics/overview/?' + query);
  expect(response.status()).toBe(200);
  const body = await response.json();
  for (const [key, value] of Object.entries(expected)) {
    expect(body.indicadores[key]).toBe(value);
    await expect(page.getByTestId('kpi-' + key)).toContainText(value);
  }
  expect(body.calidad.recaudacion_conciliada).toBe(true);
  expect(body.indicadores.numero_ventas).toBe(1);
  expect(body.indicadores.visitas_finalizadas).toBe(1);
  await page.locator('bm-dashboard-ranking').first().locator('summary').click();
  await expect(
    page.locator('bm-report-table').filter({ hasText: '=Tratamiento analitica F5' }),
  ).toBeVisible();
  await page.locator('bm-dashboard-ranking[data-report="top-clients"]').locator('summary').click();
  await expect(
    page.locator('bm-report-table').filter({ hasText: '=Clienta analitica F5' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Alertas actuales de inventario', exact: true }),
  ).toBeVisible();
  const inventory = await (
    await page.request.get('/api/v1/analytics/inventory-alerts/?' + query + '&page_size=100')
  ).json();
  expect(
    inventory.results.find((row: { articulo_id: number }) => row.articulo_id === f.material)
      .existencia,
  ).toBe('9.500');
  expect(
    await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage })),
  ).not.toContain('analitica F5');
  await page.screenshot({ path: '.artifacts/phase5-dashboard-desktop.png', fullPage: true });
});
test('todos los presets consultan fechas coherentes y la comparación mensual usa su contrato propio', async ({
  page,
}) => {
  await enter(page);
  for (const preset of ['day', 'week', 'last7', 'month', 'previousmonth']) {
    await page.getByLabel('Período', { exact: true }).selectOption(preset);
    const start = await page.getByLabel('Desde (Lima)', { exact: true }).inputValue();
    const end = await page.getByLabel('Hasta inclusive (Lima)', { exact: true }).inputValue();
    const responsePromise = page.waitForResponse(
      (response) =>
        response.url().includes('/analytics/overview/') &&
        new URL(response.url()).searchParams.get('desde') === start,
    );
    await page.getByRole('button', { name: 'Aplicar período', exact: true }).click();
    const response = await responsePromise;
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.periodo.desde).toBe(start);
    expect(body.periodo.hasta > end).toBe(true);
    expect(body.periodo.timezone).toBe('America/Lima');
  }
  await expect(page.locator('bm-month-comparison')).toBeVisible();
  await expect(page.locator('bm-month-comparison')).toContainText('No calculable');
  await range(page, '2000-01-01', '2000-01-02');
  await expect(page.getByTestId('kpi-numero_ventas')).toHaveText('0');
  await expect(page.getByTestId('kpi-dinero_recaudado')).toHaveText('No disponible');
  await expect(
    page.getByText('Sin ventas confirmadas en este período.', { exact: false }),
  ).toBeVisible();
});
const reports = [
  'overview',
  'revenue-series',
  'payment-methods',
  'top-services',
  'top-clients',
  'inventory-alerts',
  'expenses',
] as const;
for (const report of reports)
  test('Excel real seguro y filtros idénticos: ' + report, async ({ page }, testInfo) => {
    await enter(page);
    await page.goto('/admin/reportes');
    await page.getByLabel('Reporte', { exact: true }).selectOption(report);
    const exportButton = page.getByRole('button', { name: 'Exportar reporte Excel', exact: true });
    await expect(exportButton).toBeEnabled();
    const responsePromise = page.waitForResponse((response) =>
      response.url().includes('/reports/export.xlsx'),
    );
    const downloadPromise = page.waitForEvent('download');
    await exportButton.click();
    const response = await responsePromise;
    const download = await downloadPromise;
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    const params = new URL(response.url()).searchParams;
    expect(params.get('report')).toBe(report);
    const desde = params.get('desde')!;
    const hasta = params.get('hasta')!;
    await expect(page.locator('.report-period')).toContainText(desde);
    expect(params.has('page')).toBe(false);
    const end = new Date(hasta + 'T12:00:00Z');
    end.setUTCDate(end.getUTCDate() - 1);
    await expect(page.locator('.report-period')).toContainText(end.toISOString().slice(0, 10));
    expect(download.suggestedFilename()).toContain(desde + ' al ' + end.toISOString().slice(0, 10));
    expect(download.suggestedFilename()).not.toContain('_');
    const file = testInfo.outputPath(report + '.xlsx');
    await download.saveAs(file);
    const verification = JSON.parse(
      execFileSync(
        backendPython,
        [
          '-c',
          "import sys,json,zipfile,openpyxl; from datetime import date,timedelta; w=openpyxl.load_workbook(sys.argv[1],data_only=False); cells=[c for s in w for row in s for c in row]; assert all(c.data_type!='f' and c.hyperlink is None for c in cells); assert not any('externalLinks/' in p for p in zipfile.ZipFile(sys.argv[1]).namelist()); expected='Del '+date.fromisoformat(sys.argv[2]).strftime('%d/%m/%Y')+' al '+(date.fromisoformat(sys.argv[3])-timedelta(days=1)).strftime('%d/%m/%Y'); assert w['Resumen']['A2'].value==expected; assert all('_' not in str(c.value) for s in w for c in s[4]); assert '+51955123555' not in [str(c.value) for c in cells]; print(json.dumps({'sheets':w.sheetnames}))",
          file,
          desde,
          hasta,
        ],
        { encoding: 'utf8', windowsHide: true },
      ),
    );
    expect(verification.sheets).toHaveLength(report === 'overview' ? 6 : 3);
  });
test('permisos separados: resumen no revela clientas ni inventario y no concede exportación', async ({
  page,
}) => {
  await enter(page, 'summary');
  await expect(page.locator('bm-dashboard-analytics')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Clientas destacadas', exact: true })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole('heading', { name: 'Alertas actuales de inventario', exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Exportar resumen Excel' })).toHaveCount(0);
  expect((await page.request.get('/api/v1/analytics/top-clients/?' + query)).status()).toBe(403);
  expect((await page.request.get('/api/v1/analytics/inventory-alerts/?' + query)).status()).toBe(
    403,
  );
  expect(
    (await page.request.get('/api/v1/reports/export.xlsx?report=overview&' + query)).status(),
  ).toBe(403);
});
for (const role of ['clients', 'inventory'] as const)
  test(
    'reportes con permiso específico sin acceso financiero general: ' + role,
    async ({ page }) => {
      await enter(page, role);
      await expect(page.locator('bm-dashboard-analytics')).toHaveCount(0);
      await page.goto('/admin/reportes');
      await expect(page.getByLabel('Reporte', { exact: true }).locator('option')).toHaveCount(1);
      await range(page);
      await expect(page.locator('bm-report-table')).toBeVisible();
      expect((await page.request.get('/api/v1/analytics/overview/?' + query)).status()).toBe(403);
    },
  );
test('invitado y staff sin permisos no pueden consultar indicadores ni abrir reportes', async ({
  page,
}) => {
  expect((await page.request.get('/api/v1/analytics/overview/?' + query)).status()).toBe(403);
  await page.goto('/admin/reportes');
  await expect(page).toHaveURL(/login/);
  await login(page, 'limited');
  await expect(page.locator('bm-dashboard-analytics')).toHaveCount(0);
  await page.goto('/admin/reportes');
  await expect(page).toHaveURL(/acceso-denegado/);
});
test('error parcial de red conserva otros widgets y permite reintentar solo la consulta fallida', async ({
  page,
}) => {
  await page.route('**/api/v1/analytics/overview/**', (route) => route.abort('failed'));
  await enter(page);
  const panel = page
    .locator('bm-report-panel')
    .filter({ has: page.getByRole('heading', { name: 'Indicadores principales', exact: true }) });
  await expect(panel.getByRole('alert')).toBeVisible();
  await expect(page.locator('bm-dashboard-trend')).toBeVisible();
  await page.unroute('**/api/v1/analytics/overview/**');
  await panel
    .getByRole('button', { name: 'Reintentar Indicadores principales', exact: true })
    .click();
  await expect(page.getByTestId('dashboard-kpi-ventas_confirmadas')).toBeVisible();
});
test('errores JSON de exportación, límite real y sesión caducada no descargan archivos falsos', async ({
  page,
  request,
}) => {
  await enter(page, 'exporter');
  await page.goto('/admin/reportes');
  await range(page);
  await expect(page.getByRole('button', { name: 'Exportar reporte Excel' })).toBeEnabled();
  for (let index = 0; index < 5; index++)
    expect(
      (await page.request.get('/api/v1/reports/export.xlsx?report=overview&' + query)).status(),
    ).toBe(200);
  await page.getByRole('button', { name: 'Exportar reporte Excel' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'demasiados intentos' })).toBeVisible();
  await control(request, 'expire');
  await page.getByRole('button', { name: 'Exportar reporte Excel' }).click();
  await expect(page).toHaveURL(/login/);
});
for (const width of [390, 820, 1440])
  test('dashboard y reportes responsive y accesibles: ' + width, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await enter(page);
    await range(page);
    await expect(page.getByTestId('kpi-ventas_confirmadas')).toContainText('95.00');
    for (const path of ['/admin', '/admin/reportes']) {
      if (path === '/admin/reportes') {
        await page.goto(path);
        await page.getByLabel('Reporte', { exact: true }).selectOption('revenue-series');
        await range(page);
        await expect(page.locator('bm-dashboard-trend')).toHaveCount(0);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      const result = await new AxeBuilder({ page }).analyze();
      expect(
        result.violations.filter((item) => ['serious', 'critical'].includes(item.impact ?? '')),
      ).toEqual([]);
    }
    if (width !== 1440)
      await page.screenshot({
        path: '.artifacts/phase5-reports-' + width + '.png',
        fullPage: true,
      });
  });
