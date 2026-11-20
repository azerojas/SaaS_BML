import { addDays, validDate } from '../../dashboard/domain/periods';
export type CalendarView = 'day' | 'week' | 'month';
export const APPOINTMENT_STATES = [
  'PENDIENTE_PAGO',
  'PROGRAMADA',
  'CONFIRMADA',
  'COMPLETADA',
  'CANCELADA',
  'NO_ASISTIO',
  'EXPIRADA',
] as const;
export interface Professional {
  publicacion_propia?: boolean;
  servicios?: number[];
  id: number;
  nombres: string;
  apellidos: string;
  activa: boolean;
  telefono: string | null;
  usuario_id: number | null;
  visible_reservas: boolean;
  comision_porcentaje?: string;
}
export interface Schedule {
  id: number;
  profesional_id: number;
  dia_semana: number;
  hora_inicio: string;
  hora_fin: string;
}
export interface DayInterval {
  inicio: string;
  fin: string;
  cupo_unico?: boolean;
  ocupado?: boolean;
}
export interface DailySchedule {
  id: number;
  profesional_id: number | null;
  fecha: string;
  franjas: DayInterval[];
  cerrado: boolean;
  origen: 'FECHA';
}
export interface Block {
  id: number;
  profesional_id: number | null;
  inicio_en: string;
  fin_en: string;
  motivo: string;
}
export interface Appointment {
  clienta_nombre?: string;
  servicios_nombres?: string[];
  id: number;
  clienta_id: number;
  profesional_id: number;
  visita_id: number | null;
  estado: string;
  inicio_en: string;
  fin_en: string;
  duracion_total_minutos: number;
  precio_total: string;
  anticipo_requerido: string;
  expira_en: string | null;
  notas: string | null;
  origen: string;
}
export interface AppointmentDetail extends Appointment {
  servicios: {
    id: number;
    servicio_id: number;
    orden: number;
    duracion_minutos: number;
    precio_snapshot: string;
  }[];
  historial: {
    id: number;
    estado_anterior: string;
    estado_nuevo: string;
    cambiado_en: string;
    detalle: string | null;
  }[];
  anticipo_confirmado: string;
  anticipo_pendiente: string;
}
export interface Slot {
  inicio_en: string;
  fin_en: string;
}
export interface Availability {
  timezone: string;
  fecha_local: string;
  profesional_id: number;
  servicios: number[];
  duracion_minutos: number;
  precio_total: string;
  anticipo_requerido: string;
  slots: Slot[];
  disponibilidad_es_propuesta: true;
}
export interface WaitEntry {
  id: number;
  clienta_id: number;
  servicio_id: number;
  profesional_id: number | null;
  fecha_deseada: string;
  franja_inicio: string | null;
  franja_fin: string | null;
  estado: string;
  cita_id?: number | null;
}
export interface Advance {
  id: number;
  cita_id: number;
  monto: string;
  estado: string;
  metodo: string;
  referencia: string | null;
  pagado_en: string | null;
}
export interface MutationResult {
  cita_id?: number;
  profesional_id?: number;
  espera_id?: number;
  visita_id?: number;
  anticipo_id?: number;
  estado?: string;
}
export type WriteMethod = 'POST' | 'PATCH' | 'PUT' | 'DELETE';
export function intentOperation(path: string, method: WriteMethod): string {
  const pieces = path.split('/').filter(Boolean);
  if (path.startsWith('/api/anticipos/'))
    return 'anticipo.' + (pieces.length === 2 ? 'crear' : pieces[3]);
  if (!path.startsWith('/api/v1/agenda/')) throw new Error('Operación de agenda no reconocida.');
  const resource = pieces[3],
    action = pieces[5];
  if (resource === 'disponibilidad-diaria')
    return 'agenda.jornada.' + (pieces[4] === 'restablecer' ? 'restablecer' : 'guardar');
  if (resource === 'calendario') return 'agenda.configurar';
  const names: Record<string, string> = {
    profesionales: 'profesional',
    horarios: 'horario',
    bloqueos: 'bloqueo',
    citas: 'cita',
    'lista-espera': 'espera',
  };
  if (!names[resource]) throw new Error('Operación no reconocida.');
  const verb =
    resource === 'citas' && pieces[4] === 'expirar'
      ? 'expirar'
      : action === 'vincular-llegada'
        ? 'llegada'
        : (action ?? (method === 'DELETE' ? 'retirar' : method === 'PATCH' ? 'editar' : 'crear'));
  return 'agenda.' + names[resource] + '.' + verb;
}
export function calendarDays(date: string, view: CalendarView): string[] {
  if (!validDate(date)) throw new Error('Selecciona una fecha válida.');
  let start = date,
    count = 1;
  if (view === 'week') {
    start = addDays(date, -((new Date(date + 'T12:00:00Z').getUTCDay() + 6) % 7));
    count = 7;
  }
  if (view === 'month') {
    const first = date.slice(0, 7) + '-01';
    start = addDays(first, -((new Date(first + 'T12:00:00Z').getUTCDay() + 6) % 7));
    count = 42;
  }
  return Array.from({ length: count }, (_, index) => addDays(start, index));
}
export function limaDate(instant: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(instant));
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export function intersectsDay(row: { inicio_en: string; fin_en: string }, day: string): boolean {
  return (
    Date.parse(row.inicio_en) < Date.parse(addDays(day, 1) + 'T00:00:00-05:00') &&
    Date.parse(row.fin_en) > Date.parse(day + 'T00:00:00-05:00')
  );
}
/** Lima has fixed UTC-05. Never interpret a business datetime in the browser timezone. */
export function limaInput(value: string): string {
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) ||
    !validDate(value.slice(0, 10)) ||
    Number(value.slice(11, 13)) > 23 ||
    Number(value.slice(14, 16)) > 59
  )
    throw new Error('Fecha y hora de Lima inválidas.');
  return value + ':00-05:00';
}
