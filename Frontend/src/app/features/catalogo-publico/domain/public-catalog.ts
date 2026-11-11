export type PublicKind = 'servicios' | 'productos';
export interface PublicItem {
  id: number;
  slug: string;
  nombre: string;
  descripcion: string | null;
  categoria: string | null;
  imagen_principal: string | null;
  precio_base?: string;
  precio_venta?: string;
  duracion_minutos?: number | null;
  disponible?: boolean;
  moneda: 'PEN';
}
export interface PublicCategory {
  id: number;
  nombre: string;
  tipo: 'servicio' | 'producto';
  orden: number;
}
