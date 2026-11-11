import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/guards/auth-guards';
export const CLIENTAS_ROUTES: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./presentation/clientas-list').then((m) => m.ClientasList),
  },
  {
    path: 'nueva',
    canActivate: [permissionGuard],
    data: { permission: 'negocio.add_clientas' },
    loadComponent: () => import('./presentation/clienta-form').then((m) => m.ClientaForm),
  },
  {
    path: ':id/editar',
    canActivate: [permissionGuard],
    data: { permission: 'negocio.change_clientas' },
    loadComponent: () => import('./presentation/clienta-form').then((m) => m.ClientaForm),
  },
  {
    path: ':id',
    loadComponent: () => import('./presentation/clienta-detail').then((m) => m.ClientaDetail),
  },
];
