import { TestBed } from '@angular/core/testing';
import { HttpHeaders, HttpResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReportDownload, reportFilename, XLSX_MIME } from './report-download';
import { AnalyticsApi } from './analytics-api';
import { ApiFailure } from '../../../core/http/api-failure';
describe('descarga XLSX segura y efímera', () => {
  const query = { desde: '2026-10-01', hasta: '2026-11-01' };
  let api: { export: ReturnType<typeof vi.fn> };
  beforeEach(() => {
    api = { export: vi.fn() };
    TestBed.configureTestingModule({
      providers: [ReportDownload, { provide: AnalyticsApi, useValue: api }],
    });
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  it('usa nombre derivado de filtros ante un filename ajeno o una ruta peligrosa', () => {
    expect(reportFilename('attachment; filename="../../private.xlsx"', 'overview', query)).toBe(
      'beauty_manager_reporte_overview_2026-10-01_2026-11-01.xlsx',
    );
    expect(reportFilename(null, 'top-clients', query)).toBe(
      'beauty_manager_reporte_top-clients_2026-10-01_2026-11-01.xlsx',
    );
  });
  it('rechaza HTML o JSON presentado como archivo exitoso', async () => {
    api.export.mockReturnValue(
      of(
        new HttpResponse({
          body: new Blob(['<html>error</html>']),
          headers: new HttpHeaders({ 'Content-Type': 'text/html' }),
        }),
      ),
    );
    const download = TestBed.inject(ReportDownload);
    await download.save('overview', query);
    expect(download.error()).toContain('archivo Excel válido');
    expect(download.success()).toBeNull();
  });
  it('revoca el objectURL y elimina el enlace después de iniciar una descarga válida', async () => {
    vi.useFakeTimers();
    const create = vi.fn(() => 'blob:test-only');
    const revoke = vi.fn();
    const NativeURL = URL;
    vi.stubGlobal(
      'URL',
      class extends NativeURL {
        static override createObjectURL = create;
        static override revokeObjectURL = revoke;
      },
    );
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const blob = new Blob(['PK0000']);
    Object.defineProperty(blob, 'slice', {
      value: () => ({ arrayBuffer: async () => new Uint8Array([80, 75, 3, 4]).buffer }),
    });
    api.export.mockReturnValue(
      of(new HttpResponse({ body: blob, headers: new HttpHeaders({ 'Content-Type': XLSX_MIME }) })),
    );
    const download = TestBed.inject(ReportDownload);
    await download.save('overview', query);
    expect(create).toHaveBeenCalledOnce();
    expect(document.querySelector('a[download]')).toBeNull();
    expect(sessionStorage.length).toBe(0);
    vi.advanceTimersByTime(1001);
    expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:test-only');
  });
  it('propaga el error autorizado sin reintentar exportaciones automáticamente', async () => {
    api.export.mockReturnValue(
      throwError(() => new ApiFailure(429, 'exportacion_limitada', 'Demasiadas exportaciones')),
    );
    const download = TestBed.inject(ReportDownload);
    await download.save('overview', query);
    expect(api.export).toHaveBeenCalledOnce();
    expect(download.error()).toBe('Demasiadas exportaciones');
    expect(download.busy()).toBe(false);
  });
  it('no inicia una descarga tardía después de abandonar la página', async () => {
    let finish!: (value: ArrayBuffer) => void;
    const buffer = new Promise<ArrayBuffer>((resolve) => (finish = resolve));
    const create = vi.fn();
    const NativeURL = URL;
    vi.stubGlobal(
      'URL',
      class extends NativeURL {
        static override createObjectURL = create;
      },
    );
    const blob = new Blob(['PK0000']);
    Object.defineProperty(blob, 'slice', { value: () => ({ arrayBuffer: () => buffer }) });
    api.export.mockReturnValue(
      of(new HttpResponse({ body: blob, headers: new HttpHeaders({ 'Content-Type': XLSX_MIME }) })),
    );
    const saving = TestBed.inject(ReportDownload).save('overview', query);
    await Promise.resolve();
    TestBed.resetTestingModule();
    finish(new Uint8Array([80, 75, 3, 4]).buffer);
    await saving;
    expect(create).not.toHaveBeenCalled();
  });
});
