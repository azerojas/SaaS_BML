import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { SessionStore } from '../../../core/auth/application/session-store';
import { SuppliersFacade } from '../application/suppliers-facade';
import { SUPPLIER_FIELDS } from '../domain/supplier';
import { phone } from '../../clientas/domain/clienta';
import { EditorFields, buildFields } from '../../../shared/ui/editor-fields';
import { Alert } from '../../../shared/ui/alert';
import { Loading } from '../../../shared/ui/loading';
import { Button } from '../../../shared/ui/button';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog';
@Component({
  selector: 'bm-supplier-form',
  imports: [RouterLink, ReactiveFormsModule, MatButtonModule, EditorFields, Alert, Loading, Button],
  providers: [SuppliersFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<a class="back-link" routerLink="/admin/proveedores">← Proveedores</a>
    <header class="feature-heading">
      <div>
        <p class="eyebrow">CONTACTOS DE CONFIANZA</p>
        <h1>{{ id ? 'Ficha del proveedor' : 'Nuevo proveedor' }}</h1>
      </div>
      @if (id && facade.record(); as supplier) {
        <span class="badge" [class.inactive]="!supplier.activo">{{
          supplier.activo ? 'Activo' : 'Inactivo'
        }}</span>
      }
    </header>
    @if (facade.error(); as error) {
      <bm-alert [message]="error" />
    }
    @if (facade.success(); as success) {
      <bm-alert kind="info" [message]="success" />
    }
    @if (facade.loading()) {
      <bm-loading />
    } @else if (!id || facade.record()) {
      @if (canEdit()) {
        <form class="surface editor" [formGroup]="form" (ngSubmit)="save()">
          <bm-editor-fields [fields]="fields" [form]="form" [errors]="facade.fields()" />
          <div class="form-actions">
            <bm-button type="submit" [busy]="facade.busy()">Guardar proveedor</bm-button>
            @if (id) {
              <button
                mat-stroked-button
                type="button"
                [disabled]="facade.busy()"
                (click)="toggle()"
              >
                {{ facade.record()?.activo ? 'Desactivar proveedor' : 'Reactivar proveedor' }}
              </button>
            }
            <a mat-button routerLink="/admin/proveedores">Volver</a>
          </div>
        </form>
      } @else {
        <section class="surface">
          <dl class="details-grid">
            @for (field of fields; track field.key) {
              <div>
                <dt>{{ field.label }}</dt>
                <dd>{{ display(field.key) }}</dd>
              </div>
            }
          </dl>
        </section>
      }
    } `,
})
export class SupplierForm {
  readonly facade = inject(SuppliersFacade);
  readonly session = inject(SessionStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  readonly id = Number(this.route.snapshot.paramMap.get('id')) || undefined;
  readonly fields = SUPPLIER_FIELDS;
  readonly form = buildFields(this.fields);
  constructor() {
    this.form.controls['telefono'].addValidators((control) =>
      !control.value || phone(String(control.value)) ? null : { phone: true },
    );
    void this.init();
  }
  private async init() {
    if (this.id) {
      await this.facade.get(this.id);
      const row = this.facade.record();
      if (row)
        this.form.patchValue({
          nombre: row.nombre,
          ruc: row.ruc ?? '',
          telefono: row.telefono ?? '',
          email: row.email ?? '',
        });
    }
  }
  canEdit() {
    return this.session.hasPermission('negocio.' + (this.id ? 'change' : 'add') + '_proveedores');
  }
  display(key: string) {
    const row = this.facade.record();
    return row ? String(row[key as keyof typeof row] ?? 'Sin registrar') : '';
  }
  async save() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    const saved = await this.facade.save(
      {
        ...raw,
        nombre: String(raw['nombre']).trim(),
        telefono: raw['telefono'] ? phone(String(raw['telefono'])) : null,
        ruc: raw['ruc'] || null,
        email: raw['email'] || null,
      },
      this.id,
    );
    if (saved) {
      this.facade.success.set('Proveedor guardado.');
      if (!this.id) await this.router.navigate(['/admin/proveedores', saved.id]);
    }
  }
  async toggle() {
    const active = this.facade.record()?.activo;
    if (active === undefined) return;
    const confirmed = await firstValueFrom(
      this.dialog
        .open(ConfirmDialog, {
          data: {
            title: active ? '¿Desactivar proveedor?' : '¿Reactivar proveedor?',
            description:
              'Se conservan sus compras e historial. Un proveedor inactivo no puede usarse para recibir compras.',
            confirm: active ? 'Desactivar' : 'Reactivar',
          },
        })
        .afterClosed(),
    );
    if (confirmed) await this.facade.active(!active);
  }
}
