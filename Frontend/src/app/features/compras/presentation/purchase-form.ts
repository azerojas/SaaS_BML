import { DateField } from '../../../shared/ui/date-field';
import { NgTemplateOutlet } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { StockItem } from '../../inventario/domain/inventory';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Icon } from '../../../shared/ui/icon';
import { UnsavedForm } from '../../../core/forms/unsaved-form';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { SessionStore } from '../../../core/auth/application/session-store';
import { PurchasesFacade } from '../application/purchases-facade';
import {
  PurchaseInput,
  Purchase,
  PurchaseLineInput,
  estimatedTotal,
  purchaseTimestamp,
  limaDateInput,
} from '../domain/purchase';
import { Field, decimalValid, pen } from '../../../shared/domain/records';
import { CatalogRecord } from '../../catalogo/domain/catalog';
import { ReferencePicker } from '../../catalogo/presentation/reference-picker';
import { SupplierPicker } from '../../proveedores/presentation/supplier-picker';
import { EditorFields, buildFields } from '../../../shared/ui/editor-fields';
import { OperationsNav } from '../../../shared/ui/operations-nav';
import { Alert } from '../../../shared/ui/alert';
import { FormFeedback } from '../../../shared/ui/form-feedback';
import { Loading } from '../../../shared/ui/loading';
import { Button } from '../../../shared/ui/button';
type LineForm = FormGroup<{
  articulo: FormControl<string>;
  unidad: FormControl<string>;
  nombre: FormControl<string>;
  unidadCodigo: FormControl<string>;
  cantidad: FormControl<string>;
  costo: FormControl<string>;
  lote: FormControl<string>;
  vencimiento: FormControl<string>;
}>;
@Component({
  selector: 'bm-purchase-form',
  imports: [
    NgTemplateOutlet,
    MatDialogModule,
    Icon,
    DateField,
    RouterLink,
    ReactiveFormsModule,
    MatButtonModule,
    MatTooltipModule,
    ReferencePicker,
    SupplierPicker,
    EditorFields,
    OperationsNav,
    Alert,
    Loading,
    Button,
    UnsavedForm,
    FormFeedback,
  ],
  providers: [PurchasesFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (dialogRef) {
      <header class="purchase-dialog-heading">
        <span class="purchase-heading-icon"><bm-icon name="box" /></span>
        <div>
          <span class="purchase-overline">LASHEO · COMPRAS</span>
          <h2 mat-dialog-title>{{ id ? 'Editar compra' : 'Nueva compra' }}</h2>
          <p>Completa los datos y añade los artículos que necesitas.</p>
        </div>
        <button
          mat-icon-button
          type="button"
          aria-label="Cerrar compra"
          [disabled]="saveState.busy()"
          (click)="close()"
        >
          <bm-icon name="close" />
        </button>
      </header>
      <mat-dialog-content><ng-container [ngTemplateOutlet]="editor" /></mat-dialog-content>
      <mat-dialog-actions class="purchase-dialog-footer">
        <div class="purchase-footer-total">
          <span>Total estimado</span
          ><strong>{{ total() !== null ? money(total()!) : 'Revisa los importes' }}</strong
          ><small>El stock cambia al recibir la compra.</small>
        </div>
        <button
          mat-flat-button
          aria-label="Guardar borrador"
          type="submit"
          form="purchase-editor-form"
          [disabled]="
            saveState.busy() ||
            facade.loading() ||
            facade.creation.uncertain() ||
            facade.creation.needsRecovery()
          "
          [attr.aria-busy]="saveState.busy()"
        >
          <span class="purchase-save-content"
            ><span>{{ saveState.busy() ? 'Guardando…' : 'Guardar' }}</span></span
          >
        </button>
      </mat-dialog-actions>
    } @else {
      <bm-operations-nav /><a class="back-link" routerLink="/admin/compras">← Compras</a>
      <header class="feature-heading">
        <div>
          <p class="eyebrow">PREPARA CADA DETALLE</p>
          <h1>{{ id ? 'Editar borrador #' + id : 'Nueva compra' }}</h1>
          <p>Guardar crea un borrador. El stock cambia únicamente después de recibirlo.</p>
        </div>
      </header>
      <ng-container [ngTemplateOutlet]="editor" />
    }
    <ng-template #editor>
      <bm-form-feedback
        [message]="localError() || saveState.error()"
        [errors]="saveState.fields()"
      />
      @if (!id && facade.creation.needsRecovery()) {
        <section class="surface">
          <h2>Hay un intento anterior por comprobar</h2>
          <p>Consultamos su resultado en Django para evitar otra compra duplicada.</p>
          <bm-button [busy]="facade.creation.busy()" (click)="recover()"
            >Consultar intento anterior</bm-button
          >
        </section>
      }
      @if (!id && facade.creation.uncertain()) {
        <bm-alert
          message="No se confirmó el resultado. La compra podría haberse guardado; reintenta la misma operación con su clave original."
        />
        <div class="form-actions">
          <bm-button [busy]="facade.creation.busy()" (click)="retry()"
            >Reintentar la misma compra</bm-button
          ><button mat-stroked-button type="button" (click)="recover()">
            Consultar estado del intento
          </button>
        </div>
      }
      @if (facade.loading()) {
        <bm-loading />
      } @else if (id && (!facade.record() || facade.record()?.estado !== 'BORRADOR')) {
        <bm-alert [message]="facade.error() || 'Esta compra ya no puede editarse.'" />
      } @else {
        <form id="purchase-editor-form" bmUnsavedForm [formGroup]="form" (ngSubmit)="save()">
          <fieldset
            class="surface editor inventory-fieldset"
            [disabled]="
              saveState.busy() ||
              (!id && (facade.creation.uncertain() || facade.creation.needsRecovery()))
            "
          >
            <legend>Datos de la compra</legend>
            @if (session.hasPermission('negocio.view_proveedores')) {
              <bm-supplier-picker
                [value]="String(header.controls['proveedor_id'].value)"
                [currentLabel]="facade.record()?.proveedor_nombre ?? ''"
                (changed)="supplier($event)"
              />
            } @else {
              <p class="muted">
                No tienes permiso para consultar proveedores; se conserva la referencia existente.
              </p>
            }
            <bm-editor-fields
              [fields]="documentFields"
              [form]="header"
              [errors]="saveState.fields()"
            />
            <div class="purchase-items-heading">
              <div>
                <h2>Artículos de la compra</h2>
                <p class="muted">Indica la cantidad y el costo unitario de cada artículo.</p>
              </div>
              <button
                mat-stroked-button
                type="button"
                [disabled]="lines.length >= 200"
                (click)="addLine()"
              >
                <span class="purchase-save-content"
                  ><bm-icon name="plus" /><span>Añadir línea</span></span
                >
              </button>
            </div>
            @for (row of lines.controls; track row; let index = $index) {
              <section class="purchase-line">
                <div class="purchase-line-heading">
                  <h3>Artículo {{ index + 1 }}</h3>
                  <button
                    mat-icon-button
                    type="button"
                    [attr.aria-label]="'Retirar línea ' + (index + 1)"
                    matTooltip="Retirar artículo"
                    (click)="removeLine(index)"
                  >
                    <bm-icon name="trash" />
                  </button>
                </div>
                <bm-reference-picker
                  [id]="'purchase-article-' + index"
                  label="Artículo activo"
                  kind="articulos"
                  [activeOnly]="true"
                  [required]="true"
                  [value]="row.controls.articulo.value"
                  [currentLabel]="row.controls.nombre.value"
                  (changed)="row.controls.articulo.setValue($event)"
                  (selected)="choose(row, $event)"
                />
                <div
                  class="field-feedback"
                  tabindex="0"
                  role="region"
                  aria-label="Avisos del campo"
                >
                  @if (row.controls.articulo.invalid && row.controls.articulo.touched) {
                    <p class="field-error" role="alert">Selecciona un artículo.</p>
                  }
                </div>
                <div class="form-grid section-gap">
                  <div>
                    <label [for]="'purchase-quantity-' + index">Cantidad *</label
                    ><input
                      [id]="'purchase-quantity-' + index"
                      inputmode="decimal"
                      [formControl]="row.controls.cantidad"
                      [attr.aria-invalid]="
                        row.controls.cantidad.invalid && row.controls.cantidad.touched
                          ? 'true'
                          : null
                      "
                    /><small>{{
                      row.controls.unidadCodigo.value
                        ? 'Unidad vigente: ' + row.controls.unidadCodigo.value
                        : 'Selecciona un artículo para confirmar su unidad.'
                    }}</small>
                    <div
                      class="field-feedback"
                      tabindex="0"
                      role="region"
                      aria-label="Avisos del campo"
                    >
                      @if (row.controls.cantidad.invalid && row.controls.cantidad.touched) {
                        <p class="field-error" role="alert">
                          Indica una cantidad mayor que cero, con hasta 3 decimales.
                        </p>
                      }
                    </div>
                  </div>
                  <div>
                    <label [for]="'purchase-cost-' + index">Costo unitario (S/) *</label
                    ><input
                      [id]="'purchase-cost-' + index"
                      inputmode="decimal"
                      [formControl]="row.controls.costo"
                      [attr.aria-invalid]="
                        row.controls.costo.invalid && row.controls.costo.touched ? 'true' : null
                      "
                    /><small>Hasta 4 decimales; no es precio de venta.</small>
                    <div
                      class="field-feedback"
                      tabindex="0"
                      role="region"
                      aria-label="Avisos del campo"
                    >
                      @if (row.controls.costo.invalid && row.controls.costo.touched) {
                        <p class="field-error" role="alert">
                          Indica un costo válido, con hasta 4 decimales.
                        </p>
                      }
                    </div>
                  </div>
                  <div>
                    <label [for]="'purchase-lot-' + index">Lote (opcional)</label
                    ><input
                      [id]="'purchase-lot-' + index"
                      maxlength="80"
                      [formControl]="row.controls.lote"
                    />
                  </div>
                  <div>
                    <label [for]="'purchase-expiry-' + index">Vencimiento (opcional)</label
                    ><bm-date-field
                      ariaLabel="Vencimiento (opcional)"
                      [inputId]="'purchase-expiry-' + index"
                      [formControl]="row.controls.vencimiento"
                    />
                  </div>
                </div>
              </section>
            }
            @if (!lines.length) {
              <p class="muted">Borrador sin líneas. No se podrá recibir mientras esté vacío.</p>
            }
            <bm-editor-fields
              class="purchase-notes"
              [fields]="noteFields"
              [form]="header"
              [errors]="saveState.fields()"
            />
            @if (!dialogRef) {
              <div class="purchase-estimate">
                <span>Total preliminar estimado</span
                ><strong>{{
                  total() !== null ? money(total()!) : 'Revisa cantidades y costos'
                }}</strong
                ><small>Django confirma el total oficial al guardar y recibir.</small>
              </div>
              <div class="form-actions">
                <bm-button type="submit" [busy]="saveState.busy()">Guardar borrador</bm-button>
                @if (!dialogRef) {
                  <a mat-button routerLink="/admin/compras">Volver a compras</a>
                }
              </div>
            }
          </fieldset>
        </form>
      }
    </ng-template>`,
  styleUrl: './purchase-form.scss',
})
export class PurchaseForm {
  readonly dialogRef = inject<MatDialogRef<PurchaseForm, Purchase>>(MatDialogRef, {
    optional: true,
  });
  readonly facade = inject(PurchasesFacade);
  readonly session = inject(SessionStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly dialogData = inject<{ id?: number; article?: StockItem }>(MAT_DIALOG_DATA, {
    optional: true,
  });
  readonly id = this.dialogRef
    ? this.dialogData?.id
    : Number(this.route.snapshot.paramMap.get('id')) || undefined;
  readonly localError = signal<string | null>(null);
  readonly String = String;
  readonly money = pen;
  private initialDate = '';
  readonly headerFields: readonly Field[] = [
    { key: 'numero_documento', label: 'Número de documento', max: 90 },
    {
      key: 'fecha',
      label: 'Fecha y hora de compra (Lima, opcional)',
      type: 'datetime-local',
      hint: 'Sin fecha se utiliza la del servidor. No se aceptan fechas futuras.',
    },
    { key: 'observaciones', label: 'Observaciones de compra', type: 'textarea', max: 10000 },
  ];
  readonly documentFields = this.headerFields.filter((field) => field.key !== 'observaciones');
  readonly noteFields = this.headerFields.filter((field) => field.key === 'observaciones');
  readonly header = buildFields([
    ...this.headerFields,
    { key: 'proveedor_id', label: 'Proveedor' },
  ]);
  readonly lines = new FormArray<LineForm>([]);
  readonly form = new FormGroup({ lines: this.lines, header: this.header });
  get saveState() {
    return this.id ? this.facade : this.facade.creation;
  }
  constructor() {
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
    this.header.controls['fecha'].addValidators((control) =>
      !control.value ||
      (purchaseTimestamp(String(control.value)) &&
        Date.parse(purchaseTimestamp(String(control.value))!) <= Date.now())
        ? null
        : { date: true },
    );
    void this.init();
  }
  private async init() {
    if (this.id) {
      await this.facade.get(this.id);
      const purchase = this.facade.record();
      if (purchase) {
        this.initialDate = limaDateInput(purchase.fecha);
        this.header.patchValue({
          numero_documento: purchase.numero_documento ?? '',
          proveedor_id: purchase.proveedor_id ? String(purchase.proveedor_id) : '',
          fecha: this.initialDate,
          observaciones: purchase.observaciones ?? '',
        });
        for (const row of purchase.detalles ?? []) {
          const line = this.add();
          line.patchValue({
            articulo: String(row.articulo_id),
            unidad: String(row.unidad_id),
            nombre: row.articulo_nombre,
            unidadCodigo: row.unidad,
            cantidad: row.cantidad,
            costo: row.costo_unitario,
            lote: row.numero_lote ?? '',
            vencimiento: row.vencimiento ?? '',
          });
        }
      }
    } else {
      const line = this.add();
      const article = this.dialogData?.article;
      if (article)
        line.patchValue({
          articulo: String(article.articulo_id),
          unidad: String(article.unidad_id),
          nombre: article.nombre,
          unidadCodigo: article.unidad,
        });
      if (this.facade.creation.needsRecovery()) await this.recover();
    }
  }
  add() {
    const control = (value = '') => new FormControl(value, { nonNullable: true });
    const row = new FormGroup({
      articulo: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
      unidad: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
      nombre: control(),
      unidadCodigo: control(),
      cantidad: new FormControl('1.000', {
        nonNullable: true,
        validators: [
          (field) => (decimalValid(field.value, 3, 11, true) ? null : { decimal: true }),
        ],
      }),
      costo: new FormControl('0.0000', {
        nonNullable: true,
        validators: [(field) => (decimalValid(field.value, 4, 8) ? null : { decimal: true })],
      }),
      lote: control(),
      vencimiento: control(),
    });
    this.lines.push(row);
    return row;
  }
  choose(row: LineForm, article: CatalogRecord | null) {
    this.form.markAsDirty();
    row.controls.unidad.setValue(article ? String(article['unidad_id']) : '');
    row.controls.unidadCodigo.setValue(article ? String(article['unidad_codigo']) : '');
    row.controls.nombre.setValue(article?.nombre ?? '');
  }
  supplier(value: string) {
    this.header.controls['proveedor_id'].setValue(value);
    this.form.markAsDirty();
  }
  addLine() {
    this.add();
    this.form.markAsDirty();
  }
  removeLine(index: number) {
    this.lines.removeAt(index);
    this.form.markAsDirty();
  }
  close() {
    if (this.saveState.busy()) return;
    if (
      this.form.dirty &&
      !window.confirm('Hay cambios sin guardar. ¿Quieres salir y descartarlos?')
    )
      return;
    this.dialogRef?.close();
  }
  private async finish(saved: Purchase) {
    this.form.markAsPristine();
    if (this.dialogRef) this.dialogRef.close(saved);
    else await this.router.navigate(['/admin/compras', saved.id]);
  }
  private rows(): PurchaseLineInput[] {
    return this.lines.getRawValue().map((row) => ({
      articulo_id: Number(row.articulo),
      unidad_id: Number(row.unidad),
      cantidad: row.cantidad,
      costo_unitario: row.costo,
      numero_lote: row.lote || null,
      vencimiento: row.vencimiento || null,
    }));
  }
  total() {
    return estimatedTotal(this.rows());
  }
  async save() {
    if (this.saveState.busy()) return;
    if (!this.id && (this.facade.creation.uncertain() || this.facade.creation.needsRecovery()))
      return;
    this.localError.set(null);
    if (this.form.invalid || this.total() === null) {
      this.form.markAllAsTouched();
      this.localError.set('Revisa artículos, unidades, cantidades, costos y fecha.');
      return;
    }
    const raw = this.header.getRawValue();
    const data: PurchaseInput = {
      proveedor_id: raw['proveedor_id'] ? Number(raw['proveedor_id']) : null,
      numero_documento: String(raw['numero_documento']).trim() || null,
      observaciones: String(raw['observaciones']),
      detalles: this.rows(),
    };
    if (raw['fecha'] && String(raw['fecha']) !== this.initialDate)
      data.fecha = purchaseTimestamp(String(raw['fecha']))!;
    const saved = this.id ? await this.facade.save(this.id, data) : await this.facade.create(data);
    if (saved) await this.finish(saved);
  }
  async retry() {
    const saved = await this.facade.retry();
    if (saved) await this.finish(saved);
  }
  async recover() {
    const saved = await this.facade.recover();
    if (saved) await this.finish(saved);
  }
}
