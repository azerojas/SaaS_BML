import { Overview, Series, Envelope } from '../domain/analytics';
export const envelopeFixture: Envelope = {
  periodo: {
    desde: '2026-10-01',
    hasta: '2026-11-01',
    hasta_exclusiva: true,
    timezone: 'America/Lima',
    moneda: 'PEN',
    granularidad: 'day',
    alcance_ventas: 'ESTABLECIMIENTO',
  },
  generado_en: '2026-11-11T12:00:00-05:00',
  calidad: {
    recaudacion_conciliada: false,
    dinero_recaudado_habilitado: false,
    advertencias: ['FALTAN_CONCILIACIONES_CON_EVIDENCIA'],
  },
};
export function overviewFixture(): Overview {
  return {
    ...envelopeFixture,
    indicadores: {
      ventas_confirmadas: '95.00',
      cobros_registrados: '20.00',
      anticipos_recibidos: '0.00',
      dinero_recaudado: null,
      costo_directo: '5.00',
      comisiones: '7.20',
      gastos_operativos: '7.00',
      utilidad_estimada: '68.80',
      saldo_pendiente: '46.00',
      propinas: '5.00',
      numero_ventas: 1,
      visitas_finalizadas: 1,
      clientas_unicas_atendidas: 1,
      ticket_promedio: '95.00',
    },
    definiciones: { ventas_confirmadas: 'Ventas por confirmación; incluye propina.' },
    alcance_saldo: 'COHORTE_VENTAS_CONFIRMADAS_EN_RANGO_CON_COBERTURA_ACTUAL',
    utilidad_estimada_habilitada: true,
  };
}
export function seriesFixture(): Series {
  return {
    ...envelopeFixture,
    anticipo_aplicado_es_nuevo_cobro: false,
    results: [
      {
        inicio_periodo: '2026-10-15',
        desde: '2026-10-15',
        hasta: '2026-10-16',
        etiqueta: '2026-10-15',
        ventas_confirmadas: '95.00',
        cobros_registrados: '20.00',
        anticipos_recibidos: '0.00',
      },
    ],
  };
}
