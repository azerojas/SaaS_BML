import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { SaleCheckoutContext } from './sale-checkout-context';
import { FinancialIntent } from '../application/financial-intent';
import { SalesFacade } from '../application/sales-facade';
import { FinanceFeedback } from './finance-feedback';
import { PAYMENT_METHODS, PaymentInput, ConsumptionGroup } from '../domain/sale';
import { exactDecimal } from './form-validators';
import { VisitsApi } from '../../visitas/infrastructure/visits-api';
import { Visit } from '../../visitas/domain/visit';
import { SessionStore } from '../../../core/auth/application/session-store';
import { messageOf, pen } from '../../../shared/domain/records';
import { dateLima } from '../../inventario/domain/inventory';
import { Alert } from '../../../shared/ui/alert';
import { Loading } from '../../../shared/ui/loading';
import { Icon } from '../../../shared/ui/icon';

@Component({
  selector: 'bm-sale-checkout-dialog',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    Alert,
    Loading,
    Icon,
    FinanceFeedback,
  ],
  providers: [SaleCheckoutContext, SalesFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sale-checkout-dialog.html',
  styleUrl: './sale-checkout-dialog.scss',
})
export class SaleCheckoutDialog {
  readonly checkout = inject(SaleCheckoutContext);
  readonly ref = inject(MatDialogRef<SaleCheckoutDialog>);
  readonly facade = inject(SalesFacade);
  readonly session = inject(SessionStore);
  private readonly visits = inject(VisitsApi);
  private readonly intent = inject(FinancialIntent);
  private readonly fb = inject(FormBuilder);
  private readonly injector = inject(Injector);
  private readonly paymentStart = viewChild<ElementRef<HTMLElement>>('paymentStart');
  private readonly paymentSuccess = viewChild<ElementRef<HTMLElement>>('paymentSuccess');
  readonly loading = signal(true);
  readonly working = signal(false);
  readonly collecting = signal(false);
  readonly paid = signal(false);
  readonly error = signal<string | null>(null);
  readonly visit = signal<Visit | null>(null);
  readonly money = pen;
  readonly date = dateLima;
  readonly methods = PAYMENT_METHODS;
  readonly consumptions = this.fb.array<ReturnType<SaleCheckoutDialog['consumption']>>([]);
  readonly form = this.fb.nonNullable.group({
    metodo: ['EFECTIVO' as PaymentInput['metodo'], Validators.required],
    monto: ['', exactDecimal(2, true)],
    referencia: ['', Validators.maxLength(100)],
    verificado: [false, Validators.requiredTrue],
    consumptions: this.consumptions,
  });

  constructor() {
    void this.load();
  }

  locked() {
    return (
      this.loading() ||
      this.working() ||
      this.intent.busy() ||
      this.intent.uncertain() ||
      this.facade.loading() ||
      this.facade.changing()
    );
  }
  canClose() {
    if (this.locked()) return false;
    return (
      !this.collecting() ||
      !this.form.dirty ||
      window.confirm('Hay datos de cobro sin registrar. ¿Cerrar y descartarlos?')
    );
  }
  private consumption(
    serviceId: number,
    name: string,
    items: { articulo_id: number; unidad_id: number; cantidad: string }[],
  ) {
    return this.fb.nonNullable.group({
      detalle: serviceId,
      nombre: name,
      items: this.fb.array(
        items.map((item) =>
          this.fb.nonNullable.group({
            articulo: item.articulo_id,
            unidad: item.unidad_id,
            cantidad: [item.cantidad, exactDecimal(3)],
          }),
        ),
      ),
    });
  }
  async load() {
    this.loading.set(true);
    this.error.set(null);
    try {
      const visit = await firstValueFrom(this.visits.get(this.checkout.data.visitId));
      this.visit.set(visit);
      let saleId = visit.venta_id;
      if (!saleId && visit.cita_para_cobro && this.session.hasPermission('finanzas.manage_sales')) {
        const result = await this.intent.send('venta.crear', 'visit-' + visit.id, '/api/ventas/', {
          visita_id: visit.id,
          cita_id: visit.cita_para_cobro.id,
        });
        if (!result?.venta_id) {
          this.error.set(this.intent.error() ?? 'No se pudo consultar el servicio de esta visita.');
          return;
        }
        saleId = result.venta_id;
      }
      if (!saleId) {
        this.facade.record.set(null);
        return;
      }
      this.checkout.saleId.set(saleId);
      await this.facade.get(saleId);
      this.error.set(this.facade.error());
    } catch (error: unknown) {
      this.error.set(messageOf(error));
    } finally {
      this.loading.set(false);
    }
  }
  async startPayment() {
    if (this.locked()) return;
    const sale = this.facade.record();
    if (!sale || sale.estado === 'ANULADA') return;
    this.working.set(true);
    this.error.set(null);
    try {
      this.consumptions.clear();
      if (sale.estado === 'BORRADOR') {
        const preview = await this.facade.previewSale();
        if (!preview) {
          this.error.set(this.facade.error() ?? 'No se pudo revisar el servicio.');
          return;
        }
        for (const line of sale.lineas.filter((row) => row.tipo === 'SERVICIO')) {
          const items =
            preview.receta_sugerida.find((row) => row.detalle_id === line.id)?.insumos ?? [];
          this.consumptions.push(this.consumption(line.id, line.descripcion_snapshot, items));
        }
      }
      this.form.controls.monto.setValue(sale.saldo.saldo_pendiente);
      this.form.controls.verificado.setValue(false);
      this.form.markAsPristine();
      this.collecting.set(true);
      this.paid.set(false);
      afterNextRender(() => this.paymentStart()?.nativeElement.focus(), {
        injector: this.injector,
      });
    } finally {
      this.working.set(false);
    }
  }
  async charge() {
    if (this.locked()) return;
    this.form.markAllAsTouched();
    const raw = this.form.getRawValue();
    if (this.form.invalid || (raw.metodo !== 'EFECTIVO' && !raw.referencia.trim())) {
      this.error.set('Revisa el monto, la referencia y la confirmación del dinero recibido.');
      return;
    }
    this.working.set(true);
    this.error.set(null);
    try {
      if (this.facade.record()?.estado === 'BORRADOR') {
        const groups: ConsumptionGroup[] = raw.consumptions.map((group) => ({
          detalle_id: group.detalle,
          insumos: group.items
            .filter((item) => /[1-9]/.test(item.cantidad))
            .map((item) => ({
              articulo_id: item.articulo,
              unidad_id: item.unidad,
              cantidad: item.cantidad,
            })),
        }));
        if (!(await this.facade.confirm(groups))) {
          this.error.set(this.facade.error() ?? this.intent.error());
          return;
        }
      }
      const registered = await this.facade.pay({
        metodo: raw.metodo,
        monto: raw.monto,
        referencia: raw.referencia.trim(),
        verificado_manualmente: true,
      });
      if (!registered) {
        this.error.set(this.facade.error() ?? this.intent.error());
        return;
      }
      this.form.markAsPristine();
      this.collecting.set(false);
      if (!this.facade.record()) {
        this.error.set(
          'El cobro fue registrado, pero no se pudo consultar el saldo actualizado. Cierra y vuelve a abrir el resumen antes de continuar.',
        );
        return;
      }
      this.paid.set(true);
      afterNextRender(() => this.paymentSuccess()?.nativeElement.focus(), {
        injector: this.injector,
      });
    } finally {
      this.working.set(false);
    }
  }
}
