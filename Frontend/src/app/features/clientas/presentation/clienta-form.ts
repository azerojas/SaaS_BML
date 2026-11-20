import { UnsavedForm } from '../../../core/forms/unsaved-form';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { ClientasFacade } from '../application/clientas-facade';
import { Clienta, CLIENTA_FIELDS, phone } from '../domain/clienta';
import { buildFields, EditorFields } from '../../../shared/ui/editor-fields';
import { FormFeedback } from '../../../shared/ui/form-feedback';
import { Loading } from '../../../shared/ui/loading';
import { Button } from '../../../shared/ui/button';
import { Icon } from '../../../shared/ui/icon';
@Component({
  selector: 'bm-clienta-form',
  imports: [
    RouterLink,
    ReactiveFormsModule,
    MatButtonModule,
    EditorFields,
    Loading,
    Button,
    UnsavedForm,
    MatDialogModule,
    NgTemplateOutlet,
    Icon,
    FormFeedback,
  ],
  providers: [ClientasFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './clienta-form.scss',
  template: `@if (inDialog) {
      <header class="edit-heading">
        <span class="edit-icon"><bm-icon name="edit" /></span>
        <div>
          <p class="eyebrow">INFORMACIÓN PERSONAL</p>
          <h2 mat-dialog-title>{{ id ? 'Editar ficha' : 'Nueva clienta' }}</h2>
        </div>
        <button
          mat-icon-button
          type="button"
          [disabled]="facade.busy()"
          (click)="cancel()"
          aria-label="Cerrar edición"
        >
          <bm-icon name="close" />
        </button>
      </header>
    } @else {
      <a class="back-link" routerLink="/admin/clientas">← Clientas</a>
      <header class="feature-heading">
        <div>
          <p class="eyebrow">INFORMACIÓN PERSONAL</p>
          <h1>{{ id ? 'Editar clienta' : 'Nueva clienta' }}</h1>
          <p>Datos privados, accesibles solo para el equipo autorizado.</p>
        </div>
      </header>
    }
    @if (facade.loading()) {
      <bm-loading />
    } @else {
      <form
        bmUnsavedForm
        class="client-editor"
        [class.surface]="!inDialog"
        [class.editor]="!inDialog"
        [formGroup]="form"
        (ngSubmit)="save()"
      >
        @if (inDialog) {
          <mat-dialog-content
            ><ng-container [ngTemplateOutlet]="editorFields"
          /></mat-dialog-content>
          <mat-dialog-actions align="end">
            <bm-button type="submit" [busy]="facade.busy()">Guardar clienta</bm-button>
          </mat-dialog-actions>
        } @else {
          <ng-container [ngTemplateOutlet]="editorFields" />
          <div class="form-actions">
            <a mat-button routerLink="/admin/clientas">Cancelar</a
            ><bm-button type="submit" [busy]="facade.busy()">Guardar clienta</bm-button>
          </div>
        }
      </form>
    }
    <ng-template #editorFields>
      <bm-form-feedback [compact]="true" [message]="facade.error()" [errors]="facade.fields()" />
      <bm-editor-fields
        [compact]="true"
        [fields]="fields"
        [form]="form"
        [errors]="facade.fields()"
      />
      <p class="muted">
        El consentimiento de datos se gestiona por separado desde la ficha de la clienta.
      </p>
    </ng-template>`,
})
export class ClientaForm {
  readonly facade = inject(ClientasFacade);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly dialogData = inject<Clienta>(MAT_DIALOG_DATA, { optional: true });
  private readonly dialogRef = inject<MatDialogRef<ClientaForm, Clienta>>(MatDialogRef, {
    optional: true,
  });
  readonly inDialog = !!this.dialogRef;
  readonly id = this.dialogData?.id || Number(this.route.snapshot.paramMap.get('id')) || undefined;
  readonly fields = CLIENTA_FIELDS;
  readonly form = buildFields(this.fields);
  constructor() {
    this.form.controls['telefono'].addValidators((control) =>
      phone(String(control.value)) ? null : { phone: true },
    );
    this.form.controls['fecha_nacimiento'].addValidators((control) =>
      control.value && String(control.value) > new Date().toISOString().slice(0, 10)
        ? { future: true }
        : null,
    );
    void this.init();
  }
  private async init() {
    if (this.id) {
      await this.facade.loadClient(this.id);
      const c = this.facade.record();
      if (c)
        this.form.patchValue({
          nombres: c.nombres,
          apellidos: c.apellidos,
          telefono: c.telefono,
          email: c.email ?? '',
          fecha_nacimiento: c.fecha_nacimiento ?? '',
          notas_privadas: c.notas_privadas ?? '',
        });
    }
  }
  async save() {
    if (this.facade.busy()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    const result = await this.facade.save(
      {
        ...raw,
        nombres: String(raw['nombres']).trim(),
        apellidos: String(raw['apellidos']).trim(),
        telefono: phone(String(raw['telefono'])),
        email: raw['email'] || null,
        fecha_nacimiento: raw['fecha_nacimiento'] || null,
      },
      this.id,
    );
    if (result) {
      this.form.markAsPristine();
      if (this.dialogRef) this.dialogRef.close(result);
      else await this.router.navigate(['/admin/clientas', result.id]);
    }
  }
  cancel() {
    if (!this.facade.busy()) this.dialogRef?.close();
  }
}
