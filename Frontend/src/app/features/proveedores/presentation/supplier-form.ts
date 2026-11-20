import { UnsavedForm } from '../../../core/forms/unsaved-form';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { SessionStore } from '../../../core/auth/application/session-store';
import { SuppliersFacade } from '../application/suppliers-facade';
import { SUPPLIER_FIELDS } from '../domain/supplier';
import { Supplier } from '../domain/supplier';
import { Icon } from '../../../shared/ui/icon';
import { phone } from '../../clientas/domain/clienta';
import { EditorFields, buildFields } from '../../../shared/ui/editor-fields';
import { Alert } from '../../../shared/ui/alert';
import { FormFeedback } from '../../../shared/ui/form-feedback';
import { Loading } from '../../../shared/ui/loading';
import { Button } from '../../../shared/ui/button';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog';
import { OperationsNav } from '../../../shared/ui/operations-nav';
@Component({
  selector: 'bm-supplier-form',
  imports: [
    RouterLink,
    ReactiveFormsModule,
    MatButtonModule,
    EditorFields,
    Alert,
    Loading,
    Button,
    UnsavedForm,
    OperationsNav,
    MatDialogModule,
    Icon,
    FormFeedback,
  ],
  providers: [SuppliersFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div [class.supplier-modal]="dialogRef">
    @if (dialogRef) {
      <header class="supplier-dialog-heading">
        <span class="heading-icon"><bm-icon name="users" /></span>
        <div>
          <p class="modal-eyebrow">LASHEO · PROVEEDORES</p>
          <h2 mat-dialog-title>{{ id ? 'Editar proveedor' : 'Nuevo proveedor' }}</h2>
          <p class="heading-description">Los contactos que acompañan el trabajo de tu salón.</p>
        </div>
        <button
          mat-icon-button
          type="button"
          [disabled]="facade.busy()"
          (click)="dialogRef.close()"
          aria-label="Cerrar proveedor"
        >
          <bm-icon name="close" />
        </button>
      </header>
    } @else {
      <bm-operations-nav />
      <a class="back-link" routerLink="/admin/proveedores">← Proveedores</a>
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
    }
    <bm-form-feedback [message]="facade.error()" [errors]="facade.fields()" />
    @if (facade.success(); as success) {
      <bm-alert kind="info" [message]="success" />
    }
    @if (facade.loading()) {
      <bm-loading />
    } @else if (!id || facade.record()) {
      @if (canEdit()) {
        <form bmUnsavedForm class="surface editor" [formGroup]="form" (ngSubmit)="save()">
          @if (dialogRef) {
            <section class="form-section">
              <header>
                <span><bm-icon name="receipt" /></span>
                <div>
                  <h3>Identificación</h3>
                  <p>Nombre y referencia del proveedor.</p>
                </div>
              </header>
              <bm-editor-fields
                [fields]="identityFields"
                [form]="form"
                [errors]="facade.fields()"
              />
            </section>
            <section class="form-section">
              <header>
                <span><bm-icon name="phone" /></span>
                <div>
                  <h3>Contacto</h3>
                  <p>Canales para coordinar tus compras.</p>
                </div>
              </header>
              <bm-editor-fields [fields]="contactFields" [form]="form" [errors]="facade.fields()" />
            </section>
          } @else {
            <bm-editor-fields [fields]="fields" [form]="form" [errors]="facade.fields()" />
          }
          <div class="form-actions">
            @if (dialogRef) {
              <span class="footer-note"><bm-icon name="shield" />Datos privados del salón</span>
            }
            <bm-button type="submit" [busy]="facade.busy()">Guardar proveedor</bm-button>
            @if (id && !dialogRef) {
              <button
                mat-stroked-button
                type="button"
                [disabled]="facade.busy()"
                (click)="toggle()"
              >
                {{ facade.record()?.activo ? 'Desactivar proveedor' : 'Reactivar proveedor' }}
              </button>
            }
            @if (!dialogRef) {
              <a mat-button routerLink="/admin/proveedores">Volver</a>
            }
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
    }
  </div>`,
  styleUrl: './supplier-form.scss',
})
export class SupplierForm {
  readonly facade = inject(SuppliersFacade);
  readonly session = inject(SessionStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  readonly dialogRef = inject<MatDialogRef<SupplierForm, Supplier>>(MatDialogRef, {
    optional: true,
  });
  private readonly dialogData = inject<{ id?: number }>(MAT_DIALOG_DATA, { optional: true });
  readonly id = this.dialogRef
    ? this.dialogData?.id
    : Number(this.route.snapshot.paramMap.get('id')) || undefined;
  readonly fields = SUPPLIER_FIELDS;
  readonly identityFields = this.fields.filter((field) => ['nombre', 'ruc'].includes(field.key));
  readonly contactFields = this.fields.filter((field) => ['telefono', 'email'].includes(field.key));
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
      this.form.markAsPristine();
      if (this.dialogRef) {
        this.dialogRef.close(saved);
        return;
      }
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
