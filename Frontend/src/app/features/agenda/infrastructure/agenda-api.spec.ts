import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, it, expect } from 'vitest';
import { AgendaApi } from './agenda-api';
describe('Contratos HTTP de agenda', () => {
  let api: AgendaApi, http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(AgendaApi);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  it('anticipos usa el filtro real cita y rechaza filas de otra reserva', async () => {
    const result = firstValueFrom(api.advances(7));
    const check = expect(result).rejects.toThrow('otra cita');
    const req = http.expectOne((r) => r.url === '/api/anticipos/' && r.params.get('cita') === '7');
    expect(req.request.params.has('cita_id')).toBe(false);
    req.flush({ count: 1, next: null, results: [{ id: 2, cita_id: 99 }] });
    await check;
  });
  it('disponibilidad envía lista de servicios y fecha local, sin datos de clienta', async () => {
    const result = firstValueFrom(api.availability('2026-12-01', 7, [2, 3]));
    const req = http.expectOne((r) =>
      r.url.startsWith('/api/v1/agenda/calendario/disponibilidad/'),
    );
    expect(req.request.url).toContain('servicios=2%2C3');
    expect(req.request.url).not.toContain('clienta');
    req.flush({ slots: [] });
    expect((await result).slots).toEqual([]);
  });
  it('calendario recorre páginas sin ocultar resultados', async () => {
    const result = firstValueFrom(
      api.all('calendario/', { desde: '2026-12-01', hasta: '2026-12-02' }),
    );
    http
      .expectOne((r) => r.params.get('page') === '1')
      .flush({ count: 2, next: 'page2', results: [{ id: 1 }] });
    http
      .expectOne((r) => r.params.get('page') === '2')
      .flush({ count: 2, next: null, results: [{ id: 2 }] });
    expect(await result).toEqual([{ id: 1 }, { id: 2 }]);
  });
  it('escrituras obtienen CSRF y conservan clave y método', async () => {
    const result = firstValueFrom(
      api.mutate(
        '/api/v1/agenda/horarios/3/',
        { motivo: 'Retiro revisado', confirmar_retiro: true },
        '3c90c2b8-a3d4-4f30-a4ac-4cb045ce7d63',
        'DELETE',
      ),
    );
    http.expectOne('/api/auth/csrf/').flush({});
    const req = http.expectOne('/api/v1/agenda/horarios/3/');
    expect(req.request.method).toBe('DELETE');
    expect(req.request.headers.get('Idempotency-Key')).toBe('3c90c2b8-a3d4-4f30-a4ac-4cb045ce7d63');
    req.flush({ retirado: true });
    await result;
  });
});
