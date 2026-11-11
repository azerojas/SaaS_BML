import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/guards/auth-guards';
export const SUPPLIER_ROUTES: Routes = [
  {
    path: '',
    pathMatch: 'full',
    title: 'Proveedores · Lasheo',
    loadComponent: () => import('./presentation/suppliers-list').then((m) => m.SuppliersList),
  },
  {
    path: 'nuevo',
    title: 'Nuevo proveedor · Lasheo',
    canActivate: [permissionGuard],
    data: { permission: 'negocio.add_proveedores' },
    loadComponent: () => import('./presentation/supplier-form').then((m) => m.SupplierForm),
  },
  {
    path: ':id',
    title: 'Ficha de proveedor · Lasheo',
    loadComponent: () => import('./presentation/supplier-form').then((m) => m.SupplierForm),
  },
];
