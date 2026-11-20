import { Routes } from '@angular/router';
export const VISIT_ROUTES: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./presentation/visits-list').then((m) => m.VisitsList),
  },
  { path: 'nueva', pathMatch: 'full', redirectTo: '' },
  {
    path: ':id',
    loadComponent: () => import('./presentation/visit-detail').then((m) => m.VisitDetail),
  },
];
