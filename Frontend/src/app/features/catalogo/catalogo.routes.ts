import { Route, Routes } from '@angular/router';
import { permissionGuard } from '../../core/guards/auth-guards';
import { DEFINITIONS } from './domain/catalog';
export const CATALOG_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./presentation/catalog-shell').then((m) => m.CatalogShell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'servicios' },
      ...Object.values(DEFINITIONS).map((definition): Route => ({
        path: definition.kind,
        canActivate: [permissionGuard],
        data: { permission: 'negocio.view_' + definition.model },
        children: [
          {
            path: '',
            pathMatch: 'full',
            title: definition.title + ' · Lasheo',
            data: { kind: definition.kind },
            loadComponent: () => import('./presentation/catalog-list').then((m) => m.CatalogList),
          },
          {
            path: 'nuevo',
            canActivate: [permissionGuard],
            data: { kind: definition.kind, permission: 'negocio.add_' + definition.model },
            loadComponent: () => import('./presentation/catalog-form').then((m) => m.CatalogForm),
          },
          {
            path: ':id/editar',
            canActivate: [permissionGuard],
            data: { kind: definition.kind, permission: 'negocio.change_' + definition.model },
            loadComponent: () => import('./presentation/catalog-form').then((m) => m.CatalogForm),
          },
          {
            path: ':id',
            data: { kind: definition.kind },
            loadComponent: () =>
              import('./presentation/catalog-detail').then((m) => m.CatalogDetail),
          },
        ],
      })),
    ],
  },
];
