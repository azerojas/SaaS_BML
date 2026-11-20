import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { SessionStore } from '../../../core/auth/application/session-store';
import { QrFacade } from '../application/qr-facade';
import { QrPoint } from '../domain/checkin';
import { Alert } from '../../../shared/ui/alert';
import { Loading } from '../../../shared/ui/loading';
import { Pager } from '../../../shared/ui/pager';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog';
import { Icon } from '../../../shared/ui/icon';
import { Brand } from '../../../shared/ui/brand';
@Component({
  selector: 'bm-qr-management',
  imports: [ReactiveFormsModule, MatButtonModule, Alert, Loading, Pager, Icon, Brand],
  providers: [QrFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './qr-management.html',
  styleUrl: './qr-management.scss',
})
export class QrManagement {
  readonly facade = inject(QrFacade);
  readonly session = inject(SessionStore);
  private readonly dialog = inject(MatDialog);
  readonly confirming = signal(false);
  readonly Number = Number;
  readonly form = inject(FormBuilder).nonNullable.group({
    nombre: ['', [Validators.required, Validators.maxLength(100), Validators.pattern(/\S/)]],
  });
  async create() {
    if (this.form.invalid) return;
    const result = await this.facade.save({
      nombre: this.form.controls.nombre.value.trim(),
      activo: true,
    });
    if (result) {
      this.form.reset();
      await this.facade.show(result);
    }
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
