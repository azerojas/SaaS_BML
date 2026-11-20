import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { SessionStore } from '../../../core/auth/application/session-store';
import { SuppliersFacade } from '../application/suppliers-facade';
import { Alert } from '../../../shared/ui/alert';
import { Loading } from '../../../shared/ui/loading';
import { Pager } from '../../../shared/ui/pager';
import { OperationsNav } from '../../../shared/ui/operations-nav';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom, map } from 'rxjs';
import { Icon } from '../../../shared/ui/icon';
import { RecordPreview } from '../../../shared/ui/record-preview';
import { SupplierForm } from './supplier-form';
import { Supplier } from '../domain/supplier';
import { SuppliersApi } from '../infrastructure/suppliers-api';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog';
@Component({
  selector: 'bm-suppliers-list',
  imports: [MatButtonModule, Alert, Loading, Pager, OperationsNav, Icon],
  providers: [SuppliersFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<bm-operations-nav />
    <header class="feature-heading">
      <div>
        <p class="eyebrow">ALIANZAS QUE ACOMPAÑAN</p>
        <h1>Proveedores</h1>
        <p>Contactos privados para las compras de tu salón.</p>
      </div>
      @if (session.hasPermission('negocio.add_proveedores')) {
        <button
          mat-flat-button
          type="button"
          aria-label="Nuevo proveedor"
          class="supplier-trigger"
          (click)="edit()"
        >
          <span class="trigger-content"><bm-icon name="plus" /><span>Proveedor</span></span>
        </button>
      }
    </header>
    <section class="surface">
      @if (facade.error(); as error) {
        <bm-alert [message]="error" />
      }
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
            <article class="record-row">
              <span class="record-avatar" aria-hidden="true">{{ row.nombre.charAt(0) }}</span
              ><span class="record-main"
                ><strong>{{ row.nombre }}</strong
                ><span
                  >{{ row.ruc || 'Sin RUC registrado' }} ·
                  {{ row.telefono || 'Sin teléfono' }}</span
                ></span
              ><span class="badge" [class.inactive]="!row.activo">{{
                row.activo ? 'Activo' : 'Inactivo'
              }}</span
              ><span class="row-actions">
                <button
                  mat-icon-button
                  type="button"
                  [attr.aria-label]="'Visualizar proveedor ' + row.nombre"
                  (click)="view(row)"
                >
                  <bm-icon name="eye" />
                </button>
                @if (session.hasPermission('negocio.change_proveedores')) {
                  <button
                    mat-icon-button
                    type="button"
                    [attr.aria-label]="'Editar proveedor ' + row.nombre"
                    (click)="edit(row)"
                  >
                    <bm-icon name="edit" />
                  </button>
                  @if (row.activo) {
                    <button
                      mat-icon-button
                      type="button"
                      [disabled]="facade.busy()"
                      [attr.aria-label]="'Eliminar proveedor ' + row.nombre"
                      (click)="remove(row)"
                    >
                      <bm-icon name="trash" />
                    </button>
                  }
                }
              </span>
            </article>
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
  styles: `
    .row-actions,
    .supplier-trigger .trigger-content {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      vertical-align: middle;
    }
    .row-actions {
      flex-shrink: 0;
      flex-wrap: wrap;
    }
    .row-actions bm-icon,
    .supplier-trigger bm-icon {
      width: 18px;
      height: 18px;
    }
    .supplier-trigger {
      height: 36px;
      min-height: 36px;
      border-radius: 8px;
    }
    .record-row {
      flex-wrap: wrap;
    }
  `,
})
export class SuppliersList {
  private readonly dialog = inject(MatDialog);
  private readonly api = inject(SuppliersApi);
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
  async edit(row?: Supplier) {
    if (!this.session.hasPermission('negocio.' + (row ? 'change' : 'add') + '_proveedores')) return;
    const saved = await firstValueFrom(
      this.dialog
        .open(SupplierForm, {
          data: { id: row?.id },
          width: '720px',
          maxWidth: '96vw',
          autoFocus: 'first-heading',
          closePredicate: (_r, _c, instance) =>
            !(instance instanceof SupplierForm && instance.facade.busy()),
        })
        .afterClosed(),
    );
    if (saved) this.state.reload();
  }
  view(row: Supplier) {
    this.dialog.open(RecordPreview, {
      width: '700px',
      maxWidth: '96vw',
      data: {
        title: row.nombre,
        subtitle: 'Detalle del proveedor',
        load: () =>
          this.api.get(row.id).pipe(
            map((item) => ({
              kind: 'supplier',
              status: {
                label: item.activo ? 'Proveedor activo' : 'Proveedor inactivo',
                positive: item.activo,
              },
              links: [
                ...(item.telefono
                  ? [{ label: 'Llamar', href: 'tel:' + item.telefono, icon: 'phone' }]
                  : []),
                ...(item.email
                  ? [{ label: 'Correo', href: 'mailto:' + item.email, icon: 'mail' }]
                  : []),
              ],
              fields: [
                {
                  label: 'RUC o identificador',
                  value: item.ruc ?? 'Sin registrar',
                  icon: 'receipt',
                },
                { label: 'Teléfono', value: item.telefono ?? 'Sin registrar', icon: 'phone' },
                { label: 'Correo electrónico', value: item.email ?? 'Sin registrar', icon: 'mail' },
                { label: 'Referencia interna', value: 'Proveedor #' + item.id, icon: 'users' },
              ],
            })),
          ),
      },
    });
  }
  async remove(row: Supplier) {
    if (!this.session.hasPermission('negocio.change_proveedores') || this.facade.busy()) return;
    const confirmed = await firstValueFrom(
      this.dialog
        .open(ConfirmDialog, {
          data: {
            title: '¿Eliminar proveedor?',
            description:
              row.nombre +
              ' se retirará de los proveedores activos. Se conservarán sus compras e historial.',
            confirm: 'Eliminar',
          },
        })
        .afterClosed(),
    );
    if (confirmed) {
      this.facade.record.set(row);
      await this.facade.active(false);
      this.state.reload();
    }
  }
}
