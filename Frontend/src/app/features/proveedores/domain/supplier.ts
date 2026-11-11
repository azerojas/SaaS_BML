import { Field } from '../../../shared/domain/records';
export interface Supplier {
  id: number;
  nombre: string;
  ruc: string | null;
  telefono: string | null;
  email: string | null;
  activo: boolean;
}
export const SUPPLIER_FIELDS: readonly Field[] = [
  { key: 'nombre', label: 'Nombre del proveedor', required: true, max: 160 },
  {
    key: 'ruc',
    label: 'RUC o identificador',
    max: 20,
    hint: 'Identificador de referencia. No se verifica su validez tributaria.',
  },
  { key: 'telefono', label: 'Teléfono del proveedor', max: 40 },
  { key: 'email', label: 'Correo del proveedor', type: 'email', max: 150 },
];
