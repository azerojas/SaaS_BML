import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { SwUpdate } from '@angular/service-worker';
import { Subject, firstValueFrom } from 'rxjs';
import { describe, it, expect, vi } from 'vitest';
import { PwaState } from './pwa-state';
import { apiInterceptor } from '../http/api-interceptor';
import { UnsavedForms } from '../forms/unsaved-state';
import { FormControl, FormGroup, FormGroupDirective } from '@angular/forms';
describe('PWA: ninguna escritura sin red o con contrato obsoleto', () => {
  it('bloquea POST offline antes de emitir HTTP y no añade credenciales a otro origen', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([apiInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    const state = TestBed.inject(PwaState),
      client = TestBed.inject(HttpClient),
      http = TestBed.inject(HttpTestingController);
    state.online.set(false);
    await expect(firstValueFrom(client.post('/api/pagos/', {}))).rejects.toMatchObject({
      status: 0,
      code: 'offline_or_stale',
    });
    http.expectNone('/api/pagos/');
    const external = firstValueFrom(client.get('https://external.invalid/file'));
    const req = http.expectOne('https://external.invalid/file');
    expect(req.request.withCredentials).toBe(false);
    expect(req.request.headers.has('X-CSRFToken')).toBe(false);
    req.flush({});
    await external;
    http.verify();
  });
  it('una versión nueva o irrecuperable exige recarga y mantiene bloqueadas las mutaciones', () => {
    const events = new Subject<{ type: string }>(),
      broken = new Subject<{ reason: string }>();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: SwUpdate,
          useValue: {
            isEnabled: true,
            versionUpdates: events,
            unrecoverable: broken,
            checkForUpdate: () => Promise.resolve(false),
          },
        },
      ],
    });
    const state = TestBed.inject(PwaState);
    events.next({ type: 'VERSION_READY' });
    expect(state.blocked()).toBe(true);
    broken.next({ reason: 'hash mismatch' });
    expect(state.brokenVersion()).toBe(true);
  });
  it('no descarta formularios sin confirmación y limpia solo el formulario enviado al guardar', () => {
    const registry = TestBed.inject(UnsavedForms);
    const group = new FormGroup({ notes: new FormControl('private value') });
    group.markAsDirty();
    const form = { form: group } as FormGroupDirective;
    registry.forms.add(form);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    expect(registry.confirmDiscard()).toBe(false);
    expect(group.dirty).toBe(true);
    confirm.mockReturnValue(true);
    expect(registry.confirmDiscard()).toBe(true);
    expect(group.pristine).toBe(true);
    group.markAsDirty();
    registry.submitted = form;
    registry.success();
    expect(group.pristine).toBe(true);
    confirm.mockRestore();
  });
});
