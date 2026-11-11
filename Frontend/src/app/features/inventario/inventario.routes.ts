import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/guards/auth-guards';
export const INVENTORY_ROUTES: Routes = [
  {
    path: '',
    pathMatch: 'full',
    title: 'Inventario · Lasheo',
    canActivate: [permissionGuard],
    data: { permission: 'negocio.view_articulos' },
    loadComponent: () => import('./presentation/stock-list').then((m) => m.StockList),
  },
  {
    path: 'articulos/:id',
    title: 'Existencias del artículo · Lasheo',
    canActivate: [permissionGuard],
    data: { permission: 'negocio.view_articulos' },
    loadComponent: () => import('./presentation/article-detail').then((m) => m.ArticleDetail),
  },
  {
    path: 'movimientos',
    title: 'Movimientos · Lasheo',
    canActivate: [permissionGuard],
    data: { permission: 'negocio.view_movimientosinventario' },
    loadComponent: () => import('./presentation/movement-history').then((m) => m.MovementHistory),
  },
  {
    path: 'alertas',
    title: 'Reposición · Lasheo',
    canActivate: [permissionGuard],
    data: { permission: 'negocio.view_articulos' },
    loadComponent: () => import('./presentation/stock-alerts').then((m) => m.StockAlerts),
  },
  {
    path: 'ajustes/nuevo',
    title: 'Ajuste de inventario · Lasheo',
    canActivate: [permissionGuard],
    data: {
      permissions: [
        'negocio.view_articulos',
        'negocio.add_movimientosinventario',
        'negocio.view_movimientosinventario',
      ],
    },
    loadComponent: () => import('./presentation/stock-adjustment').then((m) => m.StockAdjustment),
  },
];
