import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SalesFacade } from './sales-facade';
import { FinanceApi } from '../infrastructure/finance-api';
import { FinancialIntent } from './financial-intent';
import { InventoryApi } from '../../inventario/infrastructure/inventory-api';
import { SessionStore } from '../../../core/auth/application/session-store';
import { SaleDetail } from '../domain/sale';
import { StockItem } from '../../inventario/domain/inventory';
import { ApiFailure } from '../../../core/http/api-failure';
describe('detalle oficial de venta y permisos de existencias', () => {
  const sale: SaleDetail = {
    id: 3,
    estado: 'CONFIRMADA',
    visita_id: null,
    clienta_id: null,
    creada_en: '2026-11-11T10:00:00-05:00',
    confirmada_en: '2026-11-11T10:00:00-05:00',
    subtotal: '20.00',
    descuento_global: '0.00',
    propina: '0.00',
    total: '20.00',
    saldo: {
      venta_id: 3,
      estado: 'CONFIRMADA',
      subtotal: '20.00',
      descuento_global: '0.00',
      propina: '0.00',
      total: '20.00',
      pagos_confirmados: '0.00',
      anticipos_aplicados: '0.00',
      reembolsos: '0.00',
      ajustes_comerciales: '0.00',
      cobertura_total: '0.00',
      saldo_pendiente: '20.00',
      moneda: 'PEN',
    },
    finanzas_congeladas: null,
    aplicaciones_anticipo: [],
    lineas: [
      {
        id: 1,
        tipo: 'PRODUCTO',
        servicio_id: 0,
        articulo_id: 9,
        profesional_id: null,
        descripcion_snapshot: 'Producto de prueba',
        cantidad: '1.000',
        precio_unitario: '20.00',
        descuento_linea: '0.00',
        costo_unitario_snapshot: '3.0000',
        consumos: [],
      },
    ],
  };
  let api: { sale: ReturnType<typeof vi.fn>; payments: ReturnType<typeof vi.fn> };
  let inventory: { stock: ReturnType<typeof vi.fn> };
  let session: { hasPermission: ReturnType<typeof vi.fn> };
  beforeEach(() => {
    api = { sale: vi.fn(() => of(sale)), payments: vi.fn(() => of({ count: 0, results: [] })) };
    inventory = { stock: vi.fn(() => of({ count: 1, results: [{ articulo_id: 9 }] })) };
    session = { hasPermission: vi.fn(() => true) };
    TestBed.configureTestingModule({
      providers: [
        SalesFacade,
        { provide: FinanceApi, useValue: api },
        { provide: InventoryApi, useValue: inventory },
        { provide: SessionStore, useValue: session },
        {
          provide: FinancialIntent,
          useValue: { send: vi.fn(() => Promise.resolve({ venta_id: 3 })) },
        },
      ],
    });
  });
  it('cambiar de detalle elimina existencias y errores de la venta anterior', async () => {
    const facade = TestBed.inject(SalesFacade);
    facade.stock.set([{ articulo_id: 1 } as StockItem]);
    facade.stockError.set('Error anterior');
    await facade.get(3);
    expect(facade.stock()).toEqual([]);
    expect(facade.stockError()).toBeNull();
  });
  it('confirmar sin permiso de inventario no consulta ni anuncia un rechazo de stock', async () => {
    session.hasPermission.mockReturnValue(false);
    const facade = TestBed.inject(SalesFacade);
    facade.record.set(sale);
    expect(await facade.confirm([])).toBe(true);
    expect(inventory.stock).not.toHaveBeenCalled();
    expect(facade.stockError()).toBeNull();
  });
  it('confirmar con permiso consulta nuevamente el stock oficial', async () => {
    const facade = TestBed.inject(SalesFacade);
    facade.record.set(sale);
    expect(await facade.confirm([])).toBe(true);
    expect(inventory.stock).toHaveBeenCalledExactlyOnceWith({ articulo: 9, activo: 'all' });
    expect(facade.stock()[0].articulo_id).toBe(9);
  });
  it('si falla el GET posterior al cobro no afirma que el saldo fue consultado', async () => {
    api.sale.mockReturnValue(throwError(() => new ApiFailure(0, 'network', 'Sin conexión')));
    const facade = TestBed.inject(SalesFacade);
    facade.record.set(sale);
    expect(
      await facade.pay({ metodo: 'EFECTIVO', monto: '5.00', verificado_manualmente: true }),
    ).toBe(true);
    expect(facade.record()).toBeNull();
    expect(facade.success()).toBeNull();
    expect(facade.error()).toContain('operación fue registrada');
  });
});
