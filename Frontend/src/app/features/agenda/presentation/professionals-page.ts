import { UnsavedForm } from '../../../core/forms/unsaved-form';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { SessionStore } from '../../../core/auth/application/session-store';
import { AgendaApi } from '../infrastructure/agenda-api';
import { AgendaIntent } from '../application/agenda-intent';
import { Professional, Schedule } from '../domain/agenda';
import { ReportResource } from '../../dashboard/application/report-resource';
import { RecordState } from '../../../shared/application/operation-state';
import { AgendaFeedback } from './agenda-feedback';
import { ServicePicker } from './service-picker';
import { Alert } from '../../../shared/ui/alert';
import { throwError } from 'rxjs';
@Component({
  selector: 'bm-professionals-page',
  imports: [ReactiveFormsModule, RouterLink, AgendaFeedback, ServicePicker, Alert, UnsavedForm],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<a routerLink="/admin/agenda">Volver a agenda</a>
    <h1>Profesionales, especialidades y horarios</h1>
    <bm-agenda-feedback (done)="reload()" />
    @if (rows.loading()) {
      <p role="status">Cargando profesionales…</p>
    }
    @if (rows.error(); as error) {
      <bm-alert [message]="error" /><button type="button" (click)="reload()">Reintentar</button>
    }
    <div class="agenda-options">
      @for (prof of rows.data(); track prof.id) {
        <button type="button" [disabled]="intent.busy()" (click)="select(prof)">
          {{ prof.nombres }} {{ prof.apellidos }} · {{ prof.activa ? 'Activa' : 'Inactiva' }}
        </button>
      }
    </div>
    @if (session.hasPermission('agenda.manage_professionals')) {
      <button type="button" (click)="newProfessional()" [disabled]="intent.busy()">
        Nuevo profesional
      </button>
      <form bmUnsavedForm class="surface" [formGroup]="form" (ngSubmit)="save()">
        <h2>{{ selected() ? 'Editar profesional #' + selected()!.id : 'Alta de profesional' }}</h2>
        <label>Nombres<input formControlName="names" maxlength="120" /></label
        ><label>Apellidos<input formControlName="surnames" maxlength="120" /></label
        ><label>Teléfono profesional<input formControlName="phone" maxlength="30" /></label
        ><label>Comisión porcentual<input inputmode="decimal" formControlName="commission" /></label
        ><label><input type="checkbox" formControlName="active" />Profesional activa</label
        ><label
          ><input type="checkbox" formControlName="visible" />Visible en consultas públicas
          habilitadas</label
        >
        @if (session.hasPermission('agenda.assign_users')) {
          <label
            >ID de usuario staff (vacío para desvincular)<input
              formControlName="user"
              type="number"
              min="1"
          /></label>
        }
        <button type="submit" [disabled]="intent.busy() || form.invalid">
          Guardar profesional
        </button>
      </form>
    }
    @if (selected(); as prof) {
      <h2>Especialidades y horarios · {{ prof.nombres }} {{ prof.apellidos }}</h2>
      @if (specialties.loading()) {
        <p role="status">Cargando especialidades…</p>
      }
      @if (specialties.error(); as error) {
        <bm-alert [message]="error" /><button type="button" (click)="select(prof)">
          Reintentar especialidades
        </button>
      }
      <p>Servicios autorizados: {{ specialtyIds().join(', ') || 'Ninguno' }}</p>
      @if (session.hasPermission('agenda.manage_professionals') && specialties.record()) {
        <bm-agenda-services [disabled]="intent.busy()" (picked)="addSpecialty($event.id)" />
        <div class="agenda-options">
          @for (id of specialtyIds(); track id) {
            <button type="button" [disabled]="intent.busy()" (click)="removeSpecialty(id)">
              Quitar servicio #{{ id }}
            </button>
          }
          <button type="button" [disabled]="intent.busy()" (click)="saveSpecialties()">
            Guardar especialidades
          </button>
        </div>
      }
      @if (schedules.error(); as error) {
        <bm-alert [message]="error" /><button type="button" (click)="select(prof)">
          Reintentar horarios
        </button>
      }
      <ul>
        @for (schedule of schedules.data(); track schedule.id) {
          <li>
            Horario #{{ schedule.id }} · {{ weekdays[schedule.dia_semana - 1] }} ·
            {{ schedule.hora_inicio }}–{{ schedule.hora_fin }}
            @if (session.hasPermission('agenda.manage_schedules')) {
              <button type="button" (click)="editSchedule(schedule)" [disabled]="intent.busy()">
                Editar horario #{{ schedule.id }}</button
              ><button
                type="button"
                (click)="retire(schedule.id)"
                [disabled]="intent.busy() || retireForm.invalid"
              >
                Retirar horario #{{ schedule.id }}
              </button>
            }
          </li>
        }
      </ul>
      @if (session.hasPermission('agenda.manage_schedules')) {
        <form bmUnsavedForm class="surface" [formGroup]="scheduleForm" (ngSubmit)="saveSchedule()">
          <h3>{{ scheduleId() ? 'Editar horario #' + scheduleId() : 'Nuevo horario' }}</h3>
          <label
            >Día de semana<select formControlName="day">
              @for (day of weekdays; track day; let index = $index) {
                <option [value]="index + 1">{{ day }}</option>
              }
            </select></label
          ><label>Hora de inicio<input type="time" formControlName="begin" /></label
          ><label>Hora de fin<input type="time" formControlName="end" /></label
          ><button type="submit" [disabled]="intent.busy() || scheduleForm.invalid">
            Guardar horario</button
          ><button type="button" [disabled]="intent.busy()" (click)="scheduleId.set(null)">
            Preparar nuevo horario
          </button>
        </form>
        <form bmUnsavedForm class="surface" [formGroup]="retireForm">
          <label
            >Motivo de retiro de horario<input
              formControlName="reason"
              minlength="8"
              maxlength="250" /></label
          ><label
            ><input type="checkbox" formControlName="confirmed" />Confirmo el retiro del horario
            seleccionado.</label
          >
          <p>Django impedirá dejar citas futuras fuera del horario.</p>
        </form>
      }
    }`,
})
export class ProfessionalsPage {
  readonly session = inject(SessionStore);
  readonly intent = inject(AgendaIntent);
  private readonly api = inject(AgendaApi);
  private readonly fb = inject(FormBuilder);
  readonly selected = signal<Professional | null>(null);
  readonly specialtyIds = signal<number[]>([]);
  readonly scheduleId = signal<number | null>(null);
  readonly weekdays = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
  readonly rows = new ReportResource<Professional[]>(() =>
    this.session.hasPermission('agenda.view_agenda')
      ? this.api.all<Professional>('profesionales/')
      : throwError(
          () =>
            new Error(
              'La ficha de profesionales requiere permiso administrativo mientras Django no proteja las comisiones.',
            ),
        ),
  );
  readonly schedules = new ReportResource<Schedule[]>((q) =>
    this.api.all<Schedule>('horarios/', q),
  );
  readonly specialties = new RecordState<{ profesional_id: number; servicios: number[] }>();
  readonly form = this.fb.nonNullable.group({
    names: ['', [Validators.required, Validators.maxLength(120)]],
    surnames: ['', [Validators.required, Validators.maxLength(120)]],
    phone: '',
    commission: ['0.00', Validators.pattern(/^\d{1,3}(\.\d{1,2})?$/)],
    active: true,
    visible: false,
    user: '',
  });
  readonly scheduleForm = this.fb.nonNullable.group({
    day: '1',
    begin: ['', Validators.required],
    end: ['', Validators.required],
  });
  readonly retireForm = this.fb.nonNullable.group({
    reason: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(250)]],
    confirmed: [false, Validators.requiredTrue],
  });
  constructor() {
    this.reload();
  }
  reload() {
    this.rows.load({});
    if (this.selected()) this.select(this.selected()!);
  }
  newProfessional() {
    this.selected.set(null);
    this.form.reset({ commission: '0.00', active: true, visible: false });
  }
  async select(prof: Professional) {
    this.selected.set(prof);
    this.scheduleId.set(null);
    this.specialtyIds.set([]);
    this.form.reset({
      names: prof.nombres,
      surnames: prof.apellidos,
      phone: prof.telefono ?? '',
      commission: prof.comision_porcentaje ?? '0.00',
      active: prof.activa,
      visible: prof.visible_reservas,
      user: prof.usuario_id ? String(prof.usuario_id) : '',
    });
    this.schedules.load({ profesional_id: prof.id });
    await this.specialties.load(
      this.api.get<{ profesional_id: number; servicios: number[] }>(
        'profesionales/' + prof.id + '/especialidades/',
      ),
    );
    if (this.selected()?.id === prof.id)
      this.specialtyIds.set(this.specialties.record()?.servicios ?? []);
  }
  async save() {
    if (this.form.invalid) return;
    const value = this.form.getRawValue(),
      id = this.selected()?.id;
    const result = await this.intent.send(
      this.api.path('profesionales/' + (id ? id + '/' : '')),
      {
        nombres: value.names,
        apellidos: value.surnames,
        telefono: value.phone || null,
        comision_porcentaje: value.commission,
        activa: value.active,
        visible_reservas: value.visible,
        ...(this.session.hasPermission('agenda.assign_users')
          ? { usuario_id: value.user ? Number(value.user) : null }
          : {}),
      },
      id ? 'PATCH' : 'POST',
    );
    if (result) {
      this.selected.set(null);
      this.rows.load({});
      this.form.reset({ commission: '0.00', active: true, visible: false });
    }
  }
  addSpecialty(id: number) {
    if (!this.specialtyIds().includes(id)) this.specialtyIds.update((ids) => [...ids, id]);
  }
  removeSpecialty(id: number) {
    this.specialtyIds.update((ids) => ids.filter((item) => item !== id));
  }
  async saveSpecialties() {
    const id = this.selected()?.id;
    if (
      id &&
      (await this.intent.send(
        this.api.path('profesionales/' + id + '/especialidades/'),
        { servicios: this.specialtyIds() },
        'PUT',
      ))
    )
      this.reload();
  }
  editSchedule(row: Schedule) {
    this.scheduleId.set(row.id);
    this.scheduleForm.reset({
      day: String(row.dia_semana),
      begin: row.hora_inicio.slice(0, 5),
      end: row.hora_fin.slice(0, 5),
    });
  }
  async saveSchedule() {
    const id = this.scheduleId(),
      professional = this.selected()?.id,
      value = this.scheduleForm.getRawValue();
    if (!professional || this.scheduleForm.invalid) return;
    if (value.begin >= value.end) {
      this.intent.error.set('La hora de inicio debe preceder a la de fin.');
      return;
    }
    if (
      await this.intent.send(
        this.api.path('horarios/' + (id ? id + '/' : '')),
        {
          ...(id ? {} : { profesional_id: professional }),
          dia_semana: Number(value.day),
          hora_inicio: value.begin,
          hora_fin: value.end,
        },
        id ? 'PATCH' : 'POST',
      )
    )
      this.reload();
  }
  async retire(id: number) {
    if (this.retireForm.invalid) return;
    if (
      await this.intent.send(
        this.api.path('horarios/' + id + '/'),
        { confirmar_retiro: true, motivo: this.retireForm.controls.reason.value },
        'DELETE',
      )
    ) {
      this.retireForm.reset();
      this.reload();
    }
  }
}
