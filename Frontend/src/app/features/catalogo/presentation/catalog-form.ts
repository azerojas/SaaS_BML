import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ReactiveFormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { SessionStore } from '../../../core/auth/application/session-store';
import { CatalogFacade } from '../application/catalog-facade';
import { DEFINITIONS, Kind, catalogPayload } from '../domain/catalog';
import { buildFields, EditorFields } from '../../../shared/ui/editor-fields';
import { ReferencePicker } from './reference-picker';
import { Alert } from '../../../shared/ui/alert';
import { Loading } from '../../../shared/ui/loading';
import { Button } from '../../../shared/ui/button';
@Component({
  selector: 'bm-catalog-form',
  imports: [
    RouterLink,
    ReactiveFormsModule,
    MatButtonModule,
    EditorFields,
    ReferencePicker,
    Alert,
    Loading,
    Button,
  ],
  providers: [CatalogFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<a class="back-link" [routerLink]="base">← {{ definition.title }}</a>
    <header class="feature-heading">
      <div>
        <p class="eyebrow">CADA DETALLE CUENTA</p>
        <h1>{{ id ? 'Editar' : 'Crear' }} {{ definition.singular }}</h1>
      </div>
    </header>
    @if (facade.loading()) {
      <bm-loading />
    } @else if (id && !facade.record()) {
      <bm-alert [message]="facade.error() || 'Registro no disponible.'" />
    } @else {
      <form class="surface editor" [formGroup]="form" (ngSubmit)="save()">
        @if (facade.error(); as error) {
          <bm-alert [message]="error" />
        }
        @if (localError(); as error) {
          <bm-alert [message]="error" />
        }
        @if (kind === 'servicios' || kind === 'articulos') {
          <div class="reference-grid">
            @if (canReference(kind === 'servicios' ? 'categoriasservicio' : 'categoriasarticulo')) {
              <bm-reference-picker
                id="category"
                label="Categoría"
                [kind]="kind === 'servicios' ? 'categorias-servicio' : 'categorias-articulo'"
                [value]="String(form.controls['categoria_id'].value)"
                [currentLabel]="String(facade.record()?.['categoria_nombre'] || '')"
                (changed)="form.controls['categoria_id'].setValue($event)"
              />
            } @else {
              <p>Sin permiso para consultar categorías. Se conserva la categoría actual.</p>
            }
            @if (kind === 'articulos') {
              @if (canReference('unidadesmedida')) {
                <bm-reference-picker
                  id="unit"
                  label="Unidad de medida"
                  kind="unidades"
                  [required]="true"
                  [value]="String(form.controls['unidad_id'].value)"
                  [currentLabel]="String(facade.record()?.['unidad_codigo'] || '')"
                  (changed)="form.controls['unidad_id'].setValue($event)"
                />
              } @else {
                <p role="status">
                  Necesitas permiso para consultar unidades antes de crear un artículo.
                </p>
              }
            }
          </div>
        }
        <bm-editor-fields [fields]="fields" [form]="form" [errors]="facade.fields()" />
        @if (kind === 'articulos') {
          <p class="muted">
            Los insumos no se publican como productos. El stock actual se consulta en la ficha; no
            se modifica desde este formulario.
          </p>
        }
        <div class="form-actions">
          <a mat-button [routerLink]="base">Cancelar</a
          ><bm-button type="submit" [busy]="facade.busy()"
            >Guardar {{ definition.singular }}</bm-button
          >
        </div>
      </form>
    }`,
})
export class CatalogForm {
  readonly facade = inject(CatalogFacade);
  readonly session = inject(SessionStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly kind = this.route.snapshot.data['kind'] as Kind;
  readonly definition = DEFINITIONS[this.kind];
  readonly id = Number(this.route.snapshot.paramMap.get('id')) || undefined;
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
  readonly String = String;
  constructor() {
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
  async save() {
    this.localError.set(null);
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
    const saved = await this.facade.save(catalogPayload(this.kind, raw, !!this.id), this.id);
    if (saved) await this.router.navigate([this.base, saved.id]);
  }
}
