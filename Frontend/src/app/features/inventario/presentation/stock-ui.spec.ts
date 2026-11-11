import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, it, expect } from 'vitest';
import { StockCards } from './stock-ui';
import { StockItem } from '../domain/inventory';
describe('tarjeta de stock', () => {
  it('presenta saldo/unidad oficial y no ofrece editar cantidades', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(StockCards);
    const item: StockItem = {
      articulo_id: 1,
      nombre: 'Material de prueba',
      sku: 'TEST',
      tipo: 'INSUMO',
      unidad: 'ML',
      unidad_id: 2,
      categoria_id: null,
      categoria_nombre: null,
      activo: true,
      stock_minimo: '2.000',
      existencia: '1.125',
      bajo_minimo: true,
      tiene_movimientos: true,
      costo_unitario_estimado: null,
      politica_costeo: 'HISTORICO',
      moneda: 'PEN',
    };
    fixture.componentRef.setInput('rows', [item]);
    await fixture.whenStable();
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.textContent).toContain('1.125');
    expect(element.textContent).toContain('Reponer');
    expect(element.textContent).toContain('Sin costo verificable');
    expect(element.querySelector('input')).toBeNull();
  });
});
