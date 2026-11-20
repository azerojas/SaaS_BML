import { HomeSummary } from './home-summary';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { describe, it, expect, vi } from 'vitest';
import { DashboardFacade } from './dashboard-facade';
import { ReportsFacade } from './reports-facade';
import { AnalyticsApi } from '../infrastructure/analytics-api';
import { ReportDownload } from '../infrastructure/report-download';
import { SessionStore } from '../../../core/auth/application/session-store';
import { envelopeFixture, overviewFixture, seriesFixture } from '../tests/fixtures';
const filters = {
  preset: 'custom' as const,
  desde: '2026-10-01',
  hasta: '2026-10-31',
  granularidad: 'day' as const,
};
function configure(permissions: string[]) {
  const api = {
    overview: vi.fn(() => of(overviewFixture())),
    series: vi.fn(() => of(seriesFixture())),
    methods: vi.fn(() => of({ ...envelopeFixture, results: [], componentes_separados: true })),
    table: vi.fn(() =>
      of({
        ...envelopeFixture,
        results: [],
        count: 0,
        total_grupos: 0,
        next: null,
        previous: null,
      }),
    ),
    comparison: vi.fn(() => of({})),
  };
  const download = { busy: signal(false), save: vi.fn(() => Promise.resolve()) };
  TestBed.configureTestingModule({
    providers: [
      HomeSummary,
      DashboardFacade,
      ReportsFacade,
      { provide: AnalyticsApi, useValue: api },
      { provide: ReportDownload, useValue: download },
      {
        provide: SessionStore,
        useValue: { hasPermission: (key: string) => permissions.includes(key) },
      },
    ],
  });
  return { api, download };
}
describe('facades y permisos de reportes', () => {
  it('mantiene el gráfico general con el mismo período sin repetir su consulta al seleccionar reportes', () => {
    const { api } = configure(['reporting.view_summary']);
    const facade = TestBed.inject(ReportsFacade);
    facade.select('expenses');
    facade.apply(filters);
    expect(api.overview).toHaveBeenCalledTimes(1);
    expect(api.overview).toHaveBeenCalledWith(
      expect.objectContaining({ desde: '2026-10-01', hasta: '2026-11-01' }),
    );
    expect(facade.overview.data()).toEqual(overviewFixture());
    facade.select('payment-methods');
    expect(api.overview).toHaveBeenCalledTimes(1);
    facade.apply({ ...filters, desde: '2026-10-02' });
    expect(api.overview).toHaveBeenCalledTimes(2);
  });
  it('no consulta el gráfico financiero general con permisos exclusivos de inventario', () => {
    const { api } = configure(['reporting.view_inventory']);
    const facade = TestBed.inject(ReportsFacade);
    facade.apply(filters);
    expect(api.overview).not.toHaveBeenCalled();
    expect(api.table).toHaveBeenCalledWith('inventory-alerts', expect.any(Object));
  });
  it('el inicio consulta indicadores y graficos sin cargar desgloses de Finanzas', () => {
    const { api, download } = configure(['reporting.view_summary']);
    const home = TestBed.inject(HomeSummary);
    home.apply(filters);
    expect(api.overview).toHaveBeenCalledWith(
      expect.objectContaining({ desde: '2026-10-01', hasta: '2026-11-01' }),
    );
    expect(api.series).toHaveBeenCalledWith(expect.objectContaining({ desde: filters.desde }));
    expect(api.methods).toHaveBeenCalledWith(expect.objectContaining({ desde: filters.desde }));
    expect(api.table).not.toHaveBeenCalled();
    expect(api.comparison).not.toHaveBeenCalled();
    expect(download.save).not.toHaveBeenCalled();
  });
  it('un filtro único controla los widgets sin solicitar clientas ni inventario no autorizados', () => {
    const { api } = configure(['reporting.view_summary']);
    const facade = TestBed.inject(DashboardFacade);
    facade.apply(filters);
    expect(api.overview).toHaveBeenCalledWith(
      expect.objectContaining({
        desde: '2026-10-01',
        hasta: '2026-11-01',
      }),
    );
    expect(api.table).toHaveBeenCalledTimes(2);
    expect(api.table).toHaveBeenNthCalledWith(1, 'top-services', expect.any(Object));
    expect(api.table).toHaveBeenNthCalledWith(2, 'expenses', expect.any(Object));
    expect(api.comparison).not.toHaveBeenCalled();
  });
  it('solo expone rankings privados al usuario con el permiso de clientas', () => {
    const { api } = configure(['reporting.view_clients']);
    const facade = TestBed.inject(ReportsFacade);
    facade.reload();
    expect(facade.available).toEqual(['top-clients']);
    expect(api.overview).not.toHaveBeenCalled();
    facade.select('overview');
    expect(facade.selected()).toBe('top-clients');
  });
  it('el Excel conserva rango/orden/límite y elimina únicamente la paginación', async () => {
    const { download } = configure(['reporting.view_summary', 'reporting.export']);
    const facade = TestBed.inject(ReportsFacade);
    facade.select('top-services');
    facade.apply(filters);
    facade.changePage(3);
    await facade.export();
    expect(download.save).toHaveBeenCalledWith('top-services', {
      desde: '2026-10-01',
      hasta: '2026-11-01',
      granularidad: 'day',
      timezone: 'America/Lima',
      orden: 'importe',
      limit: 100,
    });
  });
});
