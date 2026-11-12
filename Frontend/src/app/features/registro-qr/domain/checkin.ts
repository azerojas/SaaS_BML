import { Visit } from '../../visitas/domain/visit';
export interface CheckinConfig {
  establecimiento: string;
  requiere_confirmacion_presencial: true;
  consentimiento_preseleccionado: false;
  aviso_privacidad: { url: string; version: string; solo_pruebas: boolean };
}
export interface CheckinInput {
  telefono: string;
  nombres?: string;
  apellidos?: string;
  consentimiento_datos?: boolean;
  version_aviso?: string;
}
export type CheckinState =
  'idle' | 'submitting' | 'received' | 'error' | 'rate_limited' | 'expired';
export interface QrPoint {
  id: number;
  nombre: string;
  activo: boolean;
  creado_en: string;
}
export interface Arrival {
  id: number;
  clienta_id: number;
  nombres: string;
  apellidos: string;
  telefono: string;
  clienta_activa: boolean;
  punto_nombre: string | null;
  origen: string;
  estado: 'PENDIENTE' | 'CONFIRMADA' | 'RECHAZADA' | 'CANCELADA';
  solicitada_en: string;
  confirmada_en: string | null;
  alta_provisional: boolean;
  vencida: boolean;
}
export interface ArrivalDetail extends Arrival {
  visita: Visit | null;
  citas_sugeridas: { id: number; inicio_en: string; fin_en: string; estado: string }[];
  ultima_resolucion: { accion: string; creada_en: string } | null;
}
