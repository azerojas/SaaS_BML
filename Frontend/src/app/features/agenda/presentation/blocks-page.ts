import { DateField } from '../../../shared/ui/date-field';
import { UnsavedForm } from '../../../core/forms/unsaved-form';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { SessionStore } from '../../../core/auth/application/session-store';
import { AgendaApi } from '../infrastructure/agenda-api';
import { AgendaIntent } from '../application/agenda-intent';
import { Block, Professional, limaInput } from '../domain/agenda';
import { ReportResource } from '../../dashboard/application/report-resource';
import { addDays, limaToday } from '../../dashboard/domain/periods';
import { localDateTime } from '../../dashboard/domain/analytics';
import { AgendaFeedback } from './agenda-feedback';
import { Alert } from '../../../shared/ui/alert';
import { throwError } from 'rxjs';
@Component({
  selector: 'bm-blocks-page',
  imports: [DateField, ReactiveFormsModule, RouterLink, AgendaFeedback, Alert, UnsavedForm],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<a routerLink="/admin/agenda">Volver a agenda</a>
    <h1>Bloqueos de agenda</h1>
    <bm-agenda-feedback (done)="load()" />
    <form class="surface agenda-filters" [formGroup]="filter" (ngSubmit)="load()">
      <div class="calendar-field-label">
        <span>Desde</span><bm-date-field ariaLabel="Desde" formControlName="from" />
      </div>
      <div class="calendar-field-label">
        <span>Hasta (exclusiva)</span
        ><bm-date-field ariaLabel="Hasta (exclusiva)" formControlName="to" />
      </div>
      <button type="submit">Consultar bloqueos</button>
    </form>
    @if (rows.loading()) {
      <p role="status">Cargando bloqueos…</p>
    }
    @if (rows.error(); as error) {
      <bm-alert [message]="error" /><button type="button" (click)="load()">Reintentar</button>
    }
    @if (professionals.error(); as error) {
      <bm-alert [message]="error" />
    }
    @for (block of rows.data(); track block.id) {
      <article class="surface">
        <h2>
          Bloqueo #{{ block.id }} ·
          {{ block.profesional_id ? 'Profesional #' + block.profesional_id : 'Todo el salón' }}
        </h2>
        <p>
          {{ localDateTime(block.inicio_en) }} – {{ localDateTime(block.fin_en) }} ·
          {{ block.motivo }}
        </p>
        @if (session.hasPermission('agenda.manage_blocks')) {
          <button type="button" [disabled]="intent.busy()" (click)="edit(block)">
            Editar bloqueo #{{ block.id }}</button
          ><button
            type="button"
            [disabled]="intent.busy() || retireForm.invalid"
            (click)="retire(block.id)"
          >
            Retirar bloqueo #{{ block.id }}
          </button>
        }
      </article>
    } @empty {
      <p>No hay bloqueos en este rango.</p>
    }
    @if (session.hasPermission('agenda.manage_blocks')) {
      <form bmUnsavedForm class="surface" [formGroup]="form" (ngSubmit)="save()">
        <h2>{{ id() ? 'Editar bloqueo #' + id() : 'Nuevo bloqueo' }}</h2>
        <label
          >Profesional del bloqueo<select formControlName="professional">
            <option value="">Todo el salón</option>
            @for (prof of professionals.data(); track prof.id) {
              <option [value]="prof.id">{{ prof.nombres }} {{ prof.apellidos }}</option>
            }
          </select></label
        >
        <div class="calendar-field-label">
          <span>Inicio del bloqueo (Lima)</span
          ><bm-date-field
            ariaLabel="Inicio del bloqueo (Lima)"
            formControlName="begin"
            [includeTime]="true"
          />
        </div>
        <div class="calendar-field-label">
          <span>Fin del bloqueo (Lima)</span
          ><bm-date-field
            ariaLabel="Fin del bloqueo (Lima)"
            formControlName="end"
            [includeTime]="true"
          />
        </div>
        <label
          >Motivo del bloqueo<textarea
            formControlName="reason"
            minlength="8"
            maxlength="200"
          ></textarea>
        </label>
        @if (session.hasPermission('agenda.override_policy')) {
          <label
            ><input type="checkbox" formControlName="historical" />Autorizar intervalo
            histórico</label
          >
        }
        <button type="submit" [disabled]="intent.busy() || form.invalid">Guardar bloqueo</button
        ><button type="button" [disabled]="intent.busy()" (click)="id.set(null); form.reset()">
          Preparar nuevo bloqueo
        </button>
      </form>
      <form bmUnsavedForm class="surface" [formGroup]="retireForm">
        <label
          >Motivo de retiro del bloqueo<input
            formControlName="reason"
            minlength="8"
            maxlength="250" /></label
        ><label
          ><input type="checkbox" formControlName="confirmed" />Confirmo el retiro del bloqueo
          seleccionado.</label
        >
      </form>
    }`,
})
export class BlocksPage {
  readonly session = inject(SessionStore);
  readonly intent = inject(AgendaIntent);
  private readonly api = inject(AgendaApi);
  private readonly fb = inject(FormBuilder);
  readonly id = signal<number | null>(null);
  readonly localDateTime = localDateTime;
  readonly filter = this.fb.nonNullable.group({ from: limaToday(), to: addDays(limaToday(), 30) });
  readonly form = this.fb.nonNullable.group({
    professional: '',
    begin: ['', Validators.required],
    end: ['', Validators.required],
    reason: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(200)]],
    historical: false,
  });
  readonly retireForm = this.fb.nonNullable.group({
    reason: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(250)]],
    confirmed: [false, Validators.requiredTrue],
  });
  readonly rows = new ReportResource<Block[]>((q) => this.api.all<Block>('bloqueos/', q));
  readonly professionals = new ReportResource<Professional[]>(() =>
    this.session.hasPermission('agenda.view_agenda')
      ? this.api.all<Professional>('profesionales/', { activa: 'true' })
      : throwError(
          () =>
            new Error(
              'La selección de profesionales está restringida hasta corregir la protección de comisiones en Django.',
            ),
        ),
  );
  constructor() {
    this.load();
    this.professionals.load({});
  }
  load() {
    const value = this.filter.getRawValue();
    this.rows.load({ desde: value.from, hasta: value.to });
  }
  edit(block: Block) {
    this.id.set(block.id);
    const input = (value: string) => {
      const date = new Date(Date.parse(value) - 5 * 3600000);
      return date.toISOString().slice(0, 16);
    };
    this.form.reset({
      professional: block.profesional_id ? String(block.profesional_id) : '',
      begin: input(block.inicio_en),
      end: input(block.fin_en),
      reason: block.motivo,
      historical: false,
    });
  }
  async save() {
    if (this.form.invalid) return;
    const value = this.form.getRawValue();
    try {
      const begin = limaInput(value.begin),
        end = limaInput(value.end);
      if (begin >= end) throw new Error('El fin debe ser posterior al inicio.');
      if (
        await this.intent.send(
          this.api.path('bloqueos/' + (this.id() ? this.id() + '/' : '')),
          {
            profesional_id: value.professional ? Number(value.professional) : null,
            inicio_en: begin,
            fin_en: end,
            motivo: value.reason,
            ...(value.historical ? { excepcion_historica: true } : {}),
          },
          this.id() ? 'PATCH' : 'POST',
        )
      ) {
        this.id.set(null);
        this.form.reset();
        this.load();
      }
    } catch (error: unknown) {
      this.intent.error.set(error instanceof Error ? error.message : 'Intervalo inválido.');
    }
  }
  async retire(id: number) {
    if (this.retireForm.invalid) return;
    if (
      await this.intent.send(
        this.api.path('bloqueos/' + id + '/'),
        { confirmar_retiro: true, motivo: this.retireForm.controls.reason.value },
        'DELETE',
      )
    ) {
      this.retireForm.reset();
      this.load();
    }
  }
}
