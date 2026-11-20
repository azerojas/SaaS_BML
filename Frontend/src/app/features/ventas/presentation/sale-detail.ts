import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { SalesFacade } from '../application/sales-facade';
import { SessionStore } from '../../../core/auth/application/session-store';
import { FinanceNav } from './finance-nav';
import { FinanceFeedback } from './finance-feedback';
import { ConsumptionReview } from './consumption-review';
import { PaymentForm } from './payment-form';
import { Alert } from '../../../shared/ui/alert';
import { Loading } from '../../../shared/ui/loading';
import { Pager } from '../../../shared/ui/pager';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog';
import { ConsumptionGroup, PaymentInput, Payment } from '../domain/sale';
import { exactDecimal } from './form-validators';
import { pen } from '../../../shared/domain/records';
import { dateLima } from '../../inventario/domain/inventory';
import { StockCards } from '../../inventario/presentation/stock-ui';
import { SaleCheckoutContext } from './sale-checkout-context';
@Component({
  selector: 'bm-sale-detail',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    FinanceNav,
    FinanceFeedback,
    ConsumptionReview,
    PaymentForm,
    Alert,
    Loading,
    Pager,
    StockCards,
  ],
  providers: [SalesFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sale-detail.html',
})
export class SaleDetailPage {
  readonly checkout = inject(SaleCheckoutContext, { optional: true });
  readonly facade = inject(SalesFacade);
  readonly session = inject(SessionStore);
  private readonly dialog = inject(MatDialog);
  private id = 0;
  readonly money = pen;
  readonly date = dateLima;
  readonly Number = Number;
  readonly confirming = signal(false);
  readonly paymentReset = signal(0);
  private readonly fb = inject(FormBuilder);
  readonly reason = this.fb.nonNullable.group({
    motivo: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(250)]],
    error_confirmado: false,
  });
  readonly advance = this.fb.nonNullable.group({
    anticipo: ['', [Validators.required, Validators.pattern(/^[1-9]\d*$/)]],
    monto: ['', exactDecimal(2, true)],
    revisado: [false, Validators.requiredTrue],
  });
  constructor() {
    if (this.checkout) {
      this.id = this.checkout.saleId()!;
      void this.refresh();
      return;
    }
    inject(ActivatedRoute)
      .paramMap.pipe(takeUntilDestroyed())
      .subscribe((params) => {
        this.id = Number(params.get('id'));
        void this.refresh();
      });
  }
  locked() {
    return (
      this.facade.loading() ||
      this.facade.busy() ||
      this.facade.changing() ||
      this.facade.intent.busy() ||
      this.facade.intent.uncertain() ||
      this.confirming()
    );
  }
  async refresh() {
    await this.facade.get(this.id);
    this.paymentReset.update((value) => value + 1);
    if (this.facade.record()?.estado === 'BORRADOR') await this.facade.previewSale();
  }
  async recovered() {
    await this.refresh();
    if (
      this.session.hasPermission('negocio.view_articulos') &&
      this.facade.record()?.estado === 'CONFIRMADA'
    )
      await this.facade.refreshStock();
  }
  async confirmation(title: string, description: string, action: () => Promise<unknown>) {
    if (this.locked()) return;
    this.confirming.set(true);
    try {
      if (
        await firstValueFrom(
          this.dialog
            .open(ConfirmDialog, { data: { title, description, confirm: 'Confirmar' } })
            .afterClosed(),
        )
      )
        await action();
    } finally {
      this.confirming.set(false);
    }
  }
  confirm(groups: ConsumptionGroup[]) {
    return this.confirmation(
      'Confirmar venta #' + this.id,
      'Total oficial ' +
        this.money(this.facade.record()!.total) +
        '. Se registrarán los consumos y salidas de stock, y finalizará la visita. El cobro se registra después.',
      () => this.facade.confirm(groups),
    );
  }
  pay(body: PaymentInput) {
    return this.confirmation(
      'Registrar cobro de ' + this.money(body.monto),
      'Venta #' +
        this.id +
        ' · ' +
        body.metodo +
        '. Saldo consultado: ' +
        this.money(this.facade.record()!.saldo.saldo_pendiente) +
        '. Confirma que recibiste este dinero y que no corresponde a un anticipo ya registrado.',
      async () => {
        if (await this.facade.pay(body)) this.paymentReset.update((value) => value + 1);
      },
    );
  }
  cancel() {
    if (this.reason.invalid) return;
    return this.confirmation(
      'Anular borrador',
      'Esta acción conserva el historial. No revierte una venta confirmada.',
      () =>
        this.facade.mutate('venta.anular', 'anular/', {
          motivo: this.reason.controls.motivo.value.trim(),
        }),
    );
  }
  apply() {
    if (this.advance.invalid) return;
    return this.confirmation(
      'Aplicar anticipo existente',
      'La aplicación cubre saldo con dinero recibido previamente. No registra otro ingreso.',
      async () => {
        if (
          await this.facade.mutate('anticipo.aplicar', 'aplicar-anticipo/', {
            anticipo_id: Number(this.advance.controls.anticipo.value),
            monto: this.advance.controls.monto.value,
          })
        )
          this.advance.reset();
      },
    );
  }
  voidPayment(payment: Payment) {
    if (this.reason.invalid || !this.reason.controls.error_confirmado.value) return;
    return this.confirmation(
      'Anular error de registro del pago #' + payment.id,
      'Solo corrige un error de registro y vuelve a abrir saldo. No devuelve dinero, revierte la venta ni repone inventario.',
      () => this.facade.voidPayment(payment.id, this.reason.controls.motivo.value.trim()),
    );
  }
}
