import { TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { CheckinApi } from '../infrastructure/checkin-api';
import { CheckinFacade } from './checkin-facade';
import { ApiFailure } from '../../../core/http/api-failure';
describe('estado público sin enumeración ni reenvío doble', () => {
  let api: { submit: ReturnType<typeof vi.fn>; config: ReturnType<typeof vi.fn> };
  beforeEach(() => {
    api = {
      submit: vi.fn(() => of({ detail: 'Recibido' })),
      config: vi.fn(() => of({ establecimiento: 'Prueba' })),
    };
    TestBed.configureTestingModule({
      providers: [CheckinFacade, { provide: CheckinApi, useValue: api }],
    });
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });
  it('un doble clic y un estado recibido no reenvían la solicitud', async () => {
    const response = new Subject<{ detail: string }>();
    api.submit.mockReturnValue(response);
    const facade = TestBed.inject(CheckinFacade);
    const first = facade.submit('token', { telefono: '+51955123000' });
    await facade.submit('token', { telefono: '+51955123000' });
    expect(api.submit).toHaveBeenCalledTimes(1);
    response.next({ detail: 'Recibido' });
    await first;
    expect(facade.state()).toBe('received');
    await facade.submit('token', { telefono: '+51955123000' });
    expect(api.submit).toHaveBeenCalledTimes(1);
    expect(facade.success()).not.toContain('955123000');
  });
  it('429 conserva Retry-After y bloquea antes del plazo', async () => {
    vi.useFakeTimers();
    api.submit.mockReturnValue(throwError(() => new ApiFailure(429, 'throttled', 'Espera', {}, 3)));
    const facade = TestBed.inject(CheckinFacade);
    await facade.submit('token', { telefono: '+51955123000' });
    expect(facade.state()).toBe('rate_limited');
    expect(facade.cooldown()).toBe(3);
    await facade.submit('token', { telefono: '+51955123000' });
    expect(api.submit).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(3000);
    expect(facade.cooldown()).toBe(0);
  });
  it('QR revocado deja el formulario sin configuración utilizable', async () => {
    api.config.mockReturnValue(throwError(() => new ApiFailure(404, 'not_found', 'No disponible')));
    const facade = TestBed.inject(CheckinFacade);
    await facade.get('token');
    expect(facade.record()).toBeNull();
    expect(facade.state()).toBe('expired');
  });
  it('una caída al cargar no se presenta como QR revocado y permite consultar de nuevo', async () => {
    api.config.mockReturnValueOnce(throwError(() => new ApiFailure(0, 'network', 'Sin conexión')));
    const facade = TestBed.inject(CheckinFacade);
    await facade.get('token');
    expect(facade.state()).toBe('error');
    await facade.get('token');
    expect(facade.state()).toBe('idle');
    expect(facade.record()).not.toBeNull();
  });
});
