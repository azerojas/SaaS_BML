import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { SessionStore } from '../../../core/auth/application/session-store';
import { AgendaApi } from '../infrastructure/agenda-api';
import { AgendaIntent } from '../application/agenda-intent';
import { Availability, MutationResult, Slot, WaitEntry } from '../domain/agenda';
import { ReportResource } from '../../dashboard/application/report-resource';
import { RecordState } from '../../../shared/application/operation-state';
import { limaToday, addDays } from '../../dashboard/domain/periods';
import { ClientPicker } from '../../ventas/presentation/client-picker';
import { Clienta } from '../../clientas/domain/clienta';
import { CatalogRecord } from '../../catalogo/domain/catalog';
import { ServicePicker } from './service-picker';
import { SlotPicker } from './slot-picker';
import { AgendaFeedback } from './agenda-feedback';
import { Alert } from '../../../shared/ui/alert';
import { map } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
@Component({
  selector: 'bm-waitlist-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    ClientPicker,
    ServicePicker,
    SlotPicker,
    AgendaFeedback,
    Alert,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<a routerLink="/admin/agenda">Volver a agenda</a>
    <h1>Lista de espera</h1>
    <bm-agenda-feedback (done)="done($event)" />
    @if (id) {
      <a routerLink="/admin/agenda/lista-espera">Volver a solicitudes</a>
      @if (detail.loading()) {
        <p role="status">Cargando solicitud…</p>
      }
      @if (detail.error(); as error) {
        <bm-alert [message]="error" /><button type="button" (click)="loadDetail()">
          Reintentar solicitud
        </button>
      }
      @if (detail.record(); as entry) {
        <section class="surface">
          <h2>Solicitud #{{ entry.id }} · {{ entry.estado }}</h2>
          <p>
            Clienta #{{ entry.clienta_id }} · Servicio #{{ entry.servicio_id }} ·
            {{ entry.fecha_deseada }} · {{ entry.franja_inicio || 'Día completo' }}–{{
              entry.franja_fin || ''
            }}
          </p>
          <p>Profesional: {{ entry.profesional_id || 'Cualquiera compatible' }}</p>
          @if (entry.cita_id) {
            <a [routerLink]="['/admin/agenda/citas', entry.cita_id]"
              >Abrir cita #{{ entry.cita_id }}</a
            >
          }
        </section>
        @if (session.hasPermission('agenda.manage_waitlist') && active(entry.estado)) {
          <form class="surface" [formGroup]="actionForm">
            <label
              >Motivo de cancelación de espera<input
                formControlName="reason"
                minlength="8"
                maxlength="250" /></label
            ><label
              ><input type="checkbox" formControlName="offered" />La oferta se comunicó manualmente
              a la clienta.</label
            ><button
              type="button"
              [disabled]="
                intent.busy() || !actionForm.controls.offered.value || entry.estado !== 'ACTIVA'
              "
              (click)="offer()"
            >
              Registrar oferta manual</button
            ><label
              ><input type="checkbox" formControlName="reviewed" />Confirmo la operación sobre esta
              solicitud.</label
            ><button
              type="button"
              [disabled]="
                intent.busy() ||
                actionForm.controls.reason.invalid ||
                !actionForm.controls.reviewed.value
              "
              (click)="cancel()"
            >
              Cancelar solicitud
            </button>
            <p>Este sistema no envía mensajes ni notificaciones.</p>
          </form>
          @if (session.hasPermission('agenda.manage_appointments')) {
            <h2>Convertir en reserva</h2>
            <bm-slot-picker
              [services]="ids()"
              [date]="entry.fecha_deseada"
              [preferredProfessional]="entry.profesional_id"
              [refresh]="refresh()"
              [disabled]="intent.busy()"
              (picked)="selectSlot($event)"
            />
            @if (slotError(); as error) {
              <bm-alert [message]="error" />
            }
            <button
              type="button"
              [disabled]="intent.busy() || !choice() || !actionForm.controls.reviewed.value"
              (click)="convert()"
            >
              Convertir solicitud en cita
            </button>
            <p>
              Solo se admite la fecha, franja y profesional solicitados. Django crea la cita y
              resuelve la espera en una única transacción.
            </p>
          }
        }
      }
    } @else {
      <form class="surface agenda-filters" [formGroup]="filter" (ngSubmit)="load()">
        <label>Desde<input type="date" formControlName="from" /></label
        ><label>Hasta (exclusiva)<input type="date" formControlName="to" /></label
        ><label
          >Estado de espera<select formControlName="state">
            <option value="">Todos</option>
            @for (state of states; track state) {
              <option [value]="state">{{ state }}</option>
            }
          </select></label
        ><label
          >Profesional de espera (ID)<input
            type="number"
            min="1"
            formControlName="professional" /></label
        ><label
          >Servicio de espera (ID)<input type="number" min="1" formControlName="service" /></label
        ><button type="submit">Filtrar lista de espera</button>
      </form>
      @if (rows.loading()) {
        <p role="status">Cargando lista de espera…</p>
      }
      @if (rows.error(); as error) {
        <bm-alert [message]="error" /><button type="button" (click)="load()">
          Reintentar lista de espera
        </button>
      }
      <div class="agenda-options">
        @for (entry of rows.data(); track entry.id) {
          <a [routerLink]="[entry.id]"
            >Solicitud #{{ entry.id }} · Clienta #{{ entry.clienta_id }} ·
            {{ entry.fecha_deseada }} · {{ entry.estado }}</a
          >
        } @empty {
          <p>No hay solicitudes en este rango.</p>
        }
      </div>
      @if (session.hasPermission('agenda.manage_waitlist')) {
        <h2>Nueva solicitud de espera</h2>
        @if (session.hasPermission('negocio.view_clientas')) {
          <bm-client-picker [disabled]="intent.busy()" (picked)="client.set($event)" />
        } @else {
          <bm-alert
            message="Se requiere permiso de lectura de clientas para registrar solicitudes."
          />
        }
        <bm-agenda-services [disabled]="intent.busy()" (picked)="service.set($event)" />
        <p>
          Clienta: {{ client()?.nombres || 'Sin seleccionar' }} · Servicio:
          {{ service()?.nombre || 'Sin seleccionar' }}
        </p>
        <form class="surface" [formGroup]="form" (ngSubmit)="create()">
          <label>Fecha deseada<input type="date" formControlName="date" /></label
          ><label
            >ID de profesional preferido (opcional)<input
              type="number"
              min="1"
              formControlName="professional" /></label
          ><label>Franja desde (opcional)<input type="time" formControlName="begin" /></label
          ><label>Franja hasta (opcional)<input type="time" formControlName="end" /></label
          ><button
            type="submit"
            [disabled]="intent.busy() || !client() || !service() || form.invalid"
          >
            Crear solicitud de espera
          </button>
        </form>
      }
    }`,
})
export class WaitlistPage {
  readonly session = inject(SessionStore);
  readonly intent = inject(AgendaIntent);
  private readonly api = inject(AgendaApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  get id() {
    return this.route.snapshot.paramMap.get('id');
  }
  readonly states = ['ACTIVA', 'NOTIFICADA', 'CONVERTIDA', 'CANCELADA'];
  readonly rows = new ReportResource<WaitEntry[]>((q) => {
    const query = { ...q };
    delete query['service'];
    return this.api
      .all<WaitEntry>('lista-espera/', query)
      .pipe(
        map((rows) =>
          q['service'] ? rows.filter((row) => row.servicio_id === Number(q['service'])) : rows,
        ),
      );
  });
  readonly detail = new RecordState<WaitEntry>();
  readonly client = signal<Clienta | null>(null);
  readonly service = signal<CatalogRecord | null>(null);
  readonly choice = signal<{ slot: Slot; availability: Availability } | null>(null);
  readonly ids = computed(() => (this.detail.record() ? [this.detail.record()!.servicio_id] : []));
  readonly refresh = signal(0);
  readonly slotError = signal<string | null>(null);
  readonly filter = this.fb.nonNullable.group({
    from: limaToday(),
    to: addDays(limaToday(), 30),
    state: '',
    professional: '',
    service: '',
  });
  readonly form = this.fb.nonNullable.group({
    date: [limaToday(), Validators.required],
    professional: '',
    begin: '',
    end: '',
  });
  readonly actionForm = this.fb.nonNullable.group({
    reason: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(250)]],
    offered: false,
    reviewed: false,
  });
  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe(() => {
      if (this.id) this.loadDetail();
      else this.load();
    });
  }
  load() {
    const value = this.filter.getRawValue();
    this.rows.load({
      desde: value.from,
      hasta: value.to,
      ...(value.state ? { estado: value.state } : {}),
      ...(value.professional ? { profesional_id: value.professional } : {}),
      ...(value.service ? { service: value.service } : {}),
    });
  }
  loadDetail() {
    this.choice.set(null);
    void this.detail.load(this.api.get<WaitEntry>('lista-espera/' + this.id + '/'));
  }
  active(state: string) {
    return ['ACTIVA', 'NOTIFICADA'].includes(state);
  }
  async create() {
    const client = this.client(),
      service = this.service(),
      value = this.form.getRawValue();
    if (!client || !service || this.form.invalid) return;
    if (Boolean(value.begin) !== Boolean(value.end) || (value.begin && value.begin >= value.end)) {
      this.intent.error.set('La franja requiere ambos extremos, con inicio anterior al fin.');
      return;
    }
    const result = await this.intent.send(this.api.path('lista-espera/'), {
      clienta_id: client.id,
      servicio_id: service.id,
      fecha_deseada: value.date,
      ...(value.professional ? { profesional_id: Number(value.professional) } : {}),
      ...(value.begin ? { franja_inicio: value.begin, franja_fin: value.end } : {}),
    });
    if (result) this.done(result);
  }
  async offer() {
    if (!this.actionForm.controls.offered.value) return;
    if (
      await this.intent.send(this.api.path('lista-espera/' + this.id + '/oferta-manual/'), {
        oferta_registrada_manualmente: true,
      })
    )
      this.loadDetail();
  }
  async cancel() {
    if (this.actionForm.controls.reason.invalid || !this.actionForm.controls.reviewed.value) return;
    if (
      await this.intent.send(this.api.path('lista-espera/' + this.id + '/cancelar/'), {
        motivo: this.actionForm.controls.reason.value,
      })
    )
      this.loadDetail();
  }
  selectSlot(chosen: { slot: Slot; availability: Availability } | null) {
    this.slotError.set(null);
    this.choice.set(null);
    if (!chosen) return;
    const entry = this.detail.record();
    if (!entry) return;
    const local = (instant: string) => new Date(Date.parse(instant) - 5 * 3600000).toISOString();
    const begin = local(chosen.slot.inicio_en),
      end = local(chosen.slot.fin_en);
    if (
      chosen.availability.fecha_local !== entry.fecha_deseada ||
      (entry.profesional_id && chosen.availability.profesional_id !== entry.profesional_id) ||
      (entry.franja_inicio &&
        (begin.slice(0, 10) !== end.slice(0, 10) ||
          begin.slice(11, 19) < entry.franja_inicio ||
          end.slice(11, 19) > entry.franja_fin!))
    ) {
      this.slotError.set('Elige un horario dentro de la fecha, franja y profesional solicitados.');
      return;
    }
    this.choice.set(chosen);
  }
  async convert() {
    const chosen = this.choice();
    if (!chosen || !this.actionForm.controls.reviewed.value) return;
    const result = await this.intent.send(
      this.api.path('lista-espera/' + this.id + '/convertir/'),
      { inicio_en: chosen.slot.inicio_en, profesional_id: chosen.availability.profesional_id },
    );
    if (result) this.done(result);
    else if (this.intent.failure()?.status === 409) {
      this.choice.set(null);
      this.refresh.update((n) => n + 1);
      this.loadDetail();
    }
  }
  done(result: MutationResult) {
    if (result.cita_id) void this.router.navigate(['/admin/agenda/citas', result.cita_id]);
    else if (result.espera_id)
      void this.router.navigate(['/admin/agenda/lista-espera', result.espera_id]);
    else if (this.id) this.loadDetail();
    else this.load();
  }
}
