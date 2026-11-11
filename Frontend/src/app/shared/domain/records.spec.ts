import { describe, it, expect } from 'vitest';
import { decimalValid, pen, safeHttps, safeNotice } from './records';
import { phone } from '../../features/clientas/domain/clienta';
import { catalogPayload } from '../../features/catalogo/domain/catalog';
describe('validaciones de datos de fase 2', () => {
  it('aviso local admite el puerto HTTPS del mismo origen sin abrir destinos arbitrarios', () => {
    expect(safeNotice('https://localhost:8443/privacy/', 'https://localhost:8443')).toBe(
      'https://localhost:8443/privacy/',
    );
    expect(safeNotice('https://localhost:9999/privacy/', 'https://localhost:8443')).toBeNull();
    expect(safeNotice('javascript:alert(1)', 'https://localhost:8443')).toBeNull();
  });
  it('normaliza teléfonos peruanos sin perder prefijos internacionales', () => {
    expect(phone('999 123 456')).toBe('+51999123456');
    expect(phone('+34 612 345 678')).toBe('+34612345678');
    for (const value of ['0999123456', 'javascript:99', '+51991', '+51012345678'])
      expect(phone(value)).toBeNull();
  });
  it('conserva decimal string y rechaza notación científica, comas y precisión excesiva', () => {
    expect(decimalValid('9999999999.99', 2)).toBe(true);
    for (const value of ['1e2', '0,10', '0.001', '-1', 'Infinity', 0.1])
      expect(decimalValid(value, 2)).toBe(false);
    expect(decimalValid('0.001', 3, 11, true)).toBe(true);
    expect(decimalValid('0.000', 3, 11, true)).toBe(false);
  });
  it('no calcula precios contables ni transforma importes del payload a float', () => {
    const payload = catalogPayload(
      'servicios',
      { nombre: ' Cuidado ', precio_base: '9999999999.99', categoria_id: '3', slug: 'estable' },
      true,
    );
    expect(payload['precio_base']).toBe('9999999999.99');
    expect(payload['categoria_id']).toBe(3);
    expect(payload).not.toHaveProperty('slug');
    expect(pen('80.10')).toContain('80.10');
  });
  it('impide publicar insumos y admite solamente HTTPS sin credenciales', () => {
    expect(
      catalogPayload('articulos', { tipo: 'INSUMO', visible_catalogo: true }, false)[
        'visible_catalogo'
      ],
    ).toBe(false);
    for (const url of [
      'javascript:alert(1)',
      'http://example.test/x',
      'https://user:pass@example.test/x',
      'https://example.test:444/x',
    ])
      expect(safeHttps(url)).toBeNull();
    expect(safeHttps('https://images.example.test/x')).toBeTruthy();
  });
});
