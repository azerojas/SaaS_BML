import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { SessionStore } from '../../../core/auth/application/session-store';
@Component({
  selector: 'bm-finance-nav',
  imports: [RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<nav class="operations-nav" aria-label="Atención y caja">
    @if (session.hasPermission('negocio.view_llegadas')) {
      <a routerLink="/admin/llegadas" routerLinkActive="active">Llegadas</a>
    }
    @if (session.hasPermission('negocio.view_puntosqr')) {
      <a routerLink="/admin/puntos-qr" routerLinkActive="active">Puntos QR</a>
    }
    @if (session.hasPermission('finanzas.view_finance')) {
      <a routerLink="/admin/visitas" routerLinkActive="active">Visitas</a
      ><a routerLink="/admin/ventas" routerLinkActive="active">Ventas y pagos</a>
    }
  </nav>`,
})
export class FinanceNav {
  readonly session = inject(SessionStore);
}
