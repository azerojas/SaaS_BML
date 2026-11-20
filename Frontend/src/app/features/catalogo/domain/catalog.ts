import { Field } from '../../../shared/domain/records';
export type Kind =
  'categorias-servicio' | 'categorias-articulo' | 'unidades' | 'servicios' | 'articulos';
export interface CatalogRecord {
  id: number;
  nombre: string;
  [key: string]: string | number | boolean | number[] | null;
}
export interface CatalogImage {
  id: number;
  servicio_id: number | null;
  articulo_id: number | null;
  url: string;
  texto_alt: string | null;
  orden: number;
  es_principal: boolean;
}
export interface Material {
  articulo_id: number;
  nombre: string;
  unidad: string;
  activo: boolean;
  cantidad_estimada: string;
}
export interface Recipe {
  servicio_id: number;
  insumos: Material[];
  costo_estimado: string | null;
  moneda: 'PEN';
}
export interface Stock {
  articulo_id: number;
  existencia: string;
  unidad: string;
  stock_minimo: string;
  bajo_minimo: boolean;
}
export interface Definition {
  kind: Kind;
  title: string;
  singular: string;
  model: string;
  active: boolean;
  fields: readonly Field[];
}
const name = (max: number): Field => ({ key: 'nombre', label: 'Nombre', required: true, max });
const order: Field = {
  key: 'orden',
  label: 'Orden de presentación',
  type: 'text',
  hint: 'Entero no negativo.',
};
const description: Field = {
  key: 'descripcion',
  label: 'Descripción',
  type: 'textarea',
  min: 10,
  max: 2000,
};
const visible: Field = {
  key: 'visible_catalogo',
  label: 'Visible en catálogo público',
  type: 'checkbox',
};
export const DEFINITIONS: Readonly<Record<Kind, Definition>> = {
  'categorias-servicio': {
    kind: 'categorias-servicio',
    title: 'Categorías de tratamientos',
    singular: 'categoría de tratamiento',
    model: 'categoriasservicio',
    active: true,
    fields: [name(100), order, { key: 'activa', label: 'Activa', type: 'checkbox' }],
  },
  'categorias-articulo': {
    kind: 'categorias-articulo',
    title: 'Categorías de artículos',
    singular: 'categoría de artículo',
    model: 'categoriasarticulo',
    active: false,
    fields: [name(100)],
  },
  unidades: {
    kind: 'unidades',
    title: 'Unidades de medida',
    singular: 'unidad de medida',
    model: 'unidadesmedida',
    active: false,
    fields: [
      {
        key: 'codigo',
        label: 'Código',
        required: true,
        max: 15,
        hint: 'Letras ASCII, números, punto, guion o guion bajo.',
      },
      name(60),
    ],
  },
  servicios: {
    kind: 'servicios',
    title: 'Tratamientos',
    singular: 'tratamiento',
    model: 'servicios',
    active: true,
    fields: [
      name(150),
      {
        key: 'slug',
        label: 'Enlace público',
        max: 160,
        hint: 'Opcional al crear: Django lo genera. Después permanece estable.',
      },
      description,
      {
        key: 'duracion_minutos',
        label: 'Duración en minutos',
        hint: 'Obligatoria al marcar reservable online.',
      },
      {
        key: 'precio_base',
        label: 'Precio base (S/)',
        required: true,
        type: 'decimal',
        scale: 2,
        hint: 'Hasta 2 decimales, con punto.',
      },
      order,
      { key: 'activo', label: 'Activo', type: 'checkbox' },
      visible,
      {
        key: 'reservable_online',
        label: 'Reservable online (atributo del catálogo)',
        type: 'checkbox',
      },
      {
        key: 'requiere_anticipo',
        label: 'Requiere anticipo (atributo del catálogo)',
        type: 'checkbox',
      },
    ],
  },
  articulos: {
    kind: 'articulos',
    title: 'Productos e insumos',
    singular: 'artículo',
    model: 'articulos',
    active: true,
    fields: [
      name(160),
      {
        key: 'slug',
        label: 'Enlace público',
        max: 180,
        hint: 'Opcional al crear, estable después.',
      },
      description,
      { key: 'sku', label: 'SKU', max: 45 },
      {
        key: 'tipo',
        label: 'Tipo de artículo',
        type: 'select',
        required: true,
        options: [
          { value: 'INSUMO', label: 'Insumo' },
          { value: 'VENTA', label: 'Producto de venta' },
          { value: 'AMBOS', label: 'Producto e insumo' },
        ],
      },
      { key: 'precio_venta', label: 'Precio de venta (S/)', type: 'decimal', scale: 2 },
      {
        key: 'stock_minimo',
        label: 'Stock mínimo',
        type: 'decimal',
        scale: 3,
        hint: 'Umbral de alerta, no modifica la existencia.',
      },
      order,
      { key: 'activo', label: 'Activo', type: 'checkbox' },
      visible,
    ],
  },
};
export function catalogPayload(
  kind: Kind,
  raw: Readonly<Record<string, string | boolean>>,
  editing: boolean,
): Record<string, unknown> {
  const data: Record<string, unknown> = { ...raw };
  for (const key of ['nombre', 'sku', 'codigo', 'slug'])
    if (typeof data[key] === 'string') data[key] = String(data[key]).trim();
  for (const key of ['categoria_id', 'unidad_id', 'duracion_minutos', 'orden'])
    if (key in data) data[key] = data[key] === '' ? null : Number(data[key]);
  if (data['orden'] === null) data['orden'] = 0;
  if (data['sku'] === '') data['sku'] = null;
  if (!data['slug'] || editing) delete data['slug'];
  if (kind === 'articulos' && data['tipo'] === 'INSUMO') data['visible_catalogo'] = false;
  if (data['activo'] === false) data['visible_catalogo'] = false;
  return data;
}
