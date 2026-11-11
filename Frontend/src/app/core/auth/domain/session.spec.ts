import { describe, it, expect } from 'vitest';
import { canAccess, isCurrentUser, safeReturnUrl } from './session';

describe('Frontera de sesión', () => {
  it('solo acepta identidad staff completa del contrato real', () => {
    expect(
      isCurrentUser({ id: 1, username: 'prueba', nombre: '', is_staff: true, permissions: [] }),
    ).toBe(true);
    for (const value of [
      null,
      {},
      { id: 1, username: 'x', nombre: '', is_staff: false, permissions: [] },
      { id: 1, username: 'x', nombre: '', is_staff: true },
    ])
      expect(isCurrentUser(value)).toBe(false);
  });
  it('no interpreta is_staff como permiso para todos los módulos', () => {
    const user = {
      id: 1,
      username: 'prueba',
      nombre: '',
      is_staff: true,
      permissions: ['negocio.view_clientas'],
    };
    expect(canAccess(user, 'negocio.view_clientas')).toBe(true);
    expect(canAccess(user, 'finanzas.view_finance')).toBe(false);
    expect(canAccess(null, 'negocio.view_clientas')).toBe(false);
  });
  it('conserva solo destinos internos conocidos', () => {
    for (const url of ['/admin', '/admin/agenda', '/admin/clientas'])
      expect(safeReturnUrl(url)).toBe(url);
    for (const url of [
      '//evil.test',
      'https://evil.test',
      'javascript:alert(1)',
      '/admin/../registro',
      '/admin%2f..',
      '/admin?redirect=//evil.test',
      '/admin\\evil',
      '',
      null,
    ])
      expect(safeReturnUrl(url)).toBe('/admin');
  });
});
