import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { SessionStore } from '../../../core/auth/application/session-store';
import { QrFacade } from '../application/qr-facade';
import { QrPoint } from '../domain/checkin';
import { FinanceNav } from '../../ventas/presentation/finance-nav';
import { Alert } from '../../../shared/ui/alert';
import { Loading } from '../../../shared/ui/loading';
import { Pager } from '../../../shared/ui/pager';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog';
@Component({
  selector: 'bm-qr-management',
  imports: [ReactiveFormsModule, MatButtonModule, FinanceNav, Alert, Loading, Pager],
  providers: [QrFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<bm-finance-nav />
    <header class="feature-heading">
      <div>
        <p class="eyebrow">RECEPCIÓN</p>
        <h1>Puntos QR</h1>
        <p>Cada cartel abre el registro público. La identidad se comprueba en recepción.</p>
      </div>
    </header>
    @if (facade.error() || facade.list.error(); as error) {
      <bm-alert [message]="error" />
    }
    @if (facade.success(); as success) {
      <bm-alert kind="info" [message]="success" />
    }
    @if (session.hasPermission('negocio.add_puntosqr')) {
      <form class="surface phase4-form" [formGroup]="form" (ngSubmit)="create()">
        <label for="qr-name">Nombre del punto</label
        ><input id="qr-name" formControlName="nombre" required maxlength="100" /><button
          mat-flat-button
          [disabled]="form.invalid || facade.busy()"
          type="submit"
        >
          Crear punto QR
        </button>
      </form>
    }
    @if (facade.list.loading()) {
      <bm-loading />
    }
    <div class="record-list section-gap">
      @for (point of facade.list.rows(); track point.id) {
        <article class="record-row">
          <div>
            <h2>{{ point.nombre }}</h2>
            <span class="badge">{{ point.activo ? 'Activo' : 'Revocado' }}</span>
          </div>
          <div class="form-actions">
            @if (point.activo) {
              <button mat-stroked-button [disabled]="facade.busy()" (click)="facade.show(point)">
                Ver QR de {{ point.nombre }}
              </button>
            }
            @if (session.hasPermission('negocio.change_puntosqr')) {
              <button mat-button [disabled]="facade.busy() || confirming()" (click)="toggle(point)">
                {{ point.activo ? 'Revocar' : 'Reactivar' }}
              </button>
            }
          </div>
        </article>
      } @empty {
        <p>No hay puntos QR. Crea uno para preparar el cartel.</p>
      }
    </div>
    <bm-pager
      [count]="facade.list.count()"
      [page]="Number(facade.list.query()['page'])"
      [busy]="facade.list.loading()"
      (changed)="facade.list.page($event)"
    />
    @if (facade.selected(); as point) {
      <section class="surface qr-print section-gap">
        <h2>{{ point.nombre }} · Registra tu llegada</h2>
        @if (point.ready) {
          <img
            [src]="'/api/admin/checkin/puntos/' + point.id + '/qr/?formato=svg'"
            alt="Código QR para registrar la llegada"
            width="320"
            height="320"
          />
          <p class="qr-url">{{ point.url }}</p>
          <p>Escanea y acércate a recepción para confirmar tu identidad.</p>
          <button mat-flat-button (click)="print()">Imprimir cartel</button>
        } @else {
          <bm-alert
            message="El QR todavía apunta a la API. Configura PUBLIC_CHECKIN_URL con la URL HTTPS pública del frontend terminada en /registro/."
          />
        }
      </section>
    }`,
})
export class QrManagement {
  readonly facade = inject(QrFacade);
  readonly session = inject(SessionStore);
  private readonly dialog = inject(MatDialog);
  readonly confirming = signal(false);
  readonly Number = Number;
  readonly form = inject(FormBuilder).nonNullable.group({
    nombre: ['', [Validators.required, Validators.maxLength(100)]],
  });
  async create() {
    if (this.form.invalid) return;
    const result = await this.facade.save({
      nombre: this.form.controls.nombre.value.trim(),
      activo: true,
    });
    if (result) this.form.reset();
  }
  async toggle(point: QrPoint) {
    if (this.confirming()) return;
    this.confirming.set(true);
    try {
      if (
        await firstValueFrom(
          this.dialog
            .open(ConfirmDialog, {
              data: {
                title: point.activo ? 'Revocar este QR' : 'Reactivar este QR',
                description: point.activo
                  ? 'El cartel dejará de aceptar solicitudes. Crea otro punto si necesitas un token nuevo.'
                  : 'El enlace anterior volverá a funcionar. Esto no rota el token.',
                confirm: point.activo ? 'Revocar' : 'Reactivar',
              },
            })
            .afterClosed(),
        )
      )
        await this.facade.save({ activo: !point.activo }, point.id);
    } finally {
      this.confirming.set(false);
    }
  }
  print() {
    window.print();
  }
}
