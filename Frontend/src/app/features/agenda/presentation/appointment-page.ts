import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { SessionStore } from '../../../core/auth/application/session-store';
import { RecordState } from '../../../shared/application/operation-state';
import { AgendaApi } from '../infrastructure/agenda-api';
import { AgendaIntent } from '../application/agenda-intent';
import { AppointmentDetail, Availability, Slot } from '../domain/agenda';
import { AgendaFeedback } from './agenda-feedback';
import { SlotPicker } from './slot-picker';
import { AdvancesPanel } from './advances-panel';
import { localDateTime, money } from '../../dashboard/domain/analytics';
import { Alert } from '../../../shared/ui/alert';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
@Component({
  selector: 'bm-appointment-page',
  imports: [ReactiveFormsModule, RouterLink, Alert, AgendaFeedback, SlotPicker, AdvancesPanel],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<a routerLink="/admin/agenda">Volver a agenda</a>
    <h1>Detalle de cita</h1>
    <bm-agenda-feedback (done)="load()" />
    @if (state.loading()) {
      <p role="status">Cargando cita…</p>
    }
    @if (state.error(); as error) {
      <bm-alert [message]="error" /><button type="button" (click)="load()">Reintentar cita</button>
    }
    @if (state.record(); as cita) {
      <section class="surface">
        <h2>Cita #{{ cita.id }} · {{ cita.estado }}</h2>
        <p>Clienta #{{ cita.clienta_id }} · Profesional #{{ cita.profesional_id }}</p>
        <p>
          {{ localDateTime(cita.inicio_en) }} – {{ localDateTime(cita.fin_en) }} ·
          {{ cita.duracion_total_minutos }} minutos
        </p>
        <p>Total oficial: {{ money(cita.precio_total) }} · {{ cita.origen }}</p>
        <p>{{ cita.notas || 'Sin notas' }}</p>
        <h3>Servicios reservados (snapshot)</h3>
        <ul>
          @for (service of cita.servicios; track service.id) {
            <li>
              Servicio #{{ service.servicio_id }} · {{ service.duracion_minutos }} minutos ·
              {{ money(service.precio_snapshot) }}
            </li>
          }
        </ul>
        @if (cita.visita_id && session.hasPermission('finanzas.view_finance')) {
          <a [routerLink]="['/admin/visitas', cita.visita_id]"
            >Abrir visita #{{ cita.visita_id }}</a
          >
        }
      </section>
      @if (session.hasPermission('finanzas.view_finance')) {
        <bm-advances-panel [cita]="cita" [refresh]="refresh()" (changed)="load()" />
      }
      @if (session.hasPermission('agenda.manage_appointments')) {
        <section class="surface">
          <h2>Gestionar cita</h2>
          <form [formGroup]="actionForm" (ngSubmit)="action()">
            <label
              >Acción<select formControlName="action" aria-label="Acción">
                <option value="confirmar">Confirmar</option>
                <option value="cancelar">Cancelar</option>
                <option value="no-asistio">Registrar inasistencia</option>
                <option value="completar">
                  Completar con visita finalizada y venta confirmada
                </option>
              </select></label
            ><label
              >Motivo de cancelación o inasistencia<textarea
                formControlName="reason"
                maxlength="250"
              ></textarea>
            </label>
            @if (session.hasPermission('agenda.override_policy')) {
              <label
                ><input type="checkbox" formControlName="override" />Autorizar cancelación fuera de
                plazo</label
              >
            }
            <label
              ><input type="checkbox" formControlName="reviewed" />He revisado la acción y sus
              consecuencias.</label
            ><button
              type="submit"
              [disabled]="
                intent.busy() || !actionForm.controls.reviewed.value || !actionAllowed(cita.estado)
              "
            >
              Ejecutar acción de cita
            </button>
          </form>
        </section>
        @if (active(cita.estado) && !cita.visita_id) {
          <section class="surface">
            <h2>Reprogramar cita</h2>
            <p>
              Se conservan los servicios y precios reservados. Django valida nuevamente la duración
              y las políticas.
            </p>
            <bm-slot-picker
              [services]="ids()"
              [refresh]="refresh()"
              [disabled]="intent.busy()"
              (picked)="choice.set($event)"
            />
            <form [formGroup]="rescheduleForm" (ngSubmit)="reschedule()">
              <label
                >Motivo de reprogramación<input
                  formControlName="reason"
                  minlength="8"
                  maxlength="250" /></label
              ><label
                ><input type="checkbox" formControlName="reviewed" />Confirmo el nuevo profesional y
                horario.</label
              ><button
                type="submit"
                [disabled]="intent.busy() || !choice() || rescheduleForm.invalid"
              >
                Guardar reprogramación
              </button>
            </form>
          </section>
        }
      }
      @if (
        session.hasPermission('agenda.link_arrivals') && active(cita.estado) && !cita.visita_id
      ) {
        <form class="surface" [formGroup]="arrivalForm" (ngSubmit)="link()">
          <h2>Vincular llegada confirmada</h2>
          @if (session.hasPermission('negocio.view_llegadas')) {
            <a routerLink="/admin/llegadas">Consultar bandeja de llegadas e identidad confirmada</a>
          }
          <label
            >ID de llegada confirmada<input
              type="number"
              min="1"
              formControlName="arrival" /></label
          ><label
            ><input type="checkbox" formControlName="reviewed" />Confirmé presencialmente la
            identidad de esta clienta.</label
          ><button type="submit" [disabled]="intent.busy() || arrivalForm.invalid">
            Vincular llegada a cita
          </button>
          <p>Django exige la misma clienta, ventana horaria compatible y una única visita.</p>
        </form>
      }
      <section class="surface">
        <h2>Historial</h2>
        <ol>
          @for (event of cita.historial; track event.id) {
            <li>
              {{ localDateTime(event.cambiado_en) }} · {{ event.estado_anterior }} →
              {{ event.estado_nuevo }} · {{ event.detalle }}
            </li>
          }
        </ol>
      </section>
    }`,
})
export class AppointmentPage {
  readonly session = inject(SessionStore);
  readonly intent = inject(AgendaIntent);
  private readonly api = inject(AgendaApi);
  private readonly route = inject(ActivatedRoute);
  readonly state = new RecordState<AppointmentDetail>();
  readonly refresh = signal(0);
  readonly ids = computed(() => this.state.record()?.servicios.map((row) => row.servicio_id) ?? []);
  readonly choice = signal<{ slot: Slot; availability: Availability } | null>(null);
  readonly localDateTime = localDateTime;
  readonly money = money;
  private readonly fb = inject(FormBuilder);
  readonly actionForm = this.fb.nonNullable.group({
    action: 'confirmar',
    reason: '',
    override: false,
    reviewed: false,
  });
  readonly rescheduleForm = this.fb.nonNullable.group({
    reason: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(250)]],
    reviewed: [false, Validators.requiredTrue],
  });
  readonly arrivalForm = this.fb.nonNullable.group({
    arrival: ['', [Validators.required, Validators.pattern(/^[1-9]\d*$/)]],
    reviewed: [false, Validators.requiredTrue],
  });
  private expiryChecked = '';
  constructor() {
    effect((onCleanup) => {
      const cita = this.state.record();
      if (!cita || cita.estado !== 'PENDIENTE_PAGO' || !cita.expira_en || this.intent.busy())
        return;
      const key = cita.id + ':' + cita.expira_en;
      if (this.expiryChecked === key) return;
      const remaining = Date.parse(cita.expira_en) - Date.now();
      if (!Number.isFinite(remaining)) return;
      const timer = setTimeout(
        () => {
          this.expiryChecked = key;
          this.load();
        },
        Math.max(0, remaining) + 1000,
      );
      onCleanup(() => clearTimeout(timer));
    });
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe(() => this.load());
  }
  load() {
    this.choice.set(null);
    this.refresh.update((n) => n + 1);
    void this.state.load(
      this.api.get<AppointmentDetail>('citas/' + this.route.snapshot.paramMap.get('id') + '/'),
    );
  }
  active(state: string) {
    return ['PENDIENTE_PAGO', 'PROGRAMADA', 'CONFIRMADA'].includes(state);
  }
  actionAllowed(state: string) {
    const action = this.actionForm.controls.action.value;
    return action === 'confirmar'
      ? ['PROGRAMADA', 'PENDIENTE_PAGO'].includes(state)
      : action === 'completar'
        ? state === 'CONFIRMADA'
        : this.active(state);
  }
  async action() {
    const cita = this.state.record(),
      value = this.actionForm.getRawValue();
    if (!cita || !value.reviewed || !this.actionAllowed(cita.estado)) return;
    const reasonNeeded = ['cancelar', 'no-asistio'].includes(value.action);
    if (reasonNeeded && (value.reason.trim().length < 8 || value.reason.length > 250)) {
      this.intent.error.set('Indica un motivo de 8 a 250 caracteres.');
      return;
    }
    const body =
      value.action === 'cancelar'
        ? { motivo: value.reason, fuera_plazo_autorizado: value.override }
        : reasonNeeded
          ? { motivo: value.reason }
          : {};
    if (
      await this.intent.send(this.api.path('citas/' + cita.id + '/' + value.action + '/'), body)
    ) {
      this.actionForm.controls.reviewed.setValue(false);
      this.load();
    }
  }
  async reschedule() {
    const cita = this.state.record(),
      chosen = this.choice();
    if (!cita || !chosen || this.rescheduleForm.invalid) return;
    if (
      await this.intent.send(this.api.path('citas/' + cita.id + '/reprogramar/'), {
        inicio_en: chosen.slot.inicio_en,
        profesional_id: chosen.availability.profesional_id,
        motivo: this.rescheduleForm.controls.reason.value,
      })
    ) {
      this.rescheduleForm.controls.reviewed.setValue(false);
      this.load();
    } else if (this.intent.failure()?.status === 409) {
      this.choice.set(null);
      this.refresh.update((n) => n + 1);
    }
  }
  async link() {
    const cita = this.state.record();
    if (!cita || this.arrivalForm.invalid) return;
    if (
      await this.intent.send(this.api.path('citas/' + cita.id + '/vincular-llegada/'), {
        llegada_id: Number(this.arrivalForm.controls.arrival.value),
      })
    )
      this.load();
  }
}
