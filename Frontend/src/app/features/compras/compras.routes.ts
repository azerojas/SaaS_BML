import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/guards/auth-guards';
export const PURCHASE_ROUTES: Routes = [
  {
    path: '',
    pathMatch: 'full',
    title: 'Compras · Lasheo',
    loadComponent: () => import('./presentation/purchases-list').then((m) => m.PurchasesList),
  },
  {
    path: 'nueva',
    title: 'Nueva compra · Lasheo',
    canActivate: [permissionGuard],
    data: { permission: 'negocio.add_compras', permissions: ['negocio.view_articulos'] },
    loadComponent: () => import('./presentation/purchase-form').then((m) => m.PurchaseForm),
  },
  {
    path: ':id/editar',
    title: 'Editar borrador · Lasheo',
    canActivate: [permissionGuard],
    data: { permission: 'negocio.change_compras', permissions: ['negocio.view_articulos'] },
    loadComponent: () => import('./presentation/purchase-form').then((m) => m.PurchaseForm),
  },
  {
    path: ':id/recepcion',
    title: 'Recepción de compra · Lasheo',
    canActivate: [permissionGuard],
    data: { permission: 'negocio.change_compras', receipt: true },
    loadComponent: () => import('./presentation/purchase-detail').then((m) => m.PurchaseDetail),
  },
  {
    path: ':id',
    title: 'Detalle de compra · Lasheo',
    loadComponent: () => import('./presentation/purchase-detail').then((m) => m.PurchaseDetail),
  },
];
