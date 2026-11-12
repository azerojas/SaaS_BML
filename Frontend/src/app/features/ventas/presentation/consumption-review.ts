import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { CatalogPicker } from './catalog-picker';
import { SaleDetail, SalePreview, ConsumptionGroup, ConsumptionItem } from '../domain/sale';
import { CatalogRecord } from '../../catalogo/domain/catalog';
import { exactDecimal } from './form-validators';
import { pen } from '../../../shared/domain/records';
@Component({
  selector: 'bm-consumption-review',
  imports: [ReactiveFormsModule, MatButtonModule, CatalogPicker],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './consumption-review.html',
})
export class ConsumptionReview {
  readonly sale = input.required<SaleDetail>();
  readonly preview = input<SalePreview | null>(null);
  readonly disabled = input(false);
  readonly canConfirm = input(false);
  readonly canReadArticles = input(false);
  readonly proposed = output<ConsumptionGroup[]>();
  readonly confirmed = output<ConsumptionGroup[]>();
  private readonly fb = inject(FormBuilder);
  readonly invalid = signal(false);
  readonly selected = signal(0);
  readonly money = pen;
  readonly groups = this.fb.array<ReturnType<ConsumptionReview['group']>>([]);
  readonly form = this.fb.nonNullable.group({
    groups: this.groups,
    verificado: [false, Validators.requiredTrue],
  });
  constructor() {
    effect(() => {
      const sale = this.sale();
      this.groups.clear();
      this.form.controls.verificado.setValue(false);
      for (const line of sale.lineas.filter((line) => line.tipo === 'SERVICIO'))
        this.groups.push(this.group(line.id, line.descripcion_snapshot));
      this.selected.set(this.groups.at(0)?.controls.detalle.value ?? 0);
    });
  }
  private item(item: ConsumptionItem) {
    return this.fb.nonNullable.group({
      articulo: item.articulo_id,
      unidad: item.unidad_id,
      cantidad: [item.cantidad, [Validators.required, exactDecimal(3, true)]],
    });
  }
  private group(id: number, name: string) {
    return this.fb.nonNullable.group({
      detalle: id,
      nombre: name,
      revisado: [false, Validators.requiredTrue],
      insumos: this.fb.array<ReturnType<ConsumptionReview['item']>>([]),
    });
  }
  add(item: CatalogRecord) {
    if (this.disabled()) return;
    const group = this.groups.controls.find(
      (row) => row.controls.detalle.value === this.selected(),
    );
    if (!group) return;
    if (group.controls.insumos.controls.some((row) => row.controls.articulo.value === item.id))
      return;
    group.controls.insumos.push(
      this.item({ articulo_id: item.id, unidad_id: Number(item['unidad_id']), cantidad: '1.000' }),
    );
    group.controls.revisado.setValue(false);
    this.form.controls.verificado.setValue(false);
  }
  suggestions() {
    const preview = this.preview();
    if (!preview || this.disabled()) return;
    for (const group of this.groups.controls) {
      group.controls.insumos.clear();
      for (const row of preview.receta_sugerida.find(
        (row) => row.detalle_id === group.controls.detalle.value,
      )?.insumos ?? [])
        group.controls.insumos.push(this.item(row));
      group.controls.revisado.setValue(false);
    }
    this.form.controls.verificado.setValue(false);
  }
  payload() {
    return this.groups.getRawValue().map((group) => ({
      detalle_id: group.detalle,
      insumos: group.insumos.map((row) => ({
        articulo_id: row.articulo,
        unidad_id: row.unidad,
        cantidad: row.cantidad,
      })),
    }));
  }
  submit(confirm: boolean) {
    if (this.disabled()) return;
    const quantitiesValid = this.groups.controls.every((group) => group.controls.insumos.valid);
    this.invalid.set(!quantitiesValid || (confirm && this.form.invalid));
    if (this.invalid()) return;
    if (confirm) this.confirmed.emit(this.payload());
    else this.proposed.emit(this.payload());
  }
}
