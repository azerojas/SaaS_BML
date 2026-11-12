import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/guards/auth-guards';
export const VISIT_ROUTES: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./presentation/visits-list').then((m) => m.VisitsList),
  },
  {
    path: 'nueva',
    canActivate: [permissionGuard],
    data: { permission: 'finanzas.manage_visits' },
    loadComponent: () => import('./presentation/visit-create').then((m) => m.VisitCreate),
  },
  {
    path: ':id',
    loadComponent: () => import('./presentation/visit-detail').then((m) => m.VisitDetail),
  },
];
