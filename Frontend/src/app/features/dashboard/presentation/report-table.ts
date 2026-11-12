import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Report, ReportRow, TableReport, money, REPORT_LABELS } from '../domain/analytics';
interface Column {
  key: string;
  label: string;
  money?: boolean;
}
const COLUMNS: Partial<Record<Report, Column[]>> = {
  'top-services': [
    { key: 'descripcion_snapshot', label: 'Tratamiento (snapshot)' },
    { key: 'cantidad', label: 'Cantidad' },
    { key: 'ingreso', label: 'Ingreso tras descuentos', money: true },
    { key: 'costo_directo', label: 'Costo directo', money: true },
    { key: 'comisiones', label: 'Comisiones', money: true },
    { key: 'numero_ventas', label: 'Ventas' },
  ],
  'top-clients': [
    { key: 'nombre', label: 'Clienta' },
    { key: 'ventas_confirmadas', label: 'Ventas confirmadas', money: true },
    { key: 'numero_ventas', label: 'Ventas' },
    { key: 'visitas_finalizadas', label: 'Visitas finalizadas' },
  ],
  'inventory-alerts': [
    { key: 'nombre', label: 'Artículo' },
    { key: 'tipo', label: 'Tipo' },
    { key: 'existencia', label: 'Existencia actual' },
    { key: 'stock_minimo', label: 'Mínimo' },
    { key: 'unidad', label: 'Unidad' },
  ],
  expenses: [
    { key: 'categoria', label: 'Categoría' },
    { key: 'monto', label: 'Gasto registrado', money: true },
    { key: 'cantidad', label: 'Registros' },
  ],
};
@Component({
  selector: 'bm-report-table',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (report() === 'inventory-alerts') {
      <p>
        Foto actual de artículos activos con existencia menor o igual al mínimo. No representa el
        inventario histórico del período.
      </p>
    }
    @if (report() === 'top-clients') {
      <p>
        Clientas con ventas confirmadas en el rango. El ranking corresponde a ventas, no a dinero
        cobrado ni al gasto histórico completo.
      </p>
    }
    @if (data().total; as total) {
      <p>
        Total oficial del período: <strong>{{ money(total) }}</strong>
      </p>
    }
    <div class="analytics-table-scroll" tabindex="0" role="region" aria-label="Tabla del reporte">
      <table>
        <caption>
          {{
            labels[report()]
          }}
          ·
          {{
            data().count
          }}
          registros en la selección ·
          {{
            data().total_grupos
          }}
          grupos antes del límite
        </caption>
        <thead>
          <tr>
            @for (column of columns(); track column.key) {
              <th scope="col">{{ column.label }}</th>
            }
          </tr>
        </thead>
        <tbody>
          @for (row of data().results; track $index) {
            <tr>
              @for (column of columns(); track column.key) {
                <td>{{ display(row, column) }}</td>
              }
            </tr>
          } @empty {
            <tr>
              <td [attr.colspan]="columns().length">
                No hay registros para los filtros aplicados.
              </td>
            </tr>
          }
        </tbody>
      </table>
    </div>
    @if (report() === 'inventory-alerts' && data().results.length && canOpenInventory()) {
      <p><a routerLink="/admin/inventario/alertas">Abrir alertas de inventario</a></p>
    }`,
})
export class ReportTable {
  readonly data = input.required<TableReport>();
  readonly report = input.required<Report>();
  readonly canOpenInventory = input(false);
  readonly labels = REPORT_LABELS;
  readonly money = money;
  columns() {
    return COLUMNS[this.report()] ?? [];
  }
  display(row: ReportRow, column: Column) {
    const value = row[column.key];
    return column.money
      ? money(typeof value === 'string' ? value : null)
      : value === null || value === undefined
        ? 'No disponible'
        : String(value);
  }
}
