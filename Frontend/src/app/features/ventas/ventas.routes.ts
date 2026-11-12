import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/guards/auth-guards';
export const SALE_ROUTES: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./presentation/sales-list').then((m) => m.SalesList),
  },
  {
    path: 'nueva',
    canActivate: [permissionGuard],
    data: { permission: 'finanzas.manage_sales' },
    loadComponent: () => import('./presentation/sale-editor').then((m) => m.SaleEditor),
  },
  {
    path: ':id/editar',
    canActivate: [permissionGuard],
    data: { permission: 'finanzas.manage_sales' },
    loadComponent: () => import('./presentation/sale-editor').then((m) => m.SaleEditor),
  },
  {
    path: ':id',
    loadComponent: () => import('./presentation/sale-detail').then((m) => m.SaleDetailPage),
  },
];
