import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeState } from './theme-state';

describe('Preferencia de apariencia', () => {
  let systemDark: boolean;
  let systemChanged: (() => void) | undefined;

  beforeEach(() => {
    localStorage.removeItem('lasheo-theme');
    systemDark = false;
    vi.stubGlobal('matchMedia', () => ({
      get matches() {
        return systemDark;
      },
      addEventListener: (_: string, callback: () => void) => {
        systemChanged = callback;
      },
      removeEventListener: vi.fn(),
    }));
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    localStorage.removeItem('lasheo-theme');
    delete document.documentElement.dataset['theme'];
  });

  it('sigue los cambios del sistema hasta que se elige un tema', () => {
    const theme = TestBed.inject(ThemeState);
    expect(theme.dark()).toBe(false);
    systemDark = true;
    systemChanged?.();
    expect(theme.dark()).toBe(true);
    theme.toggle();
    systemChanged?.();
    expect(theme.dark()).toBe(false);
    expect(localStorage.getItem('lasheo-theme')).toBe('light');
  });

  it('restaura el tema guardado y permite volver al claro', () => {
    localStorage.setItem('lasheo-theme', 'dark');
    const theme = TestBed.inject(ThemeState);
    expect(document.documentElement.dataset['theme']).toBe('dark');
    theme.toggle();
    expect(document.documentElement.dataset['theme']).toBe('light');
    expect(localStorage.getItem('lasheo-theme')).toBe('light');
  });

  it('sincroniza cambios entre pestañas y vuelve al sistema al borrar la preferencia', () => {
    const theme = TestBed.inject(ThemeState);
    localStorage.setItem('lasheo-theme', 'dark');
    window.dispatchEvent(new StorageEvent('storage', { key: 'lasheo-theme' }));
    expect(theme.dark()).toBe(true);
    localStorage.removeItem('lasheo-theme');
    window.dispatchEvent(new StorageEvent('storage', { key: 'lasheo-theme' }));
    expect(theme.dark()).toBe(false);
  });

  it('permite cambiar de tema aunque el navegador bloquee el almacenamiento', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const theme = TestBed.inject(ThemeState);
    theme.toggle();
    expect(theme.dark()).toBe(true);
    expect(document.documentElement.dataset['theme']).toBe('dark');
  });
});
