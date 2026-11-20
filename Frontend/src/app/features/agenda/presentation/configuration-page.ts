import { UnsavedForm } from '../../../core/forms/unsaved-form';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { SessionStore } from '../../../core/auth/application/session-store';
import { RecordState } from '../../../shared/application/operation-state';
import { AgendaApi } from '../infrastructure/agenda-api';
import { AgendaIntent } from '../application/agenda-intent';
import { AgendaFeedback } from './agenda-feedback';
import { Alert } from '../../../shared/ui/alert';
interface Config {
  reservas_online_activas: boolean;
  intervalo_slots_minutos: number;
  anticipacion_minima_minutos: number;
  anticipacion_maxima_dias: number;
  horas_limite_cancelacion: number;
  anticipo_porcentaje: string;
  minutos_expiracion_pago: number;
  max_citas_activas_por_clienta: number;
}
interface ConfigStatus extends Config {
  anticipos_habilitados: boolean;
  canal_online_habilitado: boolean;
}
@Component({
  selector: 'bm-agenda-configuration',
  imports: [ReactiveFormsModule, RouterLink, AgendaFeedback, Alert, UnsavedForm],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<a routerLink="/admin/agenda">Volver a agenda</a>
    <h1>Políticas de reserva</h1>
    <bm-agenda-feedback (done)="load()" />
    @if (state.loading()) {
      <p role="status">Cargando políticas…</p>
    }
    @if (state.error(); as error) {
      <bm-alert [message]="error" /><button type="button" (click)="load()">
        Reintentar políticas
      </button>
    }
    @if (state.record()) {
      <form bmUnsavedForm class="surface" [formGroup]="form" (ngSubmit)="save()">
        <label
          ><input type="checkbox" formControlName="reservas_online_activas" />Habilitar reservas
          online según configuración del servidor</label
        >
        @for (field of fields; track field.key) {
          <label
            >{{ field.label
            }}<input
              [formControlName]="field.key"
              [attr.inputmode]="field.key === 'anticipo_porcentaje' ? 'decimal' : 'numeric'"
          /></label>
        }
        @if (!state.record()?.anticipos_habilitados) {
          <p>
            Las citas nuevas se reservan sin anticipo. Los anticipos históricos conservan su
            registro.
          </p>
        }
        @if (!state.record()?.canal_online_habilitado) {
          <p>
            El canal online aún necesita su activación en el servidor. Las solicitudes requieren
            confirmación del salón.
          </p>
        }
        <p>El plazo de cambios se aplica también a la reprogramación de las clientas.</p>
        @if (session.hasPermission('agenda.configure_agenda')) {
          <button type="submit" [disabled]="intent.busy() || form.invalid">
            Guardar políticas
          </button>
        }
      </form>
    }`,
})
export class ConfigurationPage {
  readonly session = inject(SessionStore);
  readonly intent = inject(AgendaIntent);
  private readonly api = inject(AgendaApi);
  readonly state = new RecordState<ConfigStatus>();
  readonly form = inject(FormBuilder).nonNullable.group({
    reservas_online_activas: false,
    intervalo_slots_minutos: 15,
    anticipacion_minima_minutos: 0,
    anticipacion_maxima_dias: 30,
    horas_limite_cancelacion: 24,
    anticipo_porcentaje: '0.00',
    minutos_expiracion_pago: 30,
    max_citas_activas_por_clienta: 3,
  });
  readonly fields: { key: Exclude<keyof Config, 'reservas_online_activas'>; label: string }[] = [
    { key: 'intervalo_slots_minutos', label: 'Intervalo entre huecos (minutos)' },
    { key: 'anticipacion_minima_minutos', label: 'Anticipación mínima (minutos)' },
    { key: 'anticipacion_maxima_dias', label: 'Horizonte de reservas (días)' },
    { key: 'horas_limite_cancelacion', label: 'Límite de cancelación (horas)' },
    { key: 'anticipo_porcentaje', label: 'Porcentaje de anticipo' },
    { key: 'minutos_expiracion_pago', label: 'Plazo de pago (minutos)' },
    { key: 'max_citas_activas_por_clienta', label: 'Máximo de citas activas por clienta' },
  ];
  constructor() {
    if (!this.session.hasPermission('agenda.configure_agenda')) this.form.disable();
    void this.load();
  }
  async load() {
    await this.state.load(this.api.get<ConfigStatus>('calendario/configuracion/'));
    const value = this.state.record();
    if (value) this.form.reset(value);
  }
  async save() {
    if (!this.session.hasPermission('agenda.configure_agenda') || this.form.invalid) return;
    const value = this.form.getRawValue();
    const payload = { ...value };
    for (const field of this.fields) {
      if (field.key === 'anticipo_porcentaje') continue;
      const key = field.key;
      payload[key] = Number(value[key]);
    }
    if (await this.intent.send(this.api.path('calendario/configuracion/'), payload, 'PATCH'))
      await this.load();
  }
}
