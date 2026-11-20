import { NgTemplateOutlet } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { Icon } from '../../../shared/ui/icon';
import { UnsavedForm } from '../../../core/forms/unsaved-form';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ReactiveFormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { SessionStore } from '../../../core/auth/application/session-store';
import { CatalogFacade } from '../application/catalog-facade';
import { CatalogRecord, DEFINITIONS, Kind, catalogPayload } from '../domain/catalog';
import { buildFields, EditorFields } from '../../../shared/ui/editor-fields';
import { ReferencePicker } from './reference-picker';
import { TreatmentStaffPicker } from './treatment-staff-picker';
import { Alert } from '../../../shared/ui/alert';
import { FormFeedback } from '../../../shared/ui/form-feedback';
import { Loading } from '../../../shared/ui/loading';
import { Button } from '../../../shared/ui/button';
import { safeCatalogImage } from '../../../shared/domain/records';
export interface CatalogEditorData {
  kind: Kind;
  id?: number;
}

@Component({
  selector: 'bm-catalog-form',
  imports: [
    NgTemplateOutlet,
    MatDialogModule,
    Icon,
    RouterLink,
    ReactiveFormsModule,
    MatButtonModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
    EditorFields,
    ReferencePicker,
    Alert,
    Loading,
    Button,
    UnsavedForm,
    FormFeedback,
    TreatmentStaffPicker,
  ],
  providers: [CatalogFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (dialogRef) {
      <header class="catalog-dialog-heading">
        <span class="catalog-heading-icon"
          ><bm-icon [name]="kind === 'servicios' ? 'sparkles' : 'box'"
        /></span>
        <div class="catalog-title">
          <p class="catalog-overline">LASHEO · CATÁLOGO</p>
          <h2 mat-dialog-title>{{ id ? 'Editar' : 'Crear' }} {{ definition.singular }}</h2>
          <p class="catalog-subtitle">
            {{
              id ? 'Cuida cada detalle de tu catálogo.' : 'Dale un lugar a lo nuevo en tu salón.'
            }}
          </p>
        </div>
        <button
          mat-icon-button
          type="button"
          [attr.aria-label]="'Cerrar ' + definition.singular"
          matTooltip="Cerrar"
          [disabled]="facade.busy()"
          (click)="close()"
        >
          <bm-icon name="close" />
        </button>
      </header>
      <mat-dialog-content class="catalog-dialog-body"
        ><ng-container [ngTemplateOutlet]="editor"
      /></mat-dialog-content>
      <mat-dialog-actions align="end">
        <span class="catalog-footer-note">Los campos con * son obligatorios</span>
        <button
          mat-flat-button
          class="save-treatment"
          [attr.aria-label]="'Guardar ' + definition.singular"
          [matTooltip]="'Guardar ' + definition.singular"
          [attr.aria-busy]="facade.busy()"
          type="submit"
          form="catalog-editor-form"
          [disabled]="
            facade.busy() ||
            facade.loading() ||
            photoReading() ||
            categoryPending() ||
            (!!id && !facade.record())
          "
        >
          @if (facade.busy()) {
            <mat-spinner diameter="20" aria-label="Guardando" />
          } @else {
            Guardar
          }
        </button>
      </mat-dialog-actions>
    } @else {
      <a class="back-link" [routerLink]="base">← {{ definition.title }}</a>
      <header class="feature-heading">
        <div>
          <p class="eyebrow">CADA DETALLE CUENTA</p>
          <h1>{{ id ? 'Editar' : 'Crear' }} {{ definition.singular }}</h1>
        </div>
      </header>
      <ng-container [ngTemplateOutlet]="editor" />
    }
    <ng-template #editor>
      @if (facade.loading()) {
        <bm-loading />
      } @else if (id && !facade.record()) {
        <bm-alert [message]="facade.error() || 'Registro no disponible.'" />
      } @else {
        <form
          id="catalog-editor-form"
          bmUnsavedForm
          class="surface editor"
          [formGroup]="form"
          (ngSubmit)="save()"
        >
          <bm-form-feedback [message]="localError() || facade.error()" [errors]="facade.fields()" />
          @if (kind === 'servicios') {
            <section class="treatment-photo" aria-labelledby="treatment-photo-title">
              <div class="treatment-photo-preview">
                @if (photoSource(); as source) {
                  <img [src]="source" alt="Foto del tratamiento" (error)="photoFailed()" />
                } @else {
                  <bm-icon name="image" />
                }
              </div>
              <div>
                <h3 id="treatment-photo-title">Foto del tratamiento</h3>
                <p class="muted">JPG, PNG o WebP · Hasta 5 MB</p>
                @if (canUploadPhoto()) {
                  <input
                    #photoInput
                    id="treatment-photo"
                    aria-label="Seleccionar foto del tratamiento"
                    style="display: none"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    hidden
                    (change)="selectPhoto($event)"
                  />
                  <button
                    mat-icon-button
                    type="button"
                    [attr.aria-label]="photoSource() ? 'Cambiar foto' : 'Subir foto'"
                    [matTooltip]="photoSource() ? 'Cambiar foto' : 'Subir foto'"
                    [disabled]="facade.busy() || photoReading()"
                    (click)="photoInput.click()"
                  >
                    <bm-icon name="camera" />
                  </button>
                  @if (photoFile() || photoError()) {
                    <button
                      mat-icon-button
                      type="button"
                      aria-label="Descartar foto seleccionada"
                      matTooltip="Descartar selección"
                      [disabled]="facade.busy()"
                      (click)="discardPhoto()"
                    >
                      <bm-icon name="restore" />
                    </button>
                  }
                }
                @if (photoReading()) {
                  <p role="status">Preparando foto…</p>
                }
              </div>
              <div
                class="photo-error field-feedback"
                tabindex="0"
                role="region"
                aria-label="Avisos de la foto"
              >
                @if (photoError() || facade.fields()['foto']) {
                  <p class="field-error" role="alert">
                    {{ photoError() || facade.fields()['foto']?.join(' ') }}
                  </p>
                }
              </div>
            </section>
          }
          @if (kind === 'servicios' || kind === 'articulos') {
            <div class="reference-grid">
              @if (
                canReference(kind === 'servicios' ? 'categoriasservicio' : 'categoriasarticulo')
              ) {
                <bm-reference-picker
                  id="category"
                  label="Categoría"
                  [kind]="kind === 'servicios' ? 'categorias-servicio' : 'categorias-articulo'"
                  [allowCreate]="true"
                  (pending)="categoryPending.set($event)"
                  [value]="String(form.controls['categoria_id'].value)"
                  [currentLabel]="String(facade.record()?.['categoria_nombre'] || '')"
                  (changed)="reference('categoria_id', $event)"
                />
              } @else {
                <p>Sin permiso para consultar categorías. Se conserva la categoría actual.</p>
              }
              @if (kind === 'articulos') {
                @if (canReference('unidadesmedida')) {
                  <div class="reference-field">
                    <bm-reference-picker
                      id="unit"
                      label="Unidad de medida"
                      kind="unidades"
                      [required]="true"
                      [value]="String(form.controls['unidad_id'].value)"
                      [currentLabel]="String(facade.record()?.['unidad_codigo'] || '')"
                      (changed)="reference('unidad_id', $event)"
                    />
                    <div class="field-feedback">
                      @if (
                        form.controls['unidad_id'].invalid && form.controls['unidad_id'].touched
                      ) {
                        <p class="field-error" role="alert">Selecciona una unidad de medida.</p>
                      }
                    </div>
                  </div>
                } @else {
                  <p role="status">
                    Necesitas permiso para consultar unidades antes de crear un artículo.
                  </p>
                }
              }
            </div>
          }
          <bm-editor-fields [fields]="fields" [form]="form" [errors]="facade.fields()" />
          @if (canAssignStaff()) {
            <bm-treatment-staff-picker
              [selected]="staffIds()"
              [busy]="facade.busy()"
              (changed)="changeStaff($event)"
            />
          }
          @if (kind === 'articulos') {
            <p class="muted">
              Los insumos no se publican como productos. El stock actual se consulta en la ficha; no
              se modifica desde este formulario.
            </p>
          }
          @if (!dialogRef) {
            <div class="form-actions">
              <a mat-button [routerLink]="base">Cancelar</a
              ><bm-button type="submit" [busy]="facade.busy()"
                >Guardar {{ definition.singular }}</bm-button
              >
            </div>
          }
        </form>
      }
    </ng-template>`,
  styles: `
    .treatment-photo {
      display: grid;
      grid-template-columns: 112px minmax(0, 1fr);
      gap: 16px;
      align-items: center;
      margin-bottom: 24px;
    }
    .treatment-photo h3 {
      margin: 0;
      font-size: 14px;
    }
    .treatment-photo .muted {
      margin: 6px 0;
    }
    .treatment-photo-preview {
      width: 112px;
      height: 112px;
      display: grid;
      place-items: center;
      overflow: hidden;
      border-radius: 14px;
      background: var(--surface-low);
      border: 1px solid var(--line);
    }
    .treatment-photo-preview img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .treatment-photo-preview bm-icon {
      width: 32px;
      height: 32px;
      color: var(--muted);
    }
    .photo-error {
      grid-column: 1/-1;
      margin: 0;
      color: var(--error);
      font-size: 12px;
    }
    .save-treatment {
      background: var(--forest);
      color: var(--on-primary);
      height: 36px;
      min-height: 36px;
      border-radius: 8px;
    }
    :host {
      display: block;
      min-width: 0;
      background: var(--paper);
    }
    .catalog-dialog-heading {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 20px 24px;
      border-top: 3px solid var(--forest);
      border-bottom: 1px solid var(--line);
    }
    .catalog-heading-icon {
      display: grid;
      place-items: center;
      width: 44px;
      height: 44px;
      border-radius: 14px;
      background: var(--surface-low);
      color: var(--forest);
      flex-shrink: 0;
    }
    .catalog-heading-icon bm-icon {
      width: 22px;
      height: 22px;
    }
    .catalog-title {
      flex: 1;
      min-width: 0;
    }
    .catalog-overline {
      font-size: 9px;
      letter-spacing: 0.12em;
      color: var(--forest);
      margin: 0 0 5px;
    }
    .catalog-subtitle {
      font-size: 11px;
      color: var(--muted);
      margin: 6px 0 0;
    }
    .catalog-dialog-heading h2 {
      padding: 0;
      margin: 0;
      flex: 1;
      font:
        500 25px/1.3 'Calendar Playfair',
        Georgia,
        serif;
      line-height: 1.5;
    }
    .catalog-dialog-heading h2::before {
      display: none;
    }
    .catalog-dialog-heading button {
      flex-shrink: 0;
    }
    .catalog-dialog-body {
      max-height: 65dvh;
      background: var(--paper);
      --canvas: var(--paper);
    }
    .catalog-dialog-body .editor {
      padding: 0;
      border: 0;
      box-shadow: none;
      background: transparent;
    }
    mat-dialog-actions {
      padding: 16px 24px 24px;
      border-top: 1px solid var(--line);
    }
    .catalog-footer-note {
      font-size: 10px;
      color: var(--muted);
      margin-right: auto;
    }
    @media (max-width: 600px) {
      .catalog-dialog-heading {
        padding: 16px;
        gap: 10px;
      }
      .catalog-dialog-heading h2 {
        font-size: 22px;
      }
      .catalog-subtitle {
        display: none;
      }
      mat-dialog-actions {
        padding: 14px 16px;
      }
      .catalog-footer-note {
        max-width: 145px;
        font-size: 9px;
      }
    }
  `,
})
export class CatalogForm {
  readonly dialogData = inject<CatalogEditorData | null>(MAT_DIALOG_DATA, { optional: true });
  readonly dialogRef = inject<MatDialogRef<CatalogForm, CatalogRecord>>(MatDialogRef, {
    optional: true,
  });
  readonly facade = inject(CatalogFacade);
  readonly session = inject(SessionStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly kind = this.dialogData?.kind ?? (this.route.snapshot.data['kind'] as Kind);
  readonly definition = DEFINITIONS[this.kind];
  readonly id =
    this.dialogData?.id ?? (Number(this.route.snapshot.paramMap.get('id')) || undefined);
  readonly base = '/admin/catalogo/' + this.kind;
  readonly fields = this.definition.fields.map((field) => ({
    ...field,
    readonly: field.key === 'slug' && !!this.id,
  }));
  readonly form = buildFields(this.fields, {
    activo: true,
    activa: true,
    tipo: 'INSUMO',
    precio_base: '0.00',
    precio_venta: '0.00',
    stock_minimo: '0.000',
    orden: '0',
  });
  readonly localError = signal<string | null>(null);
  readonly categoryPending = signal(false);
  readonly staffIds = signal<number[]>([]);
  private readonly staffChanged = signal(false);
  canAssignStaff() {
    return (
      this.kind === 'servicios' &&
      this.session.hasPermission('agenda.view_agenda') &&
      this.session.hasPermission('agenda.manage_professionals')
    );
  }
  changeStaff(ids: number[]) {
    this.staffIds.set(ids);
    this.staffChanged.set(true);
    this.form.markAsDirty();
  }
  readonly String = String;
  readonly photoFile = signal<File | null>(null);
  readonly photoPreview = signal<string | null>(null);
  readonly photoReading = signal(false);
  readonly photoError = signal<string | null>(null);
  private readonly failedExistingPhoto = signal(false);
  private photoReader: FileReader | null = null;
  constructor() {
    inject(DestroyRef).onDestroy(() => this.photoReader?.abort());
    this.dialogRef
      ?.keydownEvents()
      .pipe(takeUntilDestroyed())
      .subscribe((event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          this.close();
        }
      });
    this.dialogRef
      ?.backdropClick()
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.close());
    this.facade.configure(this.kind);
    if (this.kind === 'servicios' || this.kind === 'articulos') {
      const refs = buildFields([
        { key: 'categoria_id', label: 'Categoría' },
        ...(this.kind === 'articulos'
          ? [{ key: 'unidad_id', label: 'Unidad', required: true }]
          : []),
      ]);
      for (const [key, control] of Object.entries(refs.controls))
        this.form.addControl(key, control);
    }
    for (const key of ['orden', 'duracion_minutos']) {
      this.form.controls[key]?.addValidators((control) =>
        !control.value ||
        (/^\d{1,10}$/.test(String(control.value)) &&
          Number(control.value) <= 2147483647 &&
          Number(control.value) >= (key === 'orden' ? 0 : 1))
          ? null
          : { integer: true },
      );
    }
    for (const key of ['sku', 'codigo'])
      this.form.controls[key]?.addValidators((control) =>
        !control.value || /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(String(control.value))
          ? null
          : { code: true },
      );
    this.form.controls['slug']?.addValidators((control) =>
      !control.value || /^[a-zA-Z0-9_-]+$/.test(String(control.value)) ? null : { slug: true },
    );
    for (const key of ['tipo', 'activo'])
      this.form.controls[key]?.valueChanges
        .pipe(takeUntilDestroyed())
        .subscribe(() => this.publicationPolicy());
    this.publicationPolicy();
    void this.init();
  }
  private async init() {
    if (this.id) {
      await this.facade.get(this.id);
      const record = this.facade.record();
      if (Array.isArray(record?.['profesionales_ids']))
        this.staffIds.set(record['profesionales_ids']);
      if (record)
        for (const [key, control] of Object.entries(this.form.controls)) {
          const value = record[key];
          if (value !== undefined)
            control.setValue(
              typeof value === 'boolean' ? value : value === null ? '' : String(value),
            );
        }
      this.publicationPolicy();
    }
  }
  private publicationPolicy() {
    const visible = this.form.controls['visible_catalogo'];
    if (!visible) return;
    const blocked =
      this.form.controls['activo']?.value === false ||
      (this.kind === 'articulos' && this.form.controls['tipo'].value === 'INSUMO');
    if (blocked) {
      visible.setValue(false);
      visible.disable();
    } else visible.enable();
  }
  canReference(model: string) {
    return this.session.hasPermission('negocio.view_' + model);
  }
  reference(key: string, value: string) {
    this.form.controls[key].setValue(value);
    this.form.controls[key].markAsDirty();
  }
  photoSource() {
    if (this.photoPreview()) return this.photoPreview();
    if (this.failedExistingPhoto()) return null;
    const source = this.facade.record()?.['imagen_principal'];
    return typeof source === 'string' ? safeCatalogImage(source) : null;
  }
  canUploadPhoto() {
    return (
      this.session.hasPermission('negocio.add_imagenescatalogo') &&
      (!this.id ||
        !this.facade.record()?.['imagen_principal'] ||
        this.session.hasPermission('negocio.change_imagenescatalogo'))
    );
  }
  selectPhoto(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.discardPhoto();
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      this.photoError.set('Selecciona una foto JPG, PNG o WebP.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      this.photoError.set('La foto debe pesar como máximo 5 MB.');
      return;
    }
    this.photoFile.set(file);
    this.photoReading.set(true);
    this.form.markAsDirty();
    const reader = (this.photoReader = new FileReader());
    reader.onload = () => {
      if (this.photoFile() !== file) return;
      this.photoPreview.set(typeof reader.result === 'string' ? reader.result : null);
      this.photoReading.set(false);
    };
    reader.onerror = () => {
      this.photoReading.set(false);
      this.photoError.set('No pudimos leer la foto. Selecciónala de nuevo.');
    };
    reader.readAsDataURL(file);
  }
  discardPhoto() {
    this.photoReader?.abort();
    this.photoFile.set(null);
    this.photoPreview.set(null);
    this.photoReading.set(false);
    this.photoError.set(null);
    if (Object.values(this.form.controls).every((control) => control.pristine))
      this.form.markAsPristine();
  }
  photoFailed() {
    if (this.photoFile()) {
      this.photoError.set('La foto seleccionada no se puede visualizar. Usa otra imagen.');
      this.photoFile.set(null);
      this.photoPreview.set(null);
    } else this.failedExistingPhoto.set(true);
  }
  close() {
    if (this.facade.busy()) return;
    if (
      this.form.dirty &&
      !window.confirm('Hay cambios sin guardar. ¿Quieres salir y descartarlos?')
    )
      return;
    this.dialogRef?.close();
  }
  async save() {
    this.localError.set(null);
    if (this.categoryPending()) {
      this.localError.set(
        'Guarda la nueva categoría o selecciona una existente antes de continuar.',
      );
      return;
    }
    if (this.photoReading() || this.photoError()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.localError.set('Revisa los campos obligatorios y las opciones seleccionadas.');
      return;
    }
    const raw = this.form.getRawValue();
    if (raw['reservable_online'] === true && !raw['duracion_minutos']) {
      this.localError.set('Indica la duración del tratamiento reservable.');
      return;
    }
    if (this.kind === 'articulos' && raw['tipo'] === 'INSUMO' && raw['visible_catalogo'] === true) {
      this.localError.set('Un insumo no puede publicarse como producto. Desmarca la visibilidad.');
      return;
    }
    if (raw['activo'] === false && raw['visible_catalogo'] === true) {
      this.localError.set('Activa el registro antes de publicarlo.');
      return;
    }
    const payload = catalogPayload(this.kind, raw, !!this.id);
    if (this.canAssignStaff() && (!this.id || this.staffChanged()))
      payload['profesionales_ids'] = this.staffIds();
    const saved = await this.facade.save(payload, this.id, this.photoFile());
    if (saved) {
      this.form.markAsPristine();
      if (this.dialogRef) this.dialogRef.close(saved);
      else await this.router.navigate([this.base, saved.id]);
    }
  }
}
