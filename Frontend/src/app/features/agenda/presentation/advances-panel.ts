import { ChangeDetectionStrategy, Component, effect, inject, input, output } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { SessionStore } from '../../../core/auth/application/session-store';
import { ReportResource } from '../../dashboard/application/report-resource';
import { AgendaApi } from '../infrastructure/agenda-api';
import { AgendaIntent } from '../application/agenda-intent';
import { Advance, AppointmentDetail } from '../domain/agenda';
import { Alert } from '../../../shared/ui/alert';
import { PAYMENT_METHODS } from '../../ventas/domain/sale';
import { localDateTime, money } from '../../dashboard/domain/analytics';
@Component({
  selector: 'bm-advances-panel',
  imports: [ReactiveFormsModule, Alert],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<section class="surface">
    <h2>Anticipos de la cita</h2>
    <p>
      Requerido: {{ money(cita().anticipo_requerido) }} · Confirmado:
      {{ money(cita().anticipo_confirmado) }} · Pendiente según Django:
      {{ money(cita().anticipo_pendiente) }}
    </p>
    @if (cita().expira_en) {
      <p>
        Plazo de pago: {{ localDateTime(cita().expira_en!) }} · Estado oficial: {{ cita().estado }}
      </p>
    }
    <p>
      El vencimiento se refleja cuando Django cambia la cita a EXPIRADA. Cancelar una cita no
      devuelve ni anula automáticamente su anticipo.
    </p>
    @if (rows.loading()) {
      <p role="status">Cargando anticipos…</p>
    }
    @if (rows.error(); as error) {
      <bm-alert [message]="error" /><button type="button" (click)="reload()">
        Reintentar anticipos
      </button>
    }
    @for (advance of rows.data(); track advance.id) {
      <article class="agenda-event">
        <strong>Anticipo #{{ advance.id }} · {{ advance.estado }}</strong
        ><span
          >{{ money(advance.monto) }} · {{ advance.metodo }} ·
          {{ advance.referencia || 'Sin referencia' }}</span
        >
        @if (session.hasPermission('finanzas.manage_advances') && advance.estado === 'PENDIENTE') {
          <button
            type="button"
            [disabled]="intent.busy() || !form.controls.verified.value"
            (click)="confirm(advance.id)"
          >
            Confirmar anticipo #{{ advance.id }}
          </button>
        }
        @if (session.hasPermission('finanzas.manage_advances') && advance.estado === 'PENDIENTE') {
          <button
            type="button"
            [disabled]="
              intent.busy() || form.controls.reason.invalid || !form.controls.reviewed.value
            "
            (click)="voidAdvance(advance.id)"
          >
            Anular anticipo #{{ advance.id }}
          </button>
        }
      </article>
    } @empty {
      <p>No hay anticipos registrados.</p>
    }
    @if (session.hasPermission('finanzas.manage_advances')) {
      <form [formGroup]="form" (ngSubmit)="create()">
        <label
          >Método de pago<select formControlName="method">
            @for (method of methods; track method) {
              <option [value]="method">{{ method }}</option>
            }
          </select></label
        ><label
          >Monto del anticipo (PEN)<input inputmode="decimal" formControlName="amount" /></label
        ><label>Referencia de pago<input maxlength="100" formControlName="reference" /></label
        ><label
          ><input type="checkbox" formControlName="verified" />He verificado manualmente el cobro y
          su referencia.</label
        ><label
          >Motivo de anulación<input
            formControlName="reason"
            minlength="8"
            maxlength="250" /></label
        ><label
          ><input type="checkbox" formControlName="reviewed" />Confirmo la operación sobre este
          anticipo.</label
        ><button
          type="submit"
          [disabled]="
            intent.busy() ||
            form.controls.amount.invalid ||
            !form.controls.reviewed.value ||
            !['PENDIENTE_PAGO', 'PROGRAMADA', 'CONFIRMADA'].includes(cita().estado)
          "
        >
          Registrar anticipo pendiente
        </button>
      </form>
    }
  </section>`,
})
export class AdvancesPanel {
  readonly cita = input.required<AppointmentDetail>();
  readonly refresh = input(0);
  readonly changed = output<void>();
  readonly session = inject(SessionStore);
  readonly intent = inject(AgendaIntent);
  private readonly api = inject(AgendaApi);
  readonly methods = PAYMENT_METHODS;
  readonly money = money;
  readonly localDateTime = localDateTime;
  readonly form = inject(FormBuilder).nonNullable.group({
    method: 'EFECTIVO',
    amount: ['', [Validators.required, Validators.pattern(/^\d{1,10}(\.\d{1,2})?$/)]],
    reference: ['', Validators.maxLength(100)],
    verified: false,
    reason: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(250)]],
    reviewed: false,
  });
  readonly rows = new ReportResource<Advance[]>((q) => this.api.advances(Number(q['cita'])));
  constructor() {
    effect(() => {
      this.refresh();
      this.reload();
    });
  }
  reload() {
    this.rows.load({ cita: this.cita().id });
  }
  async create() {
    if (this.form.controls.amount.invalid || !this.form.controls.reviewed.value) return;
    const value = this.form.getRawValue();
    if (
      await this.intent.send('/api/anticipos/', {
        cita_id: this.cita().id,
        metodo: value.method,
        monto: value.amount,
        referencia: value.reference,
      })
    ) {
      this.reload();
      this.changed.emit();
      this.form.controls.reviewed.setValue(false);
    }
  }
  async confirm(id: number) {
    if (!this.form.controls.verified.value) return;
    if (
      await this.intent.send('/api/anticipos/' + id + '/confirmar/', {
        verificado_manualmente: true,
      })
    ) {
      this.reload();
      this.changed.emit();
      this.form.controls.verified.setValue(false);
    }
  }
  async voidAdvance(id: number) {
    if (this.form.controls.reason.invalid || !this.form.controls.reviewed.value) return;
    if (
      await this.intent.send('/api/anticipos/' + id + '/anular/', {
        motivo: this.form.controls.reason.value,
      })
    ) {
      this.reload();
      this.changed.emit();
      this.form.controls.reviewed.setValue(false);
    }
  }
}
