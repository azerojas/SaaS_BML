export interface Visit {
  id: number;
  clienta_id: number;
  llegada_id: number | null;
  inicio_en: string;
  fin_en: string | null;
  estado: 'ABIERTA' | 'FINALIZADA' | 'CANCELADA';
  notas?: string | null;
  venta_id?: number | null;
  historial?: { accion: string; creada_en: string; usuario_id: number | null }[];
}
export interface VisitInput {
  clienta_id: number;
  llegada_id?: number;
  cita_id?: number;
  notas?: string;
}
