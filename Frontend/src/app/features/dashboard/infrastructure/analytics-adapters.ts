import {
  Envelope,
  Metric,
  Overview,
  Series,
  Methods,
  TableReport,
  Comparison,
} from '../domain/analytics';
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('La respuesta del reporte no tiene un formato válido.');
  return value as Record<string, unknown>;
}
export function envelope(value: unknown): Envelope {
  const data = object(value);
  const period = object(data['periodo']);
  const quality = object(data['calidad']);
  if (
    period['timezone'] !== 'America/Lima' ||
    period['moneda'] !== 'PEN' ||
    period['hasta_exclusiva'] !== true ||
    typeof data['generado_en'] !== 'string' ||
    !Number.isFinite(Date.parse(data['generado_en'])) ||
    !Array.isArray(quality['advertencias']) ||
    !quality['advertencias'].every((item) => typeof item === 'string')
  )
    throw new Error('El reporte no confirma moneda, zona horaria o calidad compatibles.');
  return data as unknown as Envelope;
}
function metric(value: unknown): value is Metric {
  return (
    value === null ||
    (typeof value === 'string' && /^-?\d+(?:\.\d+)?$/.test(value)) ||
    (typeof value === 'number' && Number.isSafeInteger(value))
  );
}
export function overviewAdapter(value: unknown): Overview {
  envelope(value);
  const data = object(value);
  const indicators = object(data['indicadores']);
  object(data['definiciones']);
  if (!Object.values(indicators).every(metric))
    throw new Error('Los indicadores recibidos no son decimales válidos.');
  const result = data as unknown as Overview;
  // Do not enable a restricted metric merely because an amount happens to be present.
  return {
    ...result,
    indicadores: {
      ...result.indicadores,
      dinero_recaudado:
        result.calidad.recaudacion_conciliada === true &&
        result.calidad.dinero_recaudado_habilitado === true
          ? (result.indicadores['dinero_recaudado'] ?? null)
          : null,
      utilidad_estimada:
        result.utilidad_estimada_habilitada === true
          ? (result.indicadores['utilidad_estimada'] ?? null)
          : null,
    },
  };
}
function rows(value: unknown) {
  envelope(value);
  const data = object(value);
  if (!Array.isArray(data['results'])) throw new Error('Faltan las filas del reporte.');
  for (const row of data['results']) object(row);
  return data;
}
export function seriesAdapter(value: unknown): Series {
  const data = rows(value);
  for (const row of data['results'] as Record<string, unknown>[])
    for (const key of ['ventas_confirmadas', 'cobros_registrados', 'anticipos_recibidos'])
      if (typeof row[key] !== 'string' || !metric(row[key]))
        throw new Error('La serie contiene importes inválidos.');
  return data as unknown as Series;
}
export function methodsAdapter(value: unknown): Methods {
  const data = rows(value);
  for (const row of data['results'] as Record<string, unknown>[])
    if (
      typeof row['metodo'] !== 'string' ||
      typeof row['cobros_registrados'] !== 'string' ||
      !metric(row['cobros_registrados']) ||
      typeof row['anticipos_recibidos'] !== 'string' ||
      !metric(row['anticipos_recibidos'])
    )
      throw new Error('Los medios de pago contienen importes inválidos.');
  return data as unknown as Methods;
}
export function tableAdapter(value: unknown): TableReport {
  const data = rows(value);
  if (!Number.isSafeInteger(data['count']) || !Number.isSafeInteger(data['total_grupos']))
    throw new Error('La paginación del reporte no es válida.');
  return data as unknown as TableReport;
}
export function comparisonAdapter(value: unknown): Comparison {
  const data = object(value);
  const actual = overviewAdapter(data['actual']);
  const anterior = overviewAdapter(data['anterior']);
  object(data['comparacion']);
  return { ...data, actual, anterior } as unknown as Comparison;
}
