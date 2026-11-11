import { describe, it, expect } from 'vitest';
import { stockStatus, movementSign, signedQuantity, unitCost, dateLima } from './inventory';
import { estimatedTotal, purchaseTimestamp, limaDateInput } from '../../compras/domain/purchase';
import { safeReturnUrl } from '../../../core/auth/domain/session';
import { validationFields } from '../../../core/http/api-failure';
describe('reglas de presentación de inventario y compras', () => {
  it('distingue cero sin cargas, agotado y el límite inclusivo del servidor', () => {
    expect(stockStatus({ tiene_movimientos: false, existencia: '0.000', bajo_minimo: true })).toBe(
      'Sin movimientos',
    );
    expect(stockStatus({ tiene_movimientos: true, existencia: '0.000', bajo_minimo: true })).toBe(
      'Agotado',
    );
    expect(stockStatus({ tiene_movimientos: true, existencia: '2.000', bajo_minimo: true })).toBe(
      'Reponer',
    );
    expect(stockStatus({ tiene_movimientos: true, existencia: '2.001', bajo_minimo: false })).toBe(
      'En nivel',
    );
  });
  it('preserva signo y no inventa un costo cero', () => {
    expect(movementSign('-0.125')).toBe('Salida');
    expect(signedQuantity('2.125')).toBe('+2.125');
    expect(unitCost(null)).toBe('Sin costo verificable');
    expect(unitCost('0.0000')).toContain('0.00');
  });
  it('estima con enteros escalados y redondea solo el total, sin float', () => {
    expect(estimatedTotal([{ cantidad: '0.001', costo_unitario: '5.0000' }])).toBe('0.01');
    expect(
      estimatedTotal([
        { cantidad: '0.001', costo_unitario: '2.5000' },
        { cantidad: '0.001', costo_unitario: '2.5000' },
      ]),
    ).toBe('0.01');
    expect(estimatedTotal([{ cantidad: '2.125', costo_unitario: '3.2500' }])).toBe('6.91');
    expect(estimatedTotal([{ cantidad: '1e3', costo_unitario: '2' }])).toBeNull();
    expect(
      estimatedTotal([{ cantidad: '99999999999.999', costo_unitario: '99999999.9999' }]),
    ).toBeNull();
  });
  it('presenta Lima y respeta el offset de la fecha ingresada', () => {
    expect(purchaseTimestamp('2026-11-11T09:30')).toBe('2026-11-11T14:30:00.000Z');
    expect(limaDateInput('2026-11-11T04:00:00Z')).toBe('2026-11-10T23:00');
    expect(dateLima('invalid')).toBe('Fecha no disponible');
  });
  it('conserva destinos privados seguros de las nuevas pantallas', () => {
    for (const path of [
      '/admin/inventario/articulos/9',
      '/admin/inventario/ajustes/nuevo',
      '/admin/compras/2/recepcion',
      '/admin/proveedores/3',
    ])
      expect(safeReturnUrl(path)).toBe(path);
    for (const path of [
      '/admin/compras/../login',
      '/admin/compras/2?next=//evil.test',
      '/admin/inventario%2fmovimientos',
    ])
      expect(safeReturnUrl(path)).toBe('/admin');
  });
  it('conserva validaciones por línea y no permite alterar prototipos', () => {
    const fields = validationFields({
      detalles: [{ cantidad: ['Usa una cadena decimal.'] }],
      unidad_id: ['Unidad incompatible.'],
    });
    expect(fields['detalles.0.cantidad']).toEqual(['Usa una cadena decimal.']);
    expect(fields['unidad_id']).toEqual(['Unidad incompatible.']);
    expect(Object.getPrototypeOf(fields)).toBeNull();
  });
});
