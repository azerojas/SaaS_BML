import { ValidationSummary } from '../../../shared/ui/validation-summary';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { InventoryFacade } from '../application/inventory-facade';
import { ADJUSTMENT_FIELDS, Adjustment } from '../domain/inventory';
import { decimalValid } from '../../../shared/domain/records';
import { CatalogRecord } from '../../catalogo/domain/catalog';
import { ReferencePicker } from '../../catalogo/presentation/reference-picker';
import { EditorFields, buildFields } from '../../../shared/ui/editor-fields';
import { OperationsNav } from '../../../shared/ui/operations-nav';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog';
import { Alert } from '../../../shared/ui/alert';
import { Loading } from '../../../shared/ui/loading';
import { Button } from '../../../shared/ui/button';
@Component({
  selector: 'bm-stock-adjustment',
  imports: [
    ValidationSummary,
    RouterLink,
    ReactiveFormsModule,
    MatButtonModule,
    ReferencePicker,
    EditorFields,
    OperationsNav,
    Alert,
    Loading,
    Button,
  ],
  providers: [InventoryFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<bm-operations-nav /><a class="back-link" routerLink="/admin/inventario"
      >← Inventario</a
    >
    <header class="feature-heading">
      <div>
        <p class="eyebrow">UN REGISTRO CLARO DE CADA CORRECCIÓN</p>
        <h1>Ajuste de existencias</h1>
        <p>Entrada o salida justificada. No se puede sobrescribir un movimiento anterior.</p>
      </div>
    </header>
    @if (intent.error(); as error) {
      <bm-alert [message]="error" />
    }
    <bm-validation-summary [errors]="intent.fields()" />
    @if (localError(); as error) {
      <bm-alert [message]="error" />
    }
    @if (intent.needsRecovery()) {
      <section class="surface">
        <h2>Comprobar ajuste anterior</h2>
        <p>Consultar el resultado evita registrar otra salida o entrada por accidente.</p>
        <bm-button [busy]="intent.busy()" (click)="facade.recover()"
          >Consultar ajuste anterior</bm-button
        >
      </section>
    }
    @if (intent.uncertain()) {
      <bm-alert
        message="El resultado del ajuste no se confirmó. Conservamos su clave y contenido para reintentarlo sin duplicar movimientos."
      /><bm-button [busy]="intent.busy()" (click)="facade.retry()"
        >Reintentar el mismo ajuste</bm-button
      >
    }
    @if (intent.result(); as result) {
      <section class="surface">
        <h2>Ajuste confirmado</h2>
        <p>
          Movimiento #{{ result.movimiento_id }} · {{ result.motivo }} ·
          {{ result.cantidad_firmada }}
        </p>
        <p>Saldo al registrar esta operación: {{ result.saldo_resultante }}</p>
        <p class="muted">
          Ajuste no valorizado: no equivale a una compra ni establece un costo contable.
        </p>
        <button mat-stroked-button type="button" (click)="another()">Registrar otro ajuste</button>
      </section>
    }
    @if (facade.error(); as error) {
      <bm-alert [message]="error" />
    }
    @if (facade.loading()) {
      <bm-loading />
    }
    @if (facade.record(); as article) {
      <section class="surface section-gap">
        <h2>{{ article.nombre }}</h2>
        <p>
          Existencia actual consultada:
          <strong>{{ article.existencia }} {{ article.unidad }}</strong> · Unidad vigente
          {{ article.unidad }}
        </p>
        <a [routerLink]="['/admin/inventario/articulos', article.articulo_id]"
          >Ver ficha y movimientos</a
        >
      </section>
    }
    @if (!intent.result()) {
      <form [formGroup]="form" (ngSubmit)="confirm()">
        <fieldset
          class="surface section-gap inventory-fieldset"
          [disabled]="intent.busy() || confirming() || intent.uncertain() || intent.needsRecovery()"
        >
          <legend>Datos del ajuste</legend>
          <bm-reference-picker
            id="adjustment-article"
            label="Artículo del ajuste"
            kind="articulos"
            [activeOnly]="true"
            [required]="true"
            [value]="String(form.controls['articulo_id'].value)"
            [currentLabel]="facade.record()?.nombre ?? ''"
            (changed)="form.controls['articulo_id'].setValue($event)"
            (selected)="choose($event)"
          /><bm-editor-fields
            prefix="adjustment-"
            [fields]="fields"
            [form]="form"
            [errors]="intent.fields()"
          />
          <div class="form-actions">
            <bm-button type="submit" [busy]="intent.busy()">Revisar ajuste</bm-button
            ><a mat-button routerLink="/admin/inventario">Volver</a>
          </div>
        </fieldset>
      </form>
    } `,
})
export class StockAdjustment {
  readonly facade = inject(InventoryFacade);
  readonly intent = this.facade.adjustment;
  private readonly route = inject(ActivatedRoute);
  private readonly dialog = inject(MatDialog);
  readonly confirming = signal(false);
  readonly localError = signal<string | null>(null);
  readonly fields = ADJUSTMENT_FIELDS;
  readonly form = buildFields(
    [
      ...this.fields,
      { key: 'articulo_id', label: 'Artículo', required: true },
      { key: 'unidad_id', label: 'Unidad', required: true },
    ],
    { tipo: 'AJUSTE_ENTRADA', cantidad: '1.000' },
  );
  readonly String = String;
  constructor() {
    this.form.controls['cantidad'].addValidators((control) =>
      decimalValid(control.value, 3, 11, true) ? null : { positive: true },
    );
    this.form.controls['justificacion'].addValidators((control) =>
      String(control.value).trim().length >= 8 ? null : { short: true },
    );
    void this.init();
  }
  private async init() {
    if (this.intent.needsRecovery()) await this.facade.recover();
    if (this.intent.result()) return;
    const id = this.route.snapshot.queryParamMap.get('articulo');
    if (id && /^[1-9]\d*$/.test(id)) {
      await this.facade.article(Number(id));
      const row = this.facade.record();
      if (row)
        this.form.patchValue({
          articulo_id: String(row.articulo_id),
          unidad_id: String(row.unidad_id),
        });
    }
  }
  choose(article: CatalogRecord | null) {
    this.form.controls['unidad_id'].setValue(article ? String(article['unidad_id']) : '');
    if (article) void this.facade.article(article.id);
    else this.facade.record.set(null);
  }
  async confirm() {
    if (this.confirming() || this.intent.busy()) return;
    this.localError.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.localError.set(
        'Selecciona un artículo, cantidad positiva y una justificación de al menos 8 caracteres.',
      );
      return;
    }
    const raw = this.form.getRawValue();
    const payload: Adjustment = {
      articulo_id: Number(raw['articulo_id']),
      unidad_id: Number(raw['unidad_id']),
      tipo: raw['tipo'] as Adjustment['tipo'],
      cantidad: String(raw['cantidad']),
      justificacion: String(raw['justificacion']).trim(),
    };
    this.confirming.set(true);
    try {
      const accepted = await firstValueFrom(
        this.dialog
          .open(ConfirmDialog, {
            data: {
              title: '¿Registrar este ajuste?',
              description:
                'Se agregará una ' +
                (payload.tipo === 'AJUSTE_ENTRADA' ? 'entrada' : 'salida') +
                ' de ' +
                payload.cantidad +
                ' ' +
                (this.facade.record()?.unidad ?? 'unidades') +
                '. Django verificará la existencia antes de confirmar.',
              confirm: 'Confirmar ajuste',
            },
          })
          .afterClosed(),
      );
      if (accepted) await this.facade.adjust(payload);
    } finally {
      this.confirming.set(false);
    }
  }
  another() {
    this.intent.reset();
    this.localError.set(null);
  }
}
