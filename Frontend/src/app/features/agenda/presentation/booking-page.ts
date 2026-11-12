import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { SessionStore } from '../../../core/auth/application/session-store';
import { ClientPicker } from '../../ventas/presentation/client-picker';
import { Clienta } from '../../clientas/domain/clienta';
import { CatalogRecord } from '../../catalogo/domain/catalog';
import { ServicePicker } from './service-picker';
import { SlotPicker } from './slot-picker';
import { AgendaFeedback } from './agenda-feedback';
import { AgendaIntent } from '../application/agenda-intent';
import { AgendaApi } from '../infrastructure/agenda-api';
import { Availability, MutationResult, Slot } from '../domain/agenda';
import { Alert } from '../../../shared/ui/alert';
import { localDateTime, money } from '../../dashboard/domain/analytics';
@Component({
  selector: 'bm-booking-page',
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
    <h1>Nueva cita</h1>
    <bm-agenda-feedback (done)="done($event)" />
    @if (session.hasPermission('negocio.view_clientas')) {
      <bm-client-picker [disabled]="intent.busy()" (picked)="selectClient($event)" />
    } @else {
      <bm-alert message="Se requiere permiso de lectura de clientas para crear una cita." />
    }
    @if (client(); as client) {
      <p>Clienta elegida: {{ client.nombres }} {{ client.apellidos }} · #{{ client.id }}</p>
      <bm-agenda-services [disabled]="intent.busy()" (picked)="addService($event)" />
      <ul>
        @for (service of services(); track service.id) {
          <li>
            {{ service.nombre
            }}<button type="button" [disabled]="intent.busy()" (click)="removeService(service.id)">
              Quitar {{ service.nombre }}
            </button>
          </li>
        }
      </ul>
      @if (services().length) {
        <bm-slot-picker
          [services]="ids()"
          [refresh]="refresh()"
          [disabled]="intent.busy()"
          (picked)="selectSlot($event)"
        />
      }
    }
    <form class="surface" [formGroup]="form" (ngSubmit)="submit()">
      <label
        >Origen<select formControlName="origin">
          <option value="MANUAL">Presencial / manual</option>
          <option value="TELEFONO">Teléfono</option>
        </select></label
      ><label>Notas de la cita<textarea formControlName="notes" maxlength="5000"></textarea></label>
      @if (choice(); as chosen) {
        <h2>Revisar reserva</h2>
        <p>
          {{ localDateTime(chosen.slot.inicio_en) }} ·
          {{ chosen.availability.duracion_minutos }} minutos
        </p>
        <p>
          Total Django: {{ money(chosen.availability.precio_total) }} · Anticipo requerido:
          {{ money(chosen.availability.anticipo_requerido) }}
        </p>
      }
      <label
        ><input type="checkbox" formControlName="reviewed" />He revisado clienta, servicios,
        profesional, horario e importes.</label
      ><button type="submit" [disabled]="intent.busy() || !choice() || !client() || form.invalid">
        Crear reserva
      </button>
    </form>`,
})
export class BookingPage {
  selectClient(client: Clienta) {
    this.client.set(client);
    this.selectSlot(null);
  }
  selectSlot(choice: { slot: Slot; availability: Availability } | null) {
    this.choice.set(choice);
    this.form.controls.reviewed.setValue(false);
  }
  readonly session = inject(SessionStore);
  readonly intent = inject(AgendaIntent);
  private readonly api = inject(AgendaApi);
  private readonly router = inject(Router);
  readonly client = signal<Clienta | null>(null);
  readonly services = signal<CatalogRecord[]>([]);
  readonly ids = computed(() => this.services().map((s) => s.id));
  readonly choice = signal<{ slot: Slot; availability: Availability } | null>(null);
  readonly refresh = signal(0);
  readonly money = money;
  readonly localDateTime = localDateTime;
  readonly form = inject(FormBuilder).nonNullable.group({
    origin: 'MANUAL',
    notes: ['', Validators.maxLength(5000)],
    reviewed: [false, Validators.requiredTrue],
  });
  addService(row: CatalogRecord) {
    if (this.services().length >= 10 || this.services().some((s) => s.id === row.id)) return;
    this.services.update((rows) => [...rows, row]);
    this.choice.set(null);
    this.form.controls.reviewed.setValue(false);
  }
  removeService(id: number) {
    this.services.update((rows) => rows.filter((s) => s.id !== id));
    this.choice.set(null);
    this.form.controls.reviewed.setValue(false);
  }
  async submit() {
    const chosen = this.choice(),
      client = this.client();
    if (!chosen || !client || this.form.invalid) return;
    const value = this.form.getRawValue();
    const result = await this.intent.send(this.api.path('citas/'), {
      clienta_id: client.id,
      profesional_id: chosen.availability.profesional_id,
      servicios: this.ids(),
      inicio_en: chosen.slot.inicio_en,
      notas: value.notes,
      origen: value.origin,
    });
    if (result) this.done(result);
    else if (this.intent.failure()?.status === 409) {
      this.choice.set(null);
      this.refresh.update((n) => n + 1);
      this.form.controls.reviewed.setValue(false);
    }
  }
  done(result: MutationResult) {
    if (result.cita_id) void this.router.navigate(['/admin/agenda/citas', result.cita_id]);
  }
}
