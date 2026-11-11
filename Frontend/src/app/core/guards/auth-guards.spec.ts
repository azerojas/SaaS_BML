import { TestBed } from '@angular/core/testing';
import {
  provideRouter,
  ActivatedRouteSnapshot,
  RouterStateSnapshot,
  UrlTree,
  Router,
} from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { authGuard, permissionGuard } from './auth-guards';
import { SessionStore } from '../auth/application/session-store';

describe('Guards', () => {
  beforeEach(() =>
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }),
  );
  it('espera /me y conserva un destino interno cuando no hay sesión', async () => {
    const result = TestBed.runInInjectionContext(() =>
      authGuard({} as ActivatedRouteSnapshot, { url: '/admin/clientas' } as RouterStateSnapshot),
    );
    TestBed.inject(HttpTestingController)
      .expectOne('/api/auth/me/')
      .flush({ code: 'not_authenticated' }, { status: 403, statusText: 'Forbidden' });
    const tree = await result;
    expect(tree).toBeInstanceOf(UrlTree);
    expect(TestBed.inject(Router).serializeUrl(tree as UrlTree)).toContain(
      'returnUrl=%2Fadmin%2Fclientas',
    );
  });
  it('mantiene sesión al rechazar un módulo sin permiso', () => {
    const store = TestBed.inject(SessionStore);
    store.currentUser.set({ id: 1, username: 'unit', nombre: '', is_staff: true, permissions: [] });
    store.state.set('authenticated');
    const result = TestBed.runInInjectionContext(() =>
      permissionGuard(
        { data: { permission: 'negocio.view_clientas' } } as unknown as ActivatedRouteSnapshot,
        {} as RouterStateSnapshot,
      ),
    );
    expect(result).toBeInstanceOf(UrlTree);
    expect(store.isAuthenticated()).toBe(true);
  });
});
