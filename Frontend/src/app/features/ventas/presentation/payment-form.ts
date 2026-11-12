import { ChangeDetectionStrategy, Component, effect, inject, input, output } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { PaymentInput, PAYMENT_METHODS } from '../domain/sale';
import { exactDecimal } from './form-validators';
@Component({
  selector: 'bm-payment-form',
  imports: [ReactiveFormsModule, MatButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<form class="surface phase4-form section-gap" [formGroup]="form" (ngSubmit)="submit()">
    <h2>Registrar dinero recibido</h2>
    <p>
      Registra solo un cobro nuevo, después de verificarlo. Aplicar un anticipo se hace por
      separado.
    </p>
    <fieldset [disabled]="disabled()">
      <label for="payment-method">Medio de pago</label
      ><select id="payment-method" formControlName="metodo">
        @for (method of methods; track method) {
          <option [value]="method">{{ method }}</option>
        }
      </select>
      <label for="payment-amount">Monto recibido (PEN)</label
      ><input id="payment-amount" formControlName="monto" inputmode="decimal" required />
      <label for="payment-reference">Referencia de operación (obligatoria salvo efectivo)</label
      ><input
        id="payment-reference"
        formControlName="referencia"
        maxlength="100"
        autocomplete="off"
      />
      <label class="check-row"
        ><input type="checkbox" formControlName="verificado" /> Verifiqué personalmente la recepción
        de este dinero. No es una solicitud de pago.</label
      >
      @if (invalid) {
        <p role="alert">
          Ingresa un monto positivo y verifica el cobro. Los medios distintos de efectivo requieren
          referencia.
        </p>
      }
      <button mat-flat-button type="submit" [disabled]="form.invalid">
        Revisar y registrar cobro
      </button>
    </fieldset>
  </form>`,
})
export class PaymentForm {
  readonly disabled = input(false);
  readonly resetVersion = input(0);
  readonly submitted = output<PaymentInput>();
  readonly methods = PAYMENT_METHODS;
  readonly form = inject(FormBuilder).nonNullable.group({
    metodo: ['EFECTIVO' as PaymentInput['metodo'], Validators.required],
    monto: ['', exactDecimal(2, true)],
    referencia: ['', Validators.maxLength(100)],
    verificado: [false, Validators.requiredTrue],
  });
  invalid = false;
  constructor() {
    effect(() => {
      this.resetVersion();
      this.form.reset();
      this.invalid = false;
    });
  }
  submit() {
    const raw = this.form.getRawValue();
    this.invalid = this.form.invalid || (raw.metodo !== 'EFECTIVO' && !raw.referencia.trim());
    if (this.invalid || this.disabled()) return;
    this.submitted.emit({
      metodo: raw.metodo,
      monto: raw.monto,
      referencia: raw.referencia.trim(),
      verificado_manualmente: true,
    });
  }
}
