import { ValidationSummary } from '../../../shared/ui/validation-summary';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { SessionStore } from '../../../core/auth/application/session-store';
import { PurchasesFacade } from '../application/purchases-facade';
import {
  PurchaseInput,
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
    ValidationSummary,
    RouterLink,
    ReactiveFormsModule,
    MatButtonModule,
    ReferencePicker,
    SupplierPicker,
    EditorFields,
    OperationsNav,
    Alert,
    Loading,
    Button,
  ],
  providers: [PurchasesFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<bm-operations-nav /><a class="back-link" routerLink="/admin/compras">← Compras</a>
    <header class="feature-heading">
      <div>
        <p class="eyebrow">PREPARA CADA DETALLE</p>
        <h1>{{ id ? 'Editar borrador #' + id : 'Nueva compra' }}</h1>
        <p>Guardar crea un borrador. El stock cambia únicamente después de recibirlo.</p>
      </div>
    </header>
    @if (saveState.error(); as error) {
      <bm-alert [message]="error" />
    }
    <bm-validation-summary [errors]="saveState.fields()" />
    @if (localError(); as error) {
      <bm-alert [message]="error" />
    }
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
      <form [formGroup]="form" (ngSubmit)="save()">
        <fieldset
          class="surface editor inventory-fieldset"
          [disabled]="
            saveState.busy() ||
            (!id && (facade.creation.uncertain() || facade.creation.needsRecovery()))
          "
        >
          <legend>Datos del borrador</legend>
          @if (session.hasPermission('negocio.view_proveedores')) {
            <bm-supplier-picker
              [value]="String(header.controls['proveedor_id'].value)"
              [currentLabel]="facade.record()?.proveedor_nombre ?? ''"
              (changed)="header.controls['proveedor_id'].setValue($event)"
            />
          } @else {
            <p class="muted">
              No tienes permiso para consultar proveedores; se conserva la referencia existente.
            </p>
          }
          <bm-editor-fields [fields]="headerFields" [form]="header" [errors]="saveState.fields()" />
          <h2 class="section-gap">Artículos de la compra</h2>
          <p class="muted">
            Cantidades en la unidad vigente de cada artículo; no se convierten empaques. Lote y
            vencimiento son referencias de la compra, no saldo trazable por lote.
          </p>
          @for (row of lines.controls; track row; let index = $index) {
            <section class="purchase-line">
              <h3>Artículo {{ index + 1 }}</h3>
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
              <div class="form-grid section-gap">
                <div>
                  <label [for]="'purchase-quantity-' + index">Cantidad *</label
                  ><input
                    [id]="'purchase-quantity-' + index"
                    inputmode="decimal"
                    [formControl]="row.controls.cantidad"
                  /><small>{{
                    row.controls.unidadCodigo.value
                      ? 'Unidad vigente: ' + row.controls.unidadCodigo.value
                      : 'Selecciona un artículo para confirmar su unidad.'
                  }}</small>
                </div>
                <div>
                  <label [for]="'purchase-cost-' + index">Costo unitario (S/) *</label
                  ><input
                    [id]="'purchase-cost-' + index"
                    inputmode="decimal"
                    [formControl]="row.controls.costo"
                  /><small>Hasta 4 decimales; no es precio de venta.</small>
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
                  ><input
                    [id]="'purchase-expiry-' + index"
                    type="date"
                    [formControl]="row.controls.vencimiento"
                  />
                </div>
              </div>
              <button mat-button type="button" (click)="lines.removeAt(index)">
                Retirar línea {{ index + 1 }}
              </button>
            </section>
          }
          @if (!lines.length) {
            <p class="muted">Borrador sin líneas. No se podrá recibir mientras esté vacío.</p>
          }
          <div class="purchase-estimate">
            <span>Total preliminar estimado</span
            ><strong>{{ total() !== null ? money(total()!) : 'Revisa cantidades y costos' }}</strong
            ><small>Django confirma el total oficial al guardar y recibir.</small>
          </div>
          <div class="form-actions">
            <button
              mat-stroked-button
              type="button"
              [disabled]="lines.length >= 200"
              (click)="add()"
            >
              Añadir línea</button
            ><bm-button type="submit" [busy]="saveState.busy()">Guardar borrador</bm-button
            ><a mat-button routerLink="/admin/compras">Volver a compras</a>
          </div>
        </fieldset>
      </form>
    }`,
})
export class PurchaseForm {
  readonly facade = inject(PurchasesFacade);
  readonly session = inject(SessionStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly id = Number(this.route.snapshot.paramMap.get('id')) || undefined;
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
      this.add();
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
    row.controls.unidad.setValue(article ? String(article['unidad_id']) : '');
    row.controls.unidadCodigo.setValue(article ? String(article['unidad_codigo']) : '');
    row.controls.nombre.setValue(article?.nombre ?? '');
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
    if (saved) await this.router.navigate(['/admin/compras', saved.id]);
  }
  async retry() {
    const saved = await this.facade.retry();
    if (saved) await this.router.navigate(['/admin/compras', saved.id]);
  }
  async recover() {
    const saved = await this.facade.recover();
    if (saved) await this.router.navigate(['/admin/compras', saved.id]);
  }
}
