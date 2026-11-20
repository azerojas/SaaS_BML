import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { SessionStore } from '../../core/auth/application/session-store';
@Component({
  selector: 'bm-operations-nav',
  imports: [RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<nav class="feature-tabs" aria-label="Operación de inventario">
    @for (item of items; track item.path) {
      @if (session.hasPermission(item.permission)) {
        <a
          [routerLink]="item.path"
          routerLinkActive="selected"
          [routerLinkActiveOptions]="{ exact: true }"
          >{{ item.label }}</a
        >
      }
    }
  </nav>`,
})
export class OperationsNav {
  readonly session = inject(SessionStore);
  readonly items = [
    { path: '/admin/inventario', label: 'Existencias', permission: 'negocio.view_articulos' },
    {
      path: '/admin/inventario/movimientos',
      label: 'Movimientos',
      permission: 'negocio.view_movimientosinventario',
    },
    { path: '/admin/compras', label: 'Compras', permission: 'negocio.view_compras' },
    { path: '/admin/proveedores', label: 'Proveedores', permission: 'negocio.view_proveedores' },
  ];
}
