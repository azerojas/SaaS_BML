import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin, throwError } from 'rxjs';
import { SessionStore } from '../../../core/auth/application/session-store';
import { AgendaApi } from '../infrastructure/agenda-api';
import {
  Appointment,
  APPOINTMENT_STATES,
  Block,
  CalendarView,
  Professional,
  Schedule,
  calendarDays,
  intersectsDay,
} from '../domain/agenda';
import { ReportResource } from '../../dashboard/application/report-resource';
import { addDays, limaToday } from '../../dashboard/domain/periods';
import { localDateTime } from '../../dashboard/domain/analytics';
import { Alert } from '../../../shared/ui/alert';
import { ServicePicker } from './service-picker';
import { AgendaFeedback } from './agenda-feedback';
import { AgendaIntent } from '../application/agenda-intent';
@Component({
  selector: 'bm-calendar-page',
  imports: [ReactiveFormsModule, RouterLink, Alert, ServicePicker, AgendaFeedback],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<header class="feature-heading">
      <div>
        <p class="eyebrow">Organización del salón</p>
        <h1>Agenda</h1>
        <p>Hora oficial: America/Lima · Solo citas guardadas en Django.</p>
      </div>
      <nav class="agenda-options" aria-label="Gestión de agenda">
        @if (session.hasPermission('agenda.manage_appointments')) {
          <a routerLink="citas/nueva">Nueva cita</a>
        }
        <a routerLink="profesionales">Profesionales y horarios</a
        ><a routerLink="bloqueos">Bloqueos</a><a routerLink="lista-espera">Lista de espera</a
        ><a routerLink="configuracion">Políticas de reserva</a>
      </nav>
    </header>
    <bm-agenda-feedback (done)="load()" />
    @if (session.hasPermission('agenda.manage_appointments')) {
      <button type="button" [disabled]="intent.busy()" (click)="expire()">
        Procesar vencimientos en Django
      </button>
    }
    <form class="surface agenda-filters" [formGroup]="form" (ngSubmit)="load()">
      <label
        >Vista<select formControlName="view" aria-label="Vista">
          <option value="day">Diaria</option>
          <option value="week">Semanal</option>
          <option value="month">Mensual</option>
        </select></label
      ><label>Fecha del calendario<input type="date" formControlName="date" /></label
      ><label for="calendar-professional"
        >Profesional del calendario
        @if (session.hasPermission('agenda.manage_professionals')) {
          <select id="calendar-professional" formControlName="professional">
            <option value="">Todos</option>
            @for (prof of professionals.data(); track prof.id) {
              <option [value]="prof.id">{{ prof.nombres }} {{ prof.apellidos }}</option>
            }
          </select>
        } @else {
          <input id="calendar-professional" type="number" min="1" formControlName="professional" />
        }</label
      ><label
        >Estado de cita<select formControlName="state">
          <option value="">Todos</option>
          @for (state of states; track state) {
            <option [value]="state">{{ state }}</option>
          }
        </select></label
      ><button type="submit">Aplicar filtros</button>
    </form>
    <details>
      <summary>Filtrar por servicio {{ service() ? '· #' + service() : '' }}</summary>
      <bm-agenda-services (picked)="service.set($event.id); load()" /><button
        type="button"
        (click)="service.set(null); load()"
      >
        Todos los servicios
      </button>
    </details>
    <div class="agenda-options">
      <button type="button" (click)="move(-1)">Anterior</button
      ><button type="button" (click)="today()">Hoy</button
      ><button type="button" (click)="move(1)">Siguiente</button>
    </div>
    @if (error(); as error) {
      <bm-alert [message]="error" />
    }
    @if (professionals.error(); as error) {
      <bm-alert [message]="error" /><button type="button" (click)="professionals.retry()">
        Reintentar profesionales
      </button>
    }
    @if (resource.loading()) {
      <p role="status">Cargando calendario, horarios y bloqueos…</p>
    }
    @if (resource.error(); as error) {
      <bm-alert [message]="error" /><button type="button" (click)="load()">
        Reintentar calendario
      </button>
    }
    @if (resource.data(); as data) {
      <p role="status">
        {{ data.appointments.length }} citas encontradas. Los espacios vacíos no representan
        disponibilidad.
      </p>
      <div
        class="agenda-calendar"
        [class.agenda-day]="view() === 'day'"
        [class.agenda-month]="view() === 'month'"
      >
        @for (day of days(); track day) {
          <section class="agenda-cell" [attr.aria-label]="day">
            <h2>{{ day }}</h2>
            @for (schedule of daySchedules(day, data.schedules); track schedule.id) {
              <p class="agenda-hours">
                {{ professionalName(schedule.profesional_id) }}: {{ schedule.hora_inicio }}–{{
                  schedule.hora_fin
                }}
              </p>
            }
            @for (block of dayBlocks(day, data.blocks); track block.id) {
              <div class="agenda-block">
                Bloqueo ·
                {{ block.profesional_id ? professionalName(block.profesional_id) : 'Todo el salón'
                }}<br />{{ localDateTime(block.inicio_en) }} – {{ localDateTime(block.fin_en)
                }}<br />{{ block.motivo }}
              </div>
            }
            @for (cita of dayAppointments(day, data.appointments); track cita.id) {
              <a
                class="agenda-event"
                [attr.data-state]="cita.estado"
                [routerLink]="['citas', cita.id]"
                ><strong>Cita #{{ cita.id }} · {{ cita.estado }}</strong
                ><span>{{ time(cita.inicio_en) }} – {{ time(cita.fin_en) }}</span
                ><span
                  >{{ professionalName(cita.profesional_id) }} · Clienta #{{
                    cita.clienta_id
                  }}</span
                ></a
              >
            }
          </section>
        }
      </div>
    }`,
})
export class CalendarPage {
  time(value: string) {
    return new Intl.DateTimeFormat('es-PE', {
      timeZone: 'America/Lima',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(new Date(value));
  }
  readonly intent = inject(AgendaIntent);
  async expire() {
    if (await this.intent.send(this.api.path('citas/expirar/'), {})) this.load();
  }
  readonly session = inject(SessionStore);
  readonly api = inject(AgendaApi);
  readonly states = APPOINTMENT_STATES;
  readonly localDateTime = localDateTime;
  readonly service = signal<number | null>(null);
  readonly error = signal<string | null>(null);
  readonly days = signal<string[]>([]);
  readonly view = signal<CalendarView>('week');
  readonly form = inject(FormBuilder).nonNullable.group({
    view: 'week' as CalendarView,
    date: limaToday(),
    professional: '',
    state: '',
  });
  readonly professionals = new ReportResource<Professional[]>(() =>
    this.session.hasPermission('agenda.manage_professionals')
      ? this.api.all<Professional>('profesionales/')
      : throwError(
          () =>
            new Error(
              'El listado de profesionales está restringido hasta que Django proteja sus comisiones. Puedes filtrar el calendario por ID.',
            ),
        ),
  );
  readonly resource = new ReportResource<{
    appointments: Appointment[];
    blocks: Block[];
    schedules: Schedule[];
  }>((query) => {
    const filter = { ...query };
    delete filter['estado'];
    return forkJoin({
      appointments: this.api.calendar(query, this.service()),
      blocks: this.api.all<Block>('bloqueos/', filter),
      schedules: this.api.all<Schedule>(
        'horarios/',
        query['profesional_id'] ? { profesional_id: query['profesional_id'] } : {},
      ),
    });
  });
  readonly count = computed(() => this.resource.data()?.appointments.length ?? 0);
  constructor() {
    this.professionals.load({});
    this.load();
  }
  load() {
    this.error.set(null);
    try {
      const value = this.form.getRawValue();
      const days = calendarDays(value.date, value.view);
      this.days.set(days);
      this.view.set(value.view);
      this.resource.load({
        desde: days[0],
        hasta: addDays(days.at(-1)!, 1),
        ...(value.professional ? { profesional_id: value.professional } : {}),
        ...(value.state ? { estado: value.state } : {}),
      });
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'Fecha inválida.');
    }
  }
  move(direction: number) {
    try {
      const value = this.form.getRawValue();
      if (value.view === 'month') {
        const date = new Date(value.date.slice(0, 7) + '-01T12:00:00Z');
        date.setUTCMonth(date.getUTCMonth() + direction);
        this.form.controls.date.setValue(date.toISOString().slice(0, 10));
      } else
        this.form.controls.date.setValue(
          addDays(value.date, direction * (value.view === 'week' ? 7 : 1)),
        );
      this.load();
    } catch {
      this.error.set('Selecciona una fecha válida.');
    }
  }
  today() {
    this.form.controls.date.setValue(limaToday());
    this.load();
  }
  professionalName(id: number) {
    const row = this.professionals.data()?.find((row) => row.id === id);
    return row ? row.nombres + ' ' + row.apellidos : 'Profesional #' + id;
  }
  dayAppointments(day: string, rows: Appointment[]) {
    return rows.filter((row) => intersectsDay(row, day));
  }
  dayBlocks(day: string, rows: Block[]) {
    return rows.filter((row) => intersectsDay(row, day));
  }
  daySchedules(day: string, rows: Schedule[]) {
    const weekday = ((new Date(day + 'T12:00:00Z').getUTCDay() + 6) % 7) + 1;
    return rows.filter((row) => row.dia_semana === weekday);
  }
}
