import { Routes } from '@angular/router';
import { authGuard, anonymousGuard, permissionGuard } from './core/guards/auth-guards';
import { NAVIGATION } from './core/config/navigation';
import { unsavedNavigationGuard } from './core/forms/unsaved-state';
export const routes: Routes = [
  ...['reservar', 'mis-reservas'].map((path) => ({
    path,
    loadComponent: () =>
      import('./layouts/public-layout/public-layout').then((m) => m.PublicLayout),
    children: [
      {
        path: '',
        title: 'Reservas · Lasheo',
        loadComponent: () =>
          import('./features/reservas/public-booking-page').then((m) => m.PublicBookingPage),
      },
    ],
  })),
  { path: '', pathMatch: 'full', redirectTo: 'admin' },
  {
    path: 'login',
    canActivate: [anonymousGuard],
    loadComponent: () => import('./layouts/auth-layout/auth-layout').then((m) => m.AuthLayout),
    children: [
      {
        path: '',
        title: 'Accede a tu espacio · Lasheo',
        loadComponent: () => import('./core/auth/presentation/login-page').then((m) => m.LoginPage),
      },
    ],
  },
  {
    path: 'admin',
    canActivate: [authGuard],
    canActivateChild: [authGuard, unsavedNavigationGuard],
    loadComponent: () => import('./layouts/admin-layout/admin-layout').then((m) => m.AdminLayout),
    children: [
      {
        path: 'agenda',
        canActivate: [permissionGuard],
        data: { anyPermissions: ['agenda.view_agenda', 'agenda.view_own_agenda'] },
        loadChildren: () => import('./features/agenda/agenda.routes').then((m) => m.AGENDA_ROUTES),
      },
      {
        path: 'reportes',
        pathMatch: 'full',
        redirectTo: '/admin',
      },
      { path: 'llegadas', pathMatch: 'full', redirectTo: 'visitas' },
      { path: 'llegadas/:id', redirectTo: 'visitas' },
      {
        path: 'puntos-qr',
        canActivate: [permissionGuard],
        data: { permission: 'negocio.view_puntosqr' },
        loadComponent: () =>
          import('./features/registro-qr/presentation/qr-management').then((m) => m.QrManagement),
      },
      {
        path: 'visitas',
        canActivate: [permissionGuard],
        data: { permission: 'finanzas.view_finance' },
        loadChildren: () => import('./features/visitas/visitas.routes').then((m) => m.VISIT_ROUTES),
      },
      {
        path: 'ventas',
        canActivate: [permissionGuard],
        data: { permission: 'finanzas.view_finance' },
        loadChildren: () => import('./features/ventas/ventas.routes').then((m) => m.SALE_ROUTES),
      },
      {
        path: 'inventario',
        loadChildren: () =>
          import('./features/inventario/inventario.routes').then((m) => m.INVENTORY_ROUTES),
      },
      {
        path: 'compras',
        canActivate: [permissionGuard],
        data: { permission: 'negocio.view_compras' },
        loadChildren: () =>
          import('./features/compras/compras.routes').then((m) => m.PURCHASE_ROUTES),
      },
      {
        path: 'proveedores',
        canActivate: [permissionGuard],
        data: { permission: 'negocio.view_proveedores' },
        loadChildren: () =>
          import('./features/proveedores/proveedores.routes').then((m) => m.SUPPLIER_ROUTES),
      },
      {
        path: 'clientas',
        canActivate: [permissionGuard],
        data: { permission: 'negocio.view_clientas' },
        loadChildren: () =>
          import('./features/clientas/clientas.routes').then((m) => m.CLIENTAS_ROUTES),
      },
      {
        path: 'catalogo',
        loadChildren: () =>
          import('./features/catalogo/catalogo.routes').then((m) => m.CATALOG_ROUTES),
      },
      {
        path: '',
        pathMatch: 'full',
        title: 'Inicio · Lasheo',
        loadComponent: () =>
          import('./features/dashboard/dashboard-page').then((m) => m.DashboardPage),
      },
      ...NAVIGATION.filter(
        (item) =>
          item.permission &&
          ![
            '/admin/clientas',
            '/admin/catalogo',
            '/admin/inventario',
            '/admin/compras',
            '/admin/proveedores',
            '/admin/visitas',
            '/admin/ventas',
            '/admin/llegadas',
            '/admin/puntos-qr',
            '/admin/reportes',
            '/admin/agenda',
          ].includes(item.path),
      ).map((item) => ({
        path: item.path.slice('/admin/'.length),
        title: item.label + ' · Lasheo',
        canActivate: [permissionGuard],
        data: {
          title: item.label + ', en preparación.',
          icon: item.icon,
          permission: item.permission,
        },
        loadComponent: () =>
          import('./features/foundation/placeholder-page').then((m) => m.PlaceholderPage),
      })),
      {
        path: 'acceso-denegado',
        title: 'Acceso restringido · Lasheo',
        loadComponent: () => import('./features/foundation/denied-page').then((m) => m.DeniedPage),
      },
    ],
  },
  {
    path: 'catalogo',
    loadComponent: () =>
      import('./layouts/public-layout/public-layout').then((m) => m.PublicLayout),
    children: [
      {
        path: '',
        pathMatch: 'full',
        title: 'Catálogo · Lasheo',
        loadComponent: () =>
          import('./features/catalogo-publico/presentation/public-catalog').then(
            (m) => m.PublicCatalog,
          ),
      },
      {
        path: 'servicios/:slug',
        data: { kind: 'servicios' },
        loadComponent: () =>
          import('./features/catalogo-publico/presentation/public-detail').then(
            (m) => m.PublicDetail,
          ),
      },
      {
        path: 'productos/:slug',
        data: { kind: 'productos' },
        loadComponent: () =>
          import('./features/catalogo-publico/presentation/public-detail').then(
            (m) => m.PublicDetail,
          ),
      },
    ],
  },
  {
    path: 'registro',
    loadComponent: () =>
      import('./layouts/public-layout/public-layout').then((m) => m.PublicLayout),
    children: [
      {
        path: '',
        title: 'Bienvenida · Lasheo',
        loadComponent: () =>
          import('./features/registro-qr/presentation/public-checkin').then((m) => m.PublicCheckin),
      },
      {
        path: ':token',
        title: 'Bienvenida · Lasheo',
        loadComponent: () =>
          import('./features/registro-qr/presentation/public-checkin').then((m) => m.PublicCheckin),
      },
    ],
  },
  {
    path: '**',
    title: 'Página no encontrada · Lasheo',
    loadComponent: () =>
      import('./layouts/public-layout/public-layout').then((m) => m.PublicLayout),
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./features/foundation/not-found-page').then((m) => m.NotFoundPage),
      },
    ],
  },
];
