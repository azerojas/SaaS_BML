import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ResourceApi } from '../../../shared/infrastructure/resource-api';
import { SessionStore } from '../../../core/auth/application/session-store';
import { ApiFailure } from '../../../core/http/api-failure';
import { Alert } from '../../../shared/ui/alert';
import { Icon } from '../../../shared/ui/icon';
import { CustomerBooking } from '../../reservas/public-booking-api';
import { localDateTime, money } from '../../dashboard/domain/analytics';
interface RequestRow extends CustomerBooking {
  nombres: string;
  apellidos: string;
  telefono: string;
  cita_id: number | null;
}
@Component({
  selector: 'bm-booking-requests',
  imports: [ReactiveFormsModule, RouterLink, Alert, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './requests-page.html',
  styleUrl: './requests-page.scss',
})
export class RequestsPage {
  private readonly api = inject(ResourceApi);
  readonly session = inject(SessionStore);
  readonly rows = signal<RequestRow[]>([]);
  readonly selected = signal<RequestRow | null>(null);
  readonly busy = signal(false);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly message = signal('');
  readonly next = signal(false);
  readonly date = localDateTime;
  readonly money = money;
  private page = 1;
  pendingKey = '';
  private pendingPath = '';
  private pendingBody: unknown = null;
  readonly form = inject(FormBuilder).nonNullable.group({
    identity: false,
    consent: false,
    reason: ['', Validators.maxLength(250)],
  });
  constructor() {
    void this.load();
  }
  async load() {
    this.page = 1;
    await this.fetch();
  }
  async more() {
    this.page++;
    await this.fetch();
  }
  private async fetch() {
    this.loading.set(true);
    try {
      const response = await firstValueFrom(
        this.api.list<RequestRow>('/api/v1/agenda/solicitudes/', {
          estado: 'PENDIENTE',
          page: this.page,
        }),
      );
      this.rows.set(response.results);
      this.next.set(!!response.next);
    } catch (error) {
      this.fail(error);
    } finally {
      this.loading.set(false);
    }
  }
  async approve(row: RequestRow) {
    if (!this.form.controls.identity.value || !this.form.controls.consent.value) return;
    await this.send(row, 'aprobar', {
      identidad_verificada: true,
      consentimiento_verificado: true,
    });
  }
  async reject(row: RequestRow) {
    const reason = this.form.controls.reason.value.trim();
    if (reason.length < 8) return;
    await this.send(row, 'rechazar', { motivo: reason });
  }
  private async send(row: RequestRow, action: string, body: unknown) {
    if (this.pendingKey || this.busy()) return;
    this.pendingKey = crypto.randomUUID();
    this.pendingPath = '/api/v1/agenda/solicitudes/' + row.id + '/' + action + '/';
    this.pendingBody = body;
    await this.retry();
  }
  async retry() {
    if (!this.pendingKey || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await firstValueFrom(
        this.api.write('POST', this.pendingPath, this.pendingBody, {
          'Idempotency-Key': this.pendingKey,
        }),
      );
      this.pendingKey = '';
      this.selected.set(null);
      this.message.set(
        'Solicitud resuelta. La clienta puede consultar el estado con su teléfono y clave de gestión.',
      );
      await this.load();
    } catch (error) {
      if (error instanceof ApiFailure && [400, 404, 409].includes(error.status))
        this.pendingKey = '';
      this.fail(error);
    } finally {
      this.busy.set(false);
    }
  }
  private fail(error: unknown) {
    this.error.set(error instanceof Error ? error.message : 'No se pudo completar la operación.');
  }
}
