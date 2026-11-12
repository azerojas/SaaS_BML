import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { SaleEditorFacade } from './sale-editor-facade';
import { FinanceApi } from '../infrastructure/finance-api';
import { CatalogApi } from '../../catalogo/infrastructure/catalog-api';
import { VisitsApi } from '../../visitas/infrastructure/visits-api';
import { FinancialIntent } from './financial-intent';
describe('mapper de edición sin alterar snapshots ni precios oficiales', () => {
  it('conserva IDs, cantidades string, descuentos y profesional; obtiene unidad real solo para productos', async () => {
    const catalog = { get: vi.fn(() => of({ unidad_id: 4 })) };
    TestBed.configureTestingModule({
      providers: [
        SaleEditorFacade,
        {
          provide: FinanceApi,
          useValue: {
            sale: () =>
              of({
                id: 3,
                estado: 'BORRADOR',
                visita_id: 5,
                lineas: [
                  {
                    id: 10,
                    tipo: 'SERVICIO',
                    servicio_id: 2,
                    profesional_id: 6,
                    cantidad: '2.000',
                    precio_unitario: '80.15',
                    descuento_linea: '1.25',
                  },
                  {
                    id: 11,
                    tipo: 'PRODUCTO',
                    articulo_id: 8,
                    cantidad: '0.125',
                    precio_unitario: '20.10',
                    descuento_linea: '0.01',
                  },
                ],
              }),
          },
        },
        { provide: CatalogApi, useValue: catalog },
        { provide: VisitsApi, useValue: {} },
        { provide: FinancialIntent, useValue: {} },
      ],
    });
    const result = await TestBed.inject(SaleEditorFacade).initialize(3, undefined);
    expect(result?.lines).toEqual([
      {
        id: 10,
        tipo: 'SERVICIO',
        servicio_id: 2,
        profesional_id: 6,
        cantidad: '2.000',
        descuento_linea: '1.25',
      },
      {
        id: 11,
        tipo: 'PRODUCTO',
        articulo_id: 8,
        unidad_id: 4,
        cantidad: '0.125',
        descuento_linea: '0.01',
      },
    ]);
    expect(catalog.get).toHaveBeenCalledExactlyOnceWith('articulos', 8);
    expect(result?.lines[0].precio_unitario).toBeUndefined();
  });
  it('bloquea la edición de una venta confirmada antes de habilitar el formulario', async () => {
    TestBed.configureTestingModule({
      providers: [
        SaleEditorFacade,
        { provide: FinanceApi, useValue: { sale: () => of({ id: 3, estado: 'CONFIRMADA' }) } },
        { provide: CatalogApi, useValue: {} },
        { provide: VisitsApi, useValue: {} },
        { provide: FinancialIntent, useValue: {} },
      ],
    });
    const facade = TestBed.inject(SaleEditorFacade);
    expect(await facade.initialize(3, undefined)).toBeNull();
    expect(facade.error()).toContain('ya no es un borrador');
    expect(facade.sale()).toBeNull();
  });
});
