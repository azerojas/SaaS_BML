export interface Visit {
  id: number;
  clienta_id: number;
  llegada_id: number | null;
  inicio_en: string;
  fin_en: string | null;
  estado: 'ABIERTA' | 'FINALIZADA' | 'CANCELADA';
  notas?: string | null;
  venta_id?: number | null;
  cita_para_cobro?: {
    id: number;
    profesional_id: number;
    profesional_nombre: string;
    inicio_en: string;
    fin_en: string;
    total: string;
    servicios: { servicio_id: number; nombre: string; precio: string; duracion_minutos: number }[];
  } | null;
  historial?: { accion: string; creada_en: string; usuario_id: number | null }[];
}
export interface VisitInput {
  clienta_id: number;
  llegada_id?: number;
  cita_id?: number;
  notas?: string;
}
