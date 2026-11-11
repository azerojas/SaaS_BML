import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { SessionStore } from '../../../core/auth/application/session-store';
import { CatalogFacade } from '../application/catalog-facade';
import { DEFINITIONS, Kind } from '../domain/catalog';
import { Alert } from '../../../shared/ui/alert';
import { Loading } from '../../../shared/ui/loading';
import { Pager } from '../../../shared/ui/pager';
import { pen } from '../../../shared/domain/records';
import { ReferencePicker } from './reference-picker';
@Component({
  selector: 'bm-catalog-list',
  imports: [RouterLink, MatButtonModule, Alert, Loading, Pager, ReferencePicker],
  providers: [CatalogFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<header class="feature-heading">
      <div>
        <p class="eyebrow">TU CARTA DE CUIDADO</p>
        <h1>{{ definition.title }}</h1>
        <p>Organiza cada detalle de tu catálogo.</p>
      </div>
      @if (session.hasPermission('negocio.add_' + definition.model)) {
        <a mat-flat-button routerLink="nuevo">Crear {{ definition.singular }}</a>
      }
    </header>
    <section class="surface">
      <div class="filters">
        <div>
          <label for="catalog-search">Buscar {{ definition.title.toLowerCase() }}</label
          ><input
            id="catalog-search"
            type="search"
            maxlength="200"
            placeholder="Nombre, SKU o código"
            (input)="filter('search', $event)"
          />
        </div>
        @if (definition.active) {
          <div>
            <label for="catalog-active">Estado</label
            ><select id="catalog-active" (change)="filter('activo', $event)">
              <option value="all">Todos</option>
              <option value="true">Activos</option>
              <option value="false">Inactivos</option>
            </select>
          </div>
        }
        @if (kind === 'servicios' || kind === 'articulos') {
          <div>
            <label for="catalog-visible">Visibilidad</label
            ><select id="catalog-visible" (change)="filter('visible_catalogo', $event)">
              <option value="all">Todos</option>
              <option value="true">Publicados</option>
              <option value="false">Privados</option>
            </select>
          </div>
        }
        @if (kind === 'articulos') {
          <div>
            <label for="catalog-type">Tipo</label
            ><select id="catalog-type" (change)="filter('tipo', $event)">
              <option value="">Todos</option>
              <option value="INSUMO">Insumo</option>
              <option value="VENTA">Venta</option>
              <option value="AMBOS">Ambos</option>
            </select>
          </div>
        }
      </div>
      @if ((kind === 'servicios' || kind === 'articulos') && canCategories()) {
        <details class="filter-extra">
          <summary>Filtrar por categoría</summary>
          <bm-reference-picker
            id="filter-category"
            label="Categoría"
            [kind]="kind === 'servicios' ? 'categorias-servicio' : 'categorias-articulo'"
            [value]="category"
            (changed)="category = $event; categoryFilter($event)"
          />
        </details>
      }
      <p class="muted">
        Orden del servidor:
        {{ kind === 'unidades' || kind === 'categorias-articulo' ? 'nombre' : 'orden, nombre' }} e
        identificador.
      </p>
      @if (state.error(); as error) {
        <bm-alert [message]="error" /><button mat-button (click)="state.reload()">
          Reintentar
        </button>
      }
      @if (state.loading()) {
        <bm-loading label="Cargando catálogo…" />
      } @else {
        <div class="record-list">
          @for (row of state.rows(); track row.id) {
            <a class="record-row" [routerLink]="[row.id]"
              ><span class="record-avatar" aria-hidden="true">{{ row.nombre.charAt(0) }}</span
              ><span class="record-main"
                ><strong>{{ row.nombre }}</strong
                ><span
                  >{{ row['categoria_nombre'] || row['codigo'] || row['tipo'] || 'Catálogo'
                  }}{{ row['sku'] ? ' · ' + row['sku'] : '' }}</span
                ></span
              >
              @if (kind === 'servicios' || kind === 'articulos') {
                <span class="record-price">{{
                  money(String(row[kind === 'servicios' ? 'precio_base' : 'precio_venta']))
                }}</span>
              }
              @if (definition.active) {
                <span
                  class="badge"
                  [class.inactive]="row['activo'] === false || row['activa'] === false"
                  >{{
                    row['activo'] === false || row['activa'] === false ? 'Inactivo' : 'Activo'
                  }}</span
                >
              }
              <span aria-hidden="true">→</span></a
            >
          } @empty {
            <div class="empty-panel">
              <h2>Aún no hay resultados</h2>
              <p>Ajusta los filtros o crea un registro si tienes permiso.</p>
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
export class CatalogList {
  readonly facade = inject(CatalogFacade);
  readonly state = this.facade.list;
  readonly session = inject(SessionStore);
  private readonly route = inject(ActivatedRoute);
  readonly kind = this.route.snapshot.data['kind'] as Kind;
  readonly definition = DEFINITIONS[this.kind];
  readonly money = pen;
  readonly String = String;
  category = '';
  constructor() {
    this.facade.configure(this.kind, true);
  }
  filter(key: string, event: Event) {
    const value = (event.target as HTMLInputElement).value;
    const query = { ...this.state.query() };
    delete query[key];
    if (value) query[key] = value;
    this.state.query.set(query);
    this.state.filter({});
  }
  categoryFilter(value: string) {
    const query = { ...this.state.query() };
    delete query['categoria'];
    if (value) query['categoria'] = value;
    this.state.query.set(query);
    this.state.filter({});
  }
  canCategories() {
    return this.session.hasPermission(
      'negocio.view_' + (this.kind === 'servicios' ? 'categoriasservicio' : 'categoriasarticulo'),
    );
  }
  page() {
    return Number(this.state.query()['page']);
  }
}
