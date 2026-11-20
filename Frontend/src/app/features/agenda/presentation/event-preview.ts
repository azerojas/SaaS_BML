import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RecordState } from '../../../shared/application/operation-state';
import { SessionStore } from '../../../core/auth/application/session-store';
import { ClientasApi } from '../../clientas/infrastructure/clientas-api';
import { AgendaApi } from '../infrastructure/agenda-api';
import { AppointmentDetail } from '../domain/agenda';
import { localDateTime, money } from '../../dashboard/domain/analytics';
import { Alert } from '../../../shared/ui/alert';
import { Icon } from '../../../shared/ui/icon';

@Component({
  selector: 'bm-event-preview',
  imports: [MatDialogModule, MatButtonModule, RouterLink, Alert, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<header>
      <span class="event-dot"></span>
      <h2 mat-dialog-title>Detalle de cita</h2>
      <button mat-icon-button type="button" mat-dialog-close aria-label="Cerrar detalle">
        <bm-icon name="close" />
      </button>
    </header>
    <mat-dialog-content>
      @if (state.loading()) {
        <p role="status">Cargando cita…</p>
      }
      @if (state.error(); as error) {
        <bm-alert [message]="error" /><button mat-button type="button" (click)="load()">
          Reintentar
        </button>
      }
      @if (state.record(); as row) {
        <h3>{{ clientName() || row.clienta_nombre || 'Cita #' + row.id }}</h3>
        <p class="status">{{ data.status }}</p>
        <div class="detail">
          <bm-icon name="clock" />
          <div>
            <strong>{{ localDateTime(row.inicio_en) }}</strong>
            <p>
              Hasta {{ localDateTime(row.fin_en) }} · {{ row.duracion_total_minutos }} minutos ·
              Lima
            </p>
          </div>
        </div>
        <div class="detail">
          <bm-icon name="users" />
          <div>
            <strong>{{ data.professionalName }}</strong>
            <p>Profesional</p>
          </div>
        </div>
        <div class="detail">
          <bm-icon name="sparkles" />
          <div>
            <strong
              >{{ row.servicios.length }}
              {{ row.servicios.length === 1 ? 'servicio' : 'servicios' }} ·
              {{ money(row.precio_total) }}</strong
            >
            <p>Servicios y precio de la reserva</p>
          </div>
        </div>
        @if (row.notas) {
          <p class="notes">{{ row.notas }}</p>
        }
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      @if (!data.readOnly) {
        <a mat-button [routerLink]="['/admin/agenda/citas', data.id]" (click)="ref.close()"
          >Abrir ficha de la cita</a
        >
        @if (state.record(); as row) {
          @if (
            session.hasPermission('agenda.manage_appointments') &&
            !row.visita_id &&
            ['PROGRAMADA', 'CONFIRMADA', 'PENDIENTE_PAGO'].includes(row.estado)
          ) {
            <button mat-flat-button type="button" (click)="ref.close(row)">Cambiar horario</button>
          }
        }
      } @else {
        <button mat-button type="button" mat-dialog-close>Cerrar</button>
      }
    </mat-dialog-actions>`,
  styles: `
    :host {
      display: block;
      color: var(--ink);
    }
    header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 16px 20px;
      border-bottom: 1px solid var(--line);
    }
    header h2 {
      padding: 0;
      margin: 0;
      font: inherit;
      font-size: 17px;
      font-weight: 600;
    }
    header button {
      margin-left: auto;
    }
    .event-dot {
      width: 14px;
      height: 14px;
      background: var(--primary-container);
      border-radius: 4px;
    }
    mat-dialog-content {
      padding: 20px 24px !important;
    }
    h3 {
      font-size: 23px;
      margin: 0 0 8px;
      letter-spacing: -0.03em;
    }
    .status {
      color: var(--forest);
      font-size: 12px;
      margin: 0 0 24px;
    }
    .detail {
      display: flex;
      gap: 14px;
      margin: 20px 0;
      font-size: 13px;
    }
    .detail bm-icon {
      color: var(--muted);
      flex-shrink: 0;
    }
    .detail p {
      font-size: 12px;
      color: var(--muted);
      margin: 6px 0;
      line-height: 1.7;
    }
    .notes {
      white-space: pre-wrap;
      background: var(--surface-low);
      padding: 12px;
      border-radius: 8px;
      font-size: 13px;
      line-height: 1.7;
    }
    mat-dialog-actions {
      padding: 12px 20px 18px !important;
    }
  `,
})
export class EventPreview {
  readonly data = inject<{
    id: number;
    professionalName: string;
    status: string;
    readOnly?: boolean;
  }>(MAT_DIALOG_DATA);
  readonly ref = inject(MatDialogRef<EventPreview, AppointmentDetail>);
  readonly session = inject(SessionStore);
  private readonly api = inject(AgendaApi);
  private readonly clientApi = inject(ClientasApi);
  readonly state = new RecordState<AppointmentDetail>();
  readonly clientName = signal('');
  readonly localDateTime = localDateTime;
  readonly money = money;
  constructor() {
    void this.load();
  }
  private readonly destroy = inject(DestroyRef);
  async load() {
    await this.state.load(this.api.get<AppointmentDetail>('citas/' + this.data.id + '/'));
    const row = this.state.record();
    if (row && this.session.hasPermission('negocio.view_clientas'))
      this.clientApi
        .get(row.clienta_id)
        .pipe(takeUntilDestroyed(this.destroy))
        .subscribe({
          next: (client) => this.clientName.set(client.nombres + ' ' + client.apellidos),
          error: () => undefined,
        });
  }
}
