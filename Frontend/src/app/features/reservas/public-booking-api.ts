import { HttpClient, HttpContext } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { switchMap } from 'rxjs';
import { LOCAL_ERROR_HANDLED, PUBLIC_REQUEST } from '../../core/http/api-interceptor';

export interface BookingConfig {
  confirmacion_automatica?: boolean;
  habilitada: boolean;
  horas_limite_cancelacion: number;
  minutos_revision: number;
  privacy_notice: { url: string; version: string };
}
export interface BookingService {
  id: number;
  nombre: string;
  duracion_minutos: number;
  precio_base: string;
}
export interface BookingProfessional {
  id: number;
  nombres: string;
  apellidos: string;
  servicios: number[];
}
export interface BookingSlots {
  cupo_minutos?: number;
  precio_total: string;
  anticipo_requerido: string;
  duracion_minutos: number;
  slots: { inicio_en: string; fin_en: string }[];
}
export interface CustomerBooking {
  id: string;
  nombres?: string;
  apellidos?: string;
  management_code?: string;
  motivo_publico?: string;
  codigo_reserva: string;
  estado: string;
  inicio_en: string;
  fin_en: string;
  precio_total: string;
  anticipo_requerido: string;
  expira_en: string | null;
  profesional: string;
  limite_cambios_en: string;
  puede_cancelar: boolean;
  puede_reprogramar: boolean;
  servicios: { servicio_id: number; servicio__nombre: string; precio_snapshot: string }[];
}
@Injectable({ providedIn: 'root' })
export class PublicBookingApi {
  private readonly http = inject(HttpClient);
  private readonly context = new HttpContext()
    .set(PUBLIC_REQUEST, true)
    .set(LOCAL_ERROR_HANDLED, true);
  private readonly root = '/api/v1/public/reservas/';
  config() {
    return this.http.get<BookingConfig>(this.root + 'configuracion/', { context: this.context });
  }
  services() {
    return this.http.get<{ results: BookingService[] }>('/api/v1/public/agenda/servicios/', {
      context: this.context,
    });
  }
  professionals() {
    return this.http.get<{ results: BookingProfessional[] }>(
      '/api/v1/public/agenda/profesionales/',
      { context: this.context },
    );
  }
  slots(professional: number, services: number[], date: string) {
    return this.http.get<BookingSlots>('/api/v1/public/agenda/disponibilidad/', {
      context: this.context,
      params: { profesional_id: professional, servicios: services.join(','), fecha: date },
    });
  }
  mySlots(id: string, date: string) {
    return this.http.get<BookingSlots>(this.root + `solicitudes/${id}/disponibilidad/`, {
      context: this.context,
      params: { fecha: date },
    });
  }
  list() {
    return this.http.get<{ results: CustomerBooking[] }>(this.root + 'solicitudes/', {
      context: this.context,
    });
  }
  recover(key: string) {
    return this.http.get<{ found: boolean; result?: CustomerBooking }>(
      this.root + `intentos/${key}/`,
      { context: this.context },
    );
  }
  write<T>(path: string, body: unknown, key?: string) {
    return this.http.get('/api/auth/csrf/', { context: this.context }).pipe(
      switchMap(() =>
        this.http.post<T>(this.root + path, body, {
          context: this.context,
          headers: key ? { 'Idempotency-Key': key } : {},
        }),
      ),
    );
  }
}
