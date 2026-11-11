import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { SessionStore } from '../../../core/auth/application/session-store';
import { ClientasFacade } from '../application/clientas-facade';
import { Alert } from '../../../shared/ui/alert';
import { Loading } from '../../../shared/ui/loading';
import { Pager } from '../../../shared/ui/pager';
@Component({
  selector: 'bm-clientas-list',
  imports: [RouterLink, MatButtonModule, Alert, Loading, Pager],
  providers: [ClientasFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<header class="feature-heading">
      <div>
        <p class="eyebrow">EL CUIDADO EMPIEZA POR CONOCERLAS</p>
        <h1>Clientas</h1>
        <p>Tu agenda de personas, cuidada en cada detalle.</p>
      </div>
      @if (session.hasPermission('negocio.add_clientas')) {
        <a mat-flat-button routerLink="nueva">Nueva clienta</a>
      }
    </header>
    <section class="surface">
      <div class="filters">
        <div>
          <label for="client-search">Buscar clientas</label
          ><input
            id="client-search"
            type="search"
            maxlength="200"
            placeholder="Nombre, apellidos o teléfono"
            (input)="filter('search', $event)"
          />
        </div>
        <div>
          <label for="client-active">Estado</label
          ><select id="client-active" (change)="filter('activa', $event)">
            <option value="true">Activas</option>
            <option value="false">Inactivas</option>
            <option value="all">Todas</option>
          </select>
        </div>
      </div>
      @if (state.error(); as error) {
        <bm-alert [message]="error" /><button mat-button (click)="state.reload()">
          Reintentar
        </button>
      }
      @if (state.loading()) {
        <bm-loading label="Buscando clientas…" />
      } @else {
        <div class="record-list">
          @for (client of state.rows(); track client.id) {
            <a class="record-row" [routerLink]="[client.id]"
              ><span class="record-avatar" aria-hidden="true"
                >{{ client.nombres.charAt(0) }}{{ client.apellidos.charAt(0) }}</span
              ><span class="record-main"
                ><strong>{{ client.nombres }} {{ client.apellidos }}</strong
                ><span>{{ client.telefono }}</span></span
              ><span class="badge" [class.inactive]="!client.activa">{{
                client.activa ? 'Activa' : 'Inactiva'
              }}</span
              ><span aria-hidden="true">→</span></a
            >
          } @empty {
            <div class="empty-panel">
              <h2>No encontramos clientas</h2>
              <p>Prueba otra búsqueda o registra la primera clienta.</p>
            </div>
          }
        </div>
      }
      <bm-pager
        [count]="state.count()"
        [page]="page()"
        [busy]="state.loading()"
        (changed)="state.page($event)"
      />
    </section>`,
})
export class ClientasList {
  readonly facade = inject(ClientasFacade);
  readonly state = this.facade.list;
  readonly session = inject(SessionStore);
  constructor() {
    this.state.filter({ activa: 'true' });
  }
  filter(key: string, event: Event) {
    this.state.filter({ [key]: (event.target as HTMLInputElement).value });
  }
  page() {
    return Number(this.state.query()['page']);
  }
}
