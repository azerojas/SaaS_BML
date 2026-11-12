import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { SaleEditorFacade } from '../application/sale-editor-facade';
import { LookupsFacade } from '../application/lookups-facade';
import { SaleLineInput, FinanceResult } from '../domain/sale';
import { exactDecimal, optionalMoney } from './form-validators';
import { CatalogRecord } from '../../catalogo/domain/catalog';
import { SessionStore } from '../../../core/auth/application/session-store';
import { CatalogPicker } from './catalog-picker';
import { FinanceFeedback } from './finance-feedback';
import { Alert } from '../../../shared/ui/alert';
import { Loading } from '../../../shared/ui/loading';
import { Pager } from '../../../shared/ui/pager';
@Component({
  selector: 'bm-sale-editor',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    CatalogPicker,
    FinanceFeedback,
    Alert,
    Loading,
    Pager,
  ],
  providers: [SaleEditorFacade, LookupsFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sale-editor.html',
})
export class SaleEditor {
  readonly facade = inject(SaleEditorFacade);
  readonly lookup = inject(LookupsFacade);
  readonly session = inject(SessionStore);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  readonly Number = Number;
  readonly invalid = signal(false);
  readonly saving = signal(false);
  readonly lines = this.fb.array<ReturnType<SaleEditor['line']>>([]);
  readonly form = this.fb.nonNullable.group({
    descuento_global: ['0.00', exactDecimal(2)],
    propina: ['0.00', exactDecimal(2)],
    lineas: this.lines,
  });
  private readonly route = inject(ActivatedRoute);
  constructor() {
    void this.initialize();
  }
  async initialize() {
    const id = Number(this.route.snapshot.paramMap.get('id')) || undefined;
    const visit = Number(this.route.snapshot.queryParamMap.get('visita')) || undefined;
    const result = await this.facade.initialize(id, visit);
    if (result) {
      this.form.patchValue({
        descuento_global: result.sale.descuento_global,
        propina: result.sale.propina,
      });
      for (const data of result.lines)
        this.lines.push(
          this.line(
            data,
            result.sale.lineas.find((row) => row.id === data.id)?.descripcion_snapshot ??
              'Línea registrada',
          ),
        );
    }
    this.lookup.professionals.reload();
  }
  private line(data: SaleLineInput, name: string) {
    return this.fb.nonNullable.group({
      id: data.id ?? 0,
      tipo: data.tipo,
      referencia: data.servicio_id ?? data.articulo_id ?? 0,
      unidad: data.unidad_id ?? 0,
      nombre: name,
      cantidad: [
        data.cantidad,
        [
          Validators.required,
          exactDecimal(3, true),
          ...(data.tipo === 'SERVICIO' ? [Validators.pattern(/^[1-9]\d*(?:\.0{1,3})?$/)] : []),
        ],
      ],
      descuento_linea: [data.descuento_linea ?? '0.00', exactDecimal(2)],
      profesional: [String(data.profesional_id ?? ''), Validators.pattern(/^(?:[1-9]\d*)?$/)],
      precio: ['', optionalMoney],
      motivo_precio: ['', Validators.maxLength(250)],
    });
  }
  locked() {
    return (
      this.facade.loading() ||
      this.facade.intent.busy() ||
      this.facade.intent.uncertain() ||
      this.saving()
    );
  }
  add(item: CatalogRecord, type: 'SERVICIO' | 'PRODUCTO') {
    if (this.locked() || this.lines.length >= 100 || (type === 'SERVICIO' && !this.facade.visit()))
      return;
    const data: SaleLineInput = {
      tipo: type,
      cantidad: '1.000',
      ...(type === 'SERVICIO'
        ? { servicio_id: item.id }
        : { articulo_id: item.id, unidad_id: Number(item['unidad_id']) }),
    };
    this.lines.push(this.line(data, item.nombre));
  }
  async save() {
    this.invalid.set(false);
    this.form.markAllAsTouched();
    if (this.locked() || this.facade.error()) return;
    const values = this.form.getRawValue();
    if (
      this.form.invalid ||
      !values.lineas.length ||
      values.lineas.some(
        (row) =>
          row.precio !== '' &&
          (!this.session.hasPermission('finanzas.override_price') ||
            row.motivo_precio.trim().length < 8),
      )
    ) {
      this.invalid.set(true);
      return;
    }
    const lineas: SaleLineInput[] = values.lineas.map((row) => ({
      ...(row.id ? { id: row.id } : {}),
      tipo: row.tipo,
      cantidad: row.cantidad,
      descuento_linea: row.descuento_linea,
      ...(row.tipo === 'SERVICIO'
        ? {
            servicio_id: row.referencia,
            profesional_id: row.profesional ? Number(row.profesional) : null,
          }
        : { articulo_id: row.referencia, unidad_id: row.unidad }),
      ...(row.precio !== ''
        ? { precio_unitario: row.precio, motivo_precio: row.motivo_precio.trim() }
        : {}),
    }));
    this.saving.set(true);
    try {
      const result = await this.facade.save({
        lineas,
        descuento_global: values.descuento_global,
        propina: values.propina,
      });
      if (result) await this.done(result);
    } finally {
      this.saving.set(false);
    }
  }
  async done(result: FinanceResult) {
    if (result.venta_id) await this.router.navigate(['/admin/ventas', result.venta_id]);
  }
}
