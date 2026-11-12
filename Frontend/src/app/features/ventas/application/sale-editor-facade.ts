import { inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { OperationState } from '../../../shared/application/operation-state';
import { FinanceApi } from '../infrastructure/finance-api';
import { CatalogApi } from '../../catalogo/infrastructure/catalog-api';
import { VisitsApi } from '../../visitas/infrastructure/visits-api';
import { FinancialIntent } from './financial-intent';
import { SaleDetail, SaleInput, SaleLineInput } from '../domain/sale';
@Injectable()
export class SaleEditorFacade extends OperationState {
  private readonly api = inject(FinanceApi);
  private readonly catalog = inject(CatalogApi);
  private readonly visits = inject(VisitsApi);
  readonly intent = inject(FinancialIntent);
  readonly loading = signal(false);
  readonly sale = signal<SaleDetail | null>(null);
  readonly visit = signal<number | undefined>(undefined);
  async initialize(
    id: number | undefined,
    visit: number | undefined,
  ): Promise<{ sale: SaleDetail; lines: SaleLineInput[] } | null> {
    this.loading.set(true);
    this.sale.set(null);
    this.visit.set(undefined);
    try {
      if (id) {
        const sale = await firstValueFrom(this.api.sale(id));
        if (sale.estado !== 'BORRADOR')
          throw new Error('La venta ya no es un borrador. Consulta el detalle.');
        const lines = await Promise.all(
          sale.lineas.map(async (line): Promise<SaleLineInput> => ({
            id: line.id,
            tipo: line.tipo,
            cantidad: line.cantidad,
            descuento_linea: line.descuento_linea,
            ...(line.tipo === 'SERVICIO'
              ? { servicio_id: line.servicio_id, profesional_id: line.profesional_id }
              : {
                  articulo_id: line.articulo_id,
                  unidad_id: Number(
                    (await firstValueFrom(this.catalog.get('articulos', line.articulo_id)))[
                      'unidad_id'
                    ],
                  ),
                }),
          })),
        );
        this.sale.set(sale);
        this.visit.set(sale.visita_id ?? undefined);
        return { sale, lines };
      }
      if (visit) {
        const record = await firstValueFrom(this.visits.get(visit));
        if (record.estado !== 'ABIERTA' || record.venta_id)
          throw new Error('La visita debe estar abierta y sin venta previa.');
        this.visit.set(visit);
      }
      return null;
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'No se pudo cargar el borrador.');
      return null;
    } finally {
      this.loading.set(false);
    }
  }
  save(body: SaleInput) {
    const id = this.sale()?.id;
    return this.intent.send(
      id ? 'venta.editar' : 'venta.crear',
      id ? String(id) : this.visit() ? 'visit-' + this.visit() : 'new',
      '/api/ventas/' + (id ? id + '/' : ''),
      { ...body, ...(!id && this.visit() ? { visita_id: this.visit() } : {}) },
      id ? 'PATCH' : 'POST',
    );
  }
}
