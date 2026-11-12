import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Methods, money } from '../domain/analytics';
@Component({
  selector: 'bm-payment-methods',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<p>
      Pagos y anticipos se presentan separados. Estos componentes no se suman en pantalla como caja
      neta.
    </p>
    <div class="analytics-table-scroll" tabindex="0" role="region" aria-label="Tabla del reporte">
      <table>
        <caption>
          Dinero registrado por medio de pago · PEN
        </caption>
        <thead>
          <tr>
            <th scope="col">Medio</th>
            <th scope="col">Cobros</th>
            <th scope="col">Pagos</th>
            <th scope="col">Anticipos recibidos</th>
            <th scope="col">Anticipos</th>
          </tr>
        </thead>
        <tbody>
          @for (row of data().results; track row.metodo) {
            <tr>
              <th scope="row">{{ row.metodo }}</th>
              <td>{{ money(row.cobros_registrados) }}</td>
              <td>{{ row.pagos_count }}</td>
              <td>{{ money(row.anticipos_recibidos) }}</td>
              <td>{{ row.anticipos_count }}</td>
            </tr>
          } @empty {
            <tr>
              <td colspan="5">No hay cobros ni anticipos registrados para este período.</td>
            </tr>
          }
        </tbody>
      </table>
    </div>`,
})
export class PaymentMethods {
  readonly data = input.required<Methods>();
  readonly money = money;
}
