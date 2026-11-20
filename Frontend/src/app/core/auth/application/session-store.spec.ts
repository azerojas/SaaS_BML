import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors, withXsrfConfiguration } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SessionStore } from './session-store';
import { apiInterceptor } from '../../http/api-interceptor';
import { CurrentUser } from '../domain/session';

@Component({ template: '' })
class TestPage {}
const USER: CurrentUser = {
  id: 2,
  username: 'unit_staff',
  nombre: 'Prueba unitaria',
  is_staff: true,
  permissions: ['negocio.view_clientas'],
};

describe('SessionStore Signals + HTTP', () => {
  let store: SessionStore;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'login', component: TestPage },
          { path: 'admin', component: TestPage },
        ]),
        provideHttpClient(
          withXsrfConfiguration({ cookieName: 'csrftoken', headerName: 'X-CSRFToken' }),
          withInterceptors([apiInterceptor]),
        ),
        provideHttpClientTesting(),
      ],
    });
    store = TestBed.inject(SessionStore);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  it('hidrata una sola consulta concurrente y no autentica antes de /me', async () => {
    const first = store.restore();
    const second = store.restore();
    expect(first).toBe(second);
    expect(store.state()).toBe('loading');
    expect(store.currentUser()).toBeNull();
    http.expectOne('/api/auth/me/').flush(USER);
    await first;
    expect(store.isAuthenticated()).toBe(true);
    expect(store.hasPermission('negocio.view_clientas')).toBe(true);
    await store.restore();
    http.expectNone('/api/auth/me/');
  });
  it('comprobar la sesión al volver mantiene la interfaz hasta recibir la respuesta', async () => {
    const initial = store.restore();
    http.expectOne('/api/auth/me/').flush(USER);
    await initial;
    const background = store.restore(true);
    expect(store.isAuthenticated()).toBe(true);
    http.expectOne('/api/auth/me/').flush(USER);
    await background;
    expect(store.isAuthenticated()).toBe(true);
    const expired = store.restore(true);
    http
      .expectOne('/api/auth/me/')
      .flush({ code: 'not_authenticated' }, { status: 403, statusText: 'Forbidden' });
    await expired;
    expect(store.isAuthenticated()).toBe(false);
  });
  it('403 not_authenticated del bootstrap deja anónimo sin aviso falso', async () => {
    const task = store.restore();
    http
      .expectOne('/api/auth/me/')
      .flush({ code: 'not_authenticated' }, { status: 403, statusText: 'Forbidden' });
    await task;
    expect(store.state()).toBe('anonymous');
    expect(store.error()).toBeNull();
  });
  it('una respuesta de identidad incompleta falla cerrada', async () => {
    const task = store.restore();
    http.expectOne('/api/auth/me/').flush({ username: 'staff', is_staff: true });
    await task;
    expect(store.currentUser()).toBeNull();
    expect(store.isAuthenticated()).toBe(false);
    expect(store.error()).toBeTruthy();
  });
  it('202 no concede acceso; el segundo factor requiere identidad posterior', async () => {
    const login = store.login('staff', 'solo-prueba');
    http.expectOne('/api/auth/csrf/').flush({});
    http
      .expectOne('/api/auth/login/')
      .flush(
        { mfa_required: true, setup_confirmation_required: false },
        { status: 202, statusText: 'Accepted' },
      );
    expect(await login).toBe(false);
    expect(store.mfaRequired()).toBe(true);
    expect(store.currentUser()).toBeNull();
    const verify = store.verify('123456');
    http.expectOne('/api/auth/csrf/').flush({});
    http.expectOne('/api/auth/mfa/verify/').flush({ mfa_verified: true });
    await Promise.resolve();
    http.expectOne('/api/auth/me/').flush(USER);
    expect(await verify).toBe(true);
  });
  it('bloquea doble envío mientras hay una autenticación en curso', async () => {
    const first = store.login('staff', 'solo-prueba');
    expect(await store.login('staff', 'solo-prueba')).toBe(false);
    http.expectOne('/api/auth/csrf/').flush({});
    http
      .expectOne('/api/auth/login/')
      .flush({ code: 'credenciales_invalidas' }, { status: 401, statusText: 'Unauthorized' });
    expect(await first).toBe(false);
    expect(store.isBusy()).toBe(false);
    expect(store.error()).toContain('usuario y contraseña');
  });
  it('logout confirmado limpia identidad y navega al acceso', async () => {
    store.state.set('authenticated');
    store.currentUser.set(USER);
    const task = store.logout();
    http.expectOne('/api/auth/csrf/').flush({});
    http.expectOne('/api/auth/logout/').flush(null, { status: 204, statusText: 'No Content' });
    expect(await task).toBe(true);
    expect(store.currentUser()).toBeNull();
    expect(TestBed.inject(Router).url).toBe('/login');
  });
  it('logout con fallo de red limpia estado local sin afirmar cierre remoto', async () => {
    store.state.set('authenticated');
    store.currentUser.set(USER);
    const task = store.logout();
    http.expectOne('/api/auth/csrf/').error(new ProgressEvent('error'));
    expect(await task).toBe(false);
    expect(store.currentUser()).toBeNull();
    expect(store.logoutPending()).toBe(true);
    expect(store.error()).toContain('No pudimos confirmar');
  });
  it('no pierde códigos de recuperación si /me falla tras verificar MFA', async () => {
    const task = store.verify('123456');
    http.expectOne('/api/auth/csrf/').flush({});
    http
      .expectOne('/api/auth/mfa/verify/')
      .flush({ mfa_verified: true, recovery_codes: ['solo-prueba-memoria'] });
    await Promise.resolve();
    http.expectOne('/api/auth/me/').error(new ProgressEvent('error'));
    await task;
    expect(store.recoveryCodes()).toEqual(['solo-prueba-memoria']);
    store.clearRecoveryCodes();
    expect(store.recoveryCodes()).toEqual([]);
  });
  it('vuelve al primer factor cuando caduca el desafío MFA', async () => {
    store.mfaRequired.set(true);
    const task = store.verify('123456');
    http.expectOne('/api/auth/csrf/').flush({});
    http
      .expectOne('/api/auth/mfa/verify/')
      .flush({ code: 'mfa_challenge_expired' }, { status: 401, statusText: 'Unauthorized' });
    expect(await task).toBe(false);
    expect(store.mfaRequired()).toBe(false);
    expect(store.isAuthenticated()).toBe(false);
    expect(store.error()).toContain('usuario y contraseña');
    http.expectNone('/api/auth/me/');
  });
  it('un código incorrecto permite reintentar MFA sin perder el primer factor', async () => {
    store.mfaRequired.set(true);
    const task = store.verify('123456');
    http.expectOne('/api/auth/csrf/').flush({});
    http
      .expectOne('/api/auth/mfa/verify/')
      .flush({ code: 'mfa_invalid' }, { status: 401, statusText: 'Unauthorized' });
    expect(await task).toBe(false);
    expect(store.mfaRequired()).toBe(true);
    expect(store.isAuthenticated()).toBe(false);
    expect(store.error()).toContain('código');
  });
});
