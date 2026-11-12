import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Envelope, localDateTime } from '../domain/analytics';
const MESSAGES: Readonly<Record<string, string>> = {
  ESTADOS_ACTUALES_NO_RECONSTRUYEN_CIERRES_HISTORICOS:
    'Los estados actuales no reconstruyen por sí solos el cierre histórico.',
  UTILIDAD_OPERATIVA_ESTIMADA_NO_FISCAL:
    'La utilidad es una estimación operativa de los registros disponibles; no es utilidad fiscal certificada.',
  FALTAN_CONCILIACIONES_CON_EVIDENCIA:
    'Caja neta no disponible: faltan cierres diarios por medio de pago con evidencia.',
  CONCILIACION_OBSOLETA_POR_CAMBIOS:
    'Caja neta no disponible: los registros cambiaron después de su conciliación.',
  CAJA_NO_ATRIBUIBLE_A_COHORTE: 'No se puede atribuir la caja neta a esta selección de ventas.',
  RECAUDACION_NETA_BLOQUEADA_SIN_LEDGER_REEMBOLSOS:
    'Caja neta no disponible: falta un registro conciliable de devoluciones.',
  TOTALES_NO_CONCILIAN:
    'Hay totales que no concilian; los importes derivados afectados no están disponibles.',
  COSTO_NO_VERIFICABLE:
    'Hay costos históricos que no se pueden verificar. No se consideran gratuitos.',
  ANTICIPO_LEGACY_SIN_ASIGNACION_VERIFICABLE:
    'El saldo no es verificable por una asignación antigua de anticipo.',
  APLICACION_ANTICIPO_NO_CONCILIA:
    'Una aplicación de anticipo requiere conciliación administrativa.',
  COBERTURA_SUPERA_VENTA: 'La cobertura de una venta no concilia con su total ajustado.',
  INVENTARIO_ACTUAL_NO_HISTORICO:
    'El inventario muestra las existencias actuales, no las del cierre del período.',
  SIN_TRAZABILIDAD_EXISTENCIA_POR_LOTE: 'Estas existencias no representan saldos por lote.',
  STOCK_NEGATIVO_REQUIERE_CONCILIACION:
    'Existe stock negativo heredado que requiere revisión; este reporte no lo corrige.',
  GASTOS_NO_ASIGNADOS_A_COHORTE:
    'No se asignan gastos generales a una cohorte. La utilidad de esa selección no está disponible.',
  FUENTES_CONFIRMADAS_SIN_FECHA_NO_ASIGNABLES:
    'Hay fuentes confirmadas sin fecha que no pueden asignarse al período.',
  ANTICIPOS_CITA_TERMINAL_EXCLUIDOS_SIN_INFERIR_REEMBOLSO:
    'Se excluyen anticipos de citas terminales; esto no demuestra que el dinero haya sido devuelto.',
};
@Component({
  selector: 'bm-report-quality',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (data(); as report) {
    <div class="report-meta">
      <p>
        Período del servidor: {{ report.periodo.desde }} ≤ fecha &lt; {{ report.periodo.hasta }} ·
        {{ report.periodo.timezone }} · {{ report.periodo.moneda }}
      </p>
      <p>Consulta generada: {{ date(report.generado_en) }} (Lima)</p>
      @if (report.calidad.advertencias.length) {
        <details class="quality-notice">
          <summary>Avisos de calidad y alcance ({{ report.calidad.advertencias.length }})</summary>
          <ul>
            @for (warning of report.calidad.advertencias; track warning) {
              <li>{{ message(warning) }}</li>
            }
          </ul>
        </details>
      }
    </div>
  }`,
})
export class ReportQuality {
  readonly data = input<Envelope | null>(null);
  readonly date = localDateTime;
  message(code: string) {
    return (
      MESSAGES[code] ??
      'Hay registros que requieren revisión administrativa. Los indicadores afectados pueden no estar disponibles.'
    );
  }
}
