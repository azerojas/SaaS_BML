import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { CatalogForm, CatalogEditorData } from './catalog-form';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Icon } from '../../../shared/ui/icon';
import { SessionStore } from '../../../core/auth/application/session-store';
import { CatalogFacade } from '../application/catalog-facade';
import { CatalogRecord, DEFINITIONS, Kind } from '../domain/catalog';
import { Alert } from '../../../shared/ui/alert';
import { Loading } from '../../../shared/ui/loading';
import { Pager } from '../../../shared/ui/pager';
import { pen, safeCatalogImage } from '../../../shared/domain/records';
import { ReferencePicker } from './reference-picker';
@Component({
  selector: 'bm-catalog-list',
  imports: [
    RouterLink,
    MatButtonModule,
    MatTooltipModule,
    Icon,
    Alert,
    Loading,
    Pager,
    ReferencePicker,
  ],
  providers: [CatalogFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<header class="feature-heading">
      <div>
        <p class="eyebrow">TU CARTA DE CUIDADO</p>
        <h1>{{ definition.title }}</h1>
        <p>Organiza cada detalle de tu catálogo.</p>
      </div>
      @if (session.hasPermission('negocio.add_' + definition.model)) {
        @if (kind === 'servicios' || kind === 'articulos') {
          <button
            mat-flat-button
            class="create-treatment"
            [attr.aria-label]="kind === 'servicios' ? 'Añadir tratamiento' : 'Añadir producto'"
            [matTooltip]="kind === 'servicios' ? 'Añadir tratamiento' : 'Añadir producto'"
            type="button"
            (click)="edit()"
            [disabled]="facade.busy() || editorOpen()"
          >
            <span class="create-label"><bm-icon name="plus" /><span>Añadir</span></span>
          </button>
        } @else {
          <a mat-flat-button routerLink="nuevo">Crear {{ definition.singular }}</a>
        }
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
            ><select
              id="catalog-active"
              [value]="String(state.query()['activo'] ?? 'all')"
              (change)="filter('activo', $event)"
            >
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
        @if ((kind === 'servicios' || kind === 'articulos') && canCategories()) {
          <bm-reference-picker
            id="filter-category"
            label="Categoría"
            [kind]="kind === 'servicios' ? 'categorias-servicio' : 'categorias-articulo'"
            [value]="category"
            (changed)="category = $event; categoryFilter($event)"
          />
        }
      </div>
      <p class="muted">
        Orden del servidor:
        {{ kind === 'unidades' || kind === 'categorias-articulo' ? 'nombre' : 'orden, nombre' }} e
        identificador.
      </p>
      @if (facade.error(); as error) {
        <bm-alert [message]="error" />
      }
      @if (facade.success(); as success) {
        <bm-alert kind="info" [message]="success" />
      }
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
            <article class="record-row catalog-list-row" [attr.aria-label]="row.nombre">
              <a class="catalog-record-link" [routerLink]="[row.id]">
                @if (photo(row); as source) {
                  <img
                    class="catalog-thumbnail"
                    [src]="source"
                    alt=""
                    loading="lazy"
                    (error)="imageFailed(row)"
                  />
                } @else {
                  <span class="record-avatar" aria-hidden="true">{{ row.nombre.charAt(0) }}</span>
                }
                <span class="record-main"
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
              </a>
              @if (
                (kind === 'servicios' || kind === 'articulos') &&
                session.hasPermission('negocio.change_' + definition.model)
              ) {
                <div class="catalog-row-actions">
                  <button
                    mat-icon-button
                    [matTooltip]="'Editar ' + actionName"
                    type="button"
                    [attr.aria-label]="'Editar ' + actionName + ' ' + row.nombre"
                    [disabled]="facade.busy() || editorOpen()"
                    (click)="edit(row)"
                  >
                    <bm-icon name="edit" />
                  </button>
                  @if (row['activo'] !== false) {
                    <button
                      mat-icon-button
                      [matTooltip]="'Eliminar ' + actionName"
                      class="remove-treatment"
                      type="button"
                      [attr.aria-label]="'Eliminar ' + actionName + ' ' + row.nombre"
                      [disabled]="facade.busy() || editorOpen() || confirming()"
                      (click)="remove(row)"
                    >
                      <bm-icon name="trash" />
                    </button>
                  }
                  <button
                    mat-icon-button
                    class="toggle-treatment"
                    [class.treatment-active]="row['activo'] !== false"
                    [attr.aria-label]="
                      (row['activo'] === false ? 'Activar ' : 'Desactivar ') +
                      actionName +
                      ' ' +
                      row.nombre
                    "
                    [matTooltip]="
                      (row['activo'] === false ? 'Activar ' : 'Desactivar ') + actionName
                    "
                    type="button"
                    [disabled]="facade.busy() || editorOpen() || confirming()"
                    (click)="toggleActive(row)"
                  >
                    <bm-icon name="power" />
                  </button>
                </div>
              }
            </article>
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
  styles: `
    .catalog-thumbnail {
      width: 48px;
      height: 48px;
      object-fit: cover;
      border-radius: 12px;
      flex-shrink: 0;
    }
    .create-treatment {
      background: var(--forest);
      color: var(--on-primary);
      flex-shrink: 0;
      height: 36px;
      min-height: 36px;
      border-radius: 8px;
    }
    .create-treatment bm-icon {
      width: 16px;
      height: 16px;
    }
    .create-label {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      vertical-align: middle;
    }
    .catalog-record-link {
      display: flex;
      align-items: center;
      gap: 1rem;
      flex: 1;
      min-width: 0;
      text-decoration: none;
    }
    .catalog-row-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }
    .remove-treatment {
      color: var(--error);
    }
    .toggle-treatment {
      color: var(--muted);
    }
    .toggle-treatment.treatment-active {
      color: var(--forest);
    }
    @media (max-width: 680px) {
      .catalog-list-row {
        flex-wrap: wrap;
      }
      .catalog-record-link {
        flex-basis: 100%;
        flex-wrap: wrap;
      }
      .catalog-row-actions {
        padding-left: 0;
      }
    }
  `,
})
export class CatalogList {
  private readonly dialog = inject(MatDialog);
  readonly editorOpen = signal(false);
  readonly confirming = signal(false);
  private readonly failedPhotos = signal<readonly string[]>([]);
  readonly facade = inject(CatalogFacade);
  readonly state = this.facade.list;
  readonly session = inject(SessionStore);
  private readonly route = inject(ActivatedRoute);
  readonly kind = this.route.snapshot.data['kind'] as Kind;
  readonly definition = DEFINITIONS[this.kind];
  readonly actionName = this.kind === 'articulos' ? 'producto' : 'tratamiento';
  readonly money = pen;
  readonly String = String;
  category = '';
  photo(row: CatalogRecord) {
    const source = row['imagen_principal'];
    return typeof source === 'string' && !this.failedPhotos().includes(source)
      ? safeCatalogImage(source)
      : null;
  }
  imageFailed(row: CatalogRecord) {
    const source = row['imagen_principal'];
    if (typeof source === 'string') this.failedPhotos.update((values) => [...values, source]);
  }
  constructor() {
    this.facade.configure(this.kind);
    this.state.filter(this.kind === 'servicios' ? { activo: 'true' } : {});
  }
  async edit(row?: CatalogRecord) {
    if (this.editorOpen() || this.facade.busy()) return;
    this.editorOpen.set(true);
    try {
      const saved = await firstValueFrom(
        this.dialog
          .open<CatalogForm, CatalogEditorData, CatalogRecord>(CatalogForm, {
            width: '760px',
            maxWidth: '94vw',
            maxHeight: '92dvh',
            disableClose: true,
            autoFocus: 'first-heading',
            data: { kind: this.kind, id: row?.id },
          })
          .afterClosed(),
      );
      if (saved) {
        this.facade.success.set(
          this.kind === 'articulos'
            ? row
              ? 'Producto actualizado.'
              : 'Producto creado.'
            : row
              ? 'Tratamiento actualizado.'
              : 'Tratamiento creado.',
        );
        this.state.reload();
      }
    } finally {
      this.editorOpen.set(false);
    }
  }
  async remove(row: CatalogRecord) {
    if (this.confirming() || this.facade.busy()) return;
    this.confirming.set(true);
    try {
      const confirmed = await firstValueFrom(
        this.dialog
          .open(ConfirmDialog, {
            width: '440px',
            maxWidth: '92vw',
            data: {
              title: 'Eliminar ' + this.actionName,
              description:
                'Se retirará «' +
                row.nombre +
                (this.kind === 'articulos'
                  ? '» del catálogo y de nuevas ventas o consumos. Su historial se conserva. Puedes recuperarlo desde Inactivos.'
                  : '» del catálogo y de nuevas ventas o reservas. Su historial se conserva. Puedes recuperarlo desde Inactivos.'),
              confirm: 'Eliminar',
            },
          })
          .afterClosed(),
      );
      if (!confirmed) return;
      const removed = await this.facade.run(this.facade.api.active(this.kind, row.id, false));
      if (removed) {
        this.facade.success.set(
          this.kind === 'articulos'
            ? 'Producto retirado del catálogo.'
            : 'Tratamiento retirado del catálogo.',
        );
        if (this.state.rows().length === 1 && this.page() > 1) this.state.page(this.page() - 1);
        else this.state.reload();
      }
    } finally {
      this.confirming.set(false);
    }
  }
  async toggleActive(row: CatalogRecord) {
    if (this.facade.busy() || this.editorOpen() || this.confirming()) return;
    const active = row['activo'] === false;
    const saved = await this.facade.run(this.facade.api.active(this.kind, row.id, active));
    if (saved) {
      this.facade.success.set(
        this.kind === 'articulos'
          ? active
            ? 'Producto reactivado.'
            : 'Producto desactivado.'
          : active
            ? 'Tratamiento reactivado.'
            : 'Tratamiento desactivado.',
      );
      if (this.state.rows().length === 1 && this.page() > 1) this.state.page(this.page() - 1);
      else this.state.reload();
    }
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
