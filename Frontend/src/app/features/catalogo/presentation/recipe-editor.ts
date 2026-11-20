import { UnsavedForm } from '../../../core/forms/unsaved-form';
import { ChangeDetectionStrategy, Component, inject, input, OnInit, signal } from '@angular/core';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { SessionStore } from '../../../core/auth/application/session-store';
import { MaterialsFacade } from '../application/materials-facade';
import { ReferencePicker } from './reference-picker';
import { decimalValid } from '../../../shared/domain/records';
import { Alert } from '../../../shared/ui/alert';
import { Loading } from '../../../shared/ui/loading';
import { Button } from '../../../shared/ui/button';
@Component({
  selector: 'bm-recipe-editor',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    ReferencePicker,
    Alert,
    Loading,
    Button,
    UnsavedForm,
  ],
  providers: [MaterialsFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<section class="surface section-gap">
    <h2>Receta de materiales</h2>
    <p class="muted">
      Cantidades estimadas por tratamiento. Guardar esta receta no descuenta stock. El costo
      estimado no está disponible en este contrato.
    </p>
    @if (facade.error(); as error) {
      <bm-alert [message]="error" />
    }
    @if (localError(); as error) {
      <bm-alert [message]="error" />
    }
    @if (facade.success(); as success) {
      <bm-alert kind="info" [message]="success" />
    }
    @if (facade.loading()) {
      <bm-loading />
    } @else if (facade.record()) {
      @if (canEdit()) {
        <form bmUnsavedForm [formGroup]="form" (ngSubmit)="save()">
          <div class="recipe-list">
            @for (row of rows.controls; track row; let index = $index) {
              <div class="recipe-row">
                <bm-reference-picker
                  [id]="'material-' + index"
                  label="Insumo o artículo de uso mixto"
                  kind="articulos"
                  [materialsOnly]="true"
                  [required]="true"
                  [value]="row.controls.articulo.value"
                  [currentLabel]="labels()[row.controls.articulo.value] || ''"
                  (changed)="row.controls.articulo.setValue($event)"
                />
                <div>
                  <label [for]="'quantity-' + index">Cantidad estimada *</label
                  ><input
                    [id]="'quantity-' + index"
                    inputmode="decimal"
                    [formControl]="row.controls.cantidad"
                  /><small>Hasta 3 decimales. La unidad es la del artículo seleccionado.</small
                  ><button
                    mat-button
                    type="button"
                    [disabled]="facade.busy()"
                    (click)="rows.removeAt(index)"
                  >
                    Retirar material
                  </button>
                </div>
              </div>
            }
          </div>
          <div class="form-actions">
            <button
              mat-stroked-button
              type="button"
              [disabled]="rows.length >= 200 || facade.busy()"
              (click)="add()"
            >
              Añadir material</button
            ><bm-button type="submit" [busy]="facade.busy()">Guardar receta</bm-button>
          </div>
        </form>
      } @else {
        <ul>
          @for (row of facade.record()?.insumos; track row.articulo_id) {
            <li>
              {{ row.nombre }} · {{ row.cantidad_estimada }} {{ row.unidad
              }}{{ row.activo ? '' : ' · Inactivo' }}
            </li>
          } @empty {
            <li>Sin materiales estimados.</li>
          }
        </ul>
      }
    }
  </section>`,
})
export class RecipeEditor implements OnInit {
  readonly facade = inject(MaterialsFacade);
  readonly session = inject(SessionStore);
  readonly serviceId = input.required<number>();
  readonly localError = signal<string | null>(null);
  readonly labels = signal<Record<string, string>>({});
  readonly rows = new FormArray<
    FormGroup<{ articulo: FormControl<string>; cantidad: FormControl<string> }>
  >([]);
  readonly form = new FormGroup({ rows: this.rows });
  async ngOnInit() {
    await this.facade.get(this.serviceId());
    for (const row of this.facade.record()?.insumos ?? []) {
      this.labels.update((labels) => ({
        ...labels,
        [row.articulo_id]: row.nombre + ' · ' + row.unidad,
      }));
      this.add(String(row.articulo_id), row.cantidad_estimada);
    }
  }
  canEdit() {
    return (
      this.session.hasPermission('negocio.change_servicios') &&
      this.session.hasPermission('negocio.view_articulos')
    );
  }
  add(articulo = '', cantidad = '') {
    this.rows.push(
      new FormGroup({
        articulo: new FormControl(articulo, {
          nonNullable: true,
          validators: [Validators.required],
        }),
        cantidad: new FormControl(cantidad, {
          nonNullable: true,
          validators: [
            (control) => (decimalValid(control.value, 3, 11, true) ? null : { decimal: true }),
          ],
        }),
      }),
    );
  }
  async save() {
    this.localError.set(null);
    if (this.rows.invalid) {
      this.rows.markAllAsTouched();
      this.localError.set(
        'Selecciona cada material y una cantidad mayor que cero, con hasta 3 decimales.',
      );
      return;
    }
    const values = this.rows.getRawValue();
    if (new Set(values.map((row) => row.articulo)).size !== values.length) {
      this.localError.set('No repitas el mismo artículo en la receta.');
      return;
    }
    await this.facade.save(
      this.serviceId(),
      values.map((row) => ({ articulo_id: Number(row.articulo), cantidad_estimada: row.cantidad })),
    );
  }
}
