import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { SessionStore } from '../../../core/auth/application/session-store';
import { SuppliersFacade } from '../application/suppliers-facade';
import { Alert } from '../../../shared/ui/alert';
import { Loading } from '../../../shared/ui/loading';
import { Pager } from '../../../shared/ui/pager';
@Component({
  selector: 'bm-suppliers-list',
  imports: [RouterLink, MatButtonModule, Alert, Loading, Pager],
  providers: [SuppliersFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<header class="feature-heading">
      <div>
        <p class="eyebrow">ALIANZAS QUE ACOMPAÑAN</p>
        <h1>Proveedores</h1>
        <p>Contactos privados para las compras de tu salón.</p>
      </div>
      @if (session.hasPermission('negocio.add_proveedores')) {
        <a mat-flat-button routerLink="nuevo">Nuevo proveedor</a>
      }
    </header>
    <section class="surface">
      <div class="filters">
        <div>
          <label for="supplier-search">Buscar proveedores</label
          ><input
            id="supplier-search"
            type="search"
            maxlength="200"
            placeholder="Nombre, RUC o teléfono"
            (input)="filter('search', $event)"
          />
        </div>
        <div>
          <label for="supplier-state">Estado del proveedor</label
          ><select id="supplier-state" (change)="filter('activo', $event)">
            <option value="all">Todos</option>
            <option value="true">Activos</option>
            <option value="false">Inactivos</option>
          </select>
        </div>
      </div>
      @if (state.error(); as error) {
        <bm-alert [message]="error" /><button mat-button (click)="state.reload()">
          Reintentar proveedores
        </button>
      }
      @if (state.loading()) {
        <bm-loading />
      } @else {
        <div class="record-list">
          @for (row of state.rows(); track row.id) {
            <a class="record-row" [routerLink]="[row.id]"
              ><span class="record-avatar" aria-hidden="true">{{ row.nombre.charAt(0) }}</span
              ><span class="record-main"
                ><strong>{{ row.nombre }}</strong
                ><span
                  >{{ row.ruc || 'Sin RUC registrado' }} ·
                  {{ row.telefono || 'Sin teléfono' }}</span
                ></span
              ><span class="badge" [class.inactive]="!row.activo">{{
                row.activo ? 'Activo' : 'Inactivo'
              }}</span
              ><span aria-hidden="true">→</span></a
            >
          } @empty {
            <div class="empty-panel">
              <h2>No hay proveedores para esta búsqueda</h2>
              <p>Registra un proveedor si tienes permiso o cambia los filtros.</p>
            </div>
          }
        </div>
      }
      <bm-pager
        [count]="state.count()"
        [page]="Number(state.query()['page'])"
        [busy]="state.loading()"
        (changed)="state.page($event)"
      />
    </section>`,
})
export class SuppliersList {
  readonly facade = inject(SuppliersFacade);
  readonly state = this.facade.list;
  readonly session = inject(SessionStore);
  readonly Number = Number;
  constructor() {
    this.state.reload();
  }
  filter(key: string, event: Event) {
    this.state.filter({ [key]: (event.target as HTMLInputElement).value });
  }
}
