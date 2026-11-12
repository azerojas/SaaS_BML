import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Comparison, money } from '../domain/analytics';
@Component({
  selector: 'bm-month-comparison',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<p>
      {{
        data().parcial_mismo_dia
          ? 'Mes actual hasta hoy frente a los mismos días del mes anterior, limitado a su duración.'
          : 'Comparación entre meses calendario completos.'
      }}
      Las diferencias y porcentajes proceden del servidor.
    </p>
    <div class="analytics-table-scroll" tabindex="0" role="region" aria-label="Tabla del reporte">
      <table>
        <caption>
          Comparación mensual ·
          {{
            data().month
          }}
          · PEN
        </caption>
        <thead>
          <tr>
            <th scope="col">Indicador</th>
            <th scope="col">Actual</th>
            <th scope="col">Anterior</th>
            <th scope="col">Variación</th>
          </tr>
        </thead>
        <tbody>
          @for (key of keys; track key.key) {
            <tr>
              <th scope="row">{{ key.label }}</th>
              <td>{{ money(data().actual.indicadores[key.key]) }}</td>
              <td>{{ money(data().anterior.indicadores[key.key]) }}</td>
              <td>{{ percent(data().comparacion[key.key]?.variacion_porcentaje) }}</td>
            </tr>
          }
        </tbody>
      </table>
    </div>`,
})
export class MonthComparison {
  readonly data = input.required<Comparison>();
  readonly money = money;
  readonly keys = [
    { key: 'ventas_confirmadas', label: 'Ventas confirmadas' },
    { key: 'cobros_registrados', label: 'Cobros registrados' },
    { key: 'anticipos_recibidos', label: 'Anticipos recibidos' },
    { key: 'utilidad_estimada', label: 'Utilidad operativa estimada' },
  ];
  percent(value: string | null | undefined) {
    return value === null || value === undefined
      ? 'No calculable (base cero o dato no disponible)'
      : value + ' %';
  }
}
