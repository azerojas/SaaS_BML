import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  Injector,
  afterNextRender,
  inject,
  signal,
} from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { filter, firstValueFrom, take } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { SessionStore } from '../../../core/auth/application/session-store';
import { ClientasFacade } from '../application/clientas-facade';
import { Alert } from '../../../shared/ui/alert';
import { Loading } from '../../../shared/ui/loading';
import { Pager } from '../../../shared/ui/pager';
import { Icon } from '../../../shared/ui/icon';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog';
import { ClientaDetail } from './clienta-detail';
import { ClientaForm } from './clienta-form';
import { Clienta } from '../domain/clienta';
@Component({
  selector: 'bm-clientas-list',
  imports: [MatButtonModule, Alert, Loading, Pager, Icon],
  providers: [ClientasFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<header class="feature-heading">
      <div>
        <p class="eyebrow">EL CUIDADO EMPIEZA POR CONOCERLAS</p>
        <h1>Clientas</h1>
        <p>Tu agenda de personas, cuidada en cada detalle.</p>
      </div>
      @if (session.hasPermission('negocio.add_clientas')) {
        <button mat-flat-button type="button" (click)="edit()">
          <span class="new-client-label"><bm-icon name="plus" /><span>Nueva clienta</span></span>
        </button>
      }
    </header>
    <section class="surface">
      @if (facade.error(); as error) {
        <bm-alert [message]="error" />
      }
      @if (facade.success(); as success) {
        <bm-alert kind="info" [message]="success" />
      }
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
            <article
              class="record-row client-row"
              [attr.data-client-id]="client.id"
              [attr.aria-label]="client.nombres + ' ' + client.apellidos"
            >
              <span class="record-avatar" aria-hidden="true"
                >{{ client.nombres.charAt(0) }}{{ client.apellidos.charAt(0) }}</span
              ><span class="record-main"
                ><strong>{{ client.nombres }} {{ client.apellidos }}</strong
                ><span>{{ client.telefono }}</span></span
              ><span class="badge" [class.inactive]="!client.activa">{{
                client.activa ? 'Activa' : 'Inactiva'
              }}</span>
              <div class="client-actions">
                <button
                  mat-icon-button
                  type="button"
                  aria-label="Ver"
                  title="Ver ficha"
                  data-client-action="view"
                  (click)="view(client)"
                >
                  <bm-icon name="eye" />
                </button>
                @if (session.hasPermission('negocio.change_clientas')) {
                  <button
                    mat-icon-button
                    type="button"
                    aria-label="Editar"
                    title="Editar clienta"
                    data-client-action="edit"
                    (click)="edit(client)"
                    [disabled]="facade.busy() || confirming()"
                  >
                    <bm-icon name="edit" />
                  </button>
                  <button
                    mat-icon-button
                    type="button"
                    [attr.aria-label]="client.activa ? 'Eliminar' : 'Activar'"
                    [title]="client.activa ? 'Eliminar clienta' : 'Activar clienta'"
                    data-client-action="state"
                    [class.delete-action]="client.activa"
                    (click)="toggle(client)"
                    [disabled]="facade.busy() || confirming()"
                  >
                    <bm-icon [name]="client.activa ? 'trash' : 'power'" />
                  </button>
                }
              </div>
            </article>
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
  styles: `
    .new-client-label {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 7px;
      vertical-align: middle;
    }
    .new-client-label bm-icon {
      width: 18px;
      height: 18px;
    }
    .client-row {
      flex-wrap: wrap;
      gap: 14px;
    }
    .client-actions {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 6px;
      margin-left: auto;
    }
    .client-actions button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 44px;
      height: 44px;
      padding: 0;
      min-height: 44px;
    }
    .client-actions bm-icon {
      width: 18px;
      height: 18px;
    }
    .client-actions .delete-action {
      color: var(--error);
    }
    @media (max-width: 650px) {
      .client-actions {
        width: 100%;
        justify-content: flex-end;
      }
      .record-main {
        min-width: 120px;
      }
    }
  `,
})
export class ClientasList {
  readonly facade = inject(ClientasFacade);
  readonly state = this.facade.list;
  readonly session = inject(SessionStore);
  private readonly dialog = inject(MatDialog);
  private readonly destroy = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly document = inject(DOCUMENT);
  readonly confirming = signal(false);
  private reloadAndFocus(id?: number, action = 'view') {
    this.state.reload();
    if (!id) return;
    toObservable(this.state.loading, { injector: this.injector })
      .pipe(
        filter((loading) => !loading),
        take(1),
        takeUntilDestroyed(this.destroy),
      )
      .subscribe(() => {
        afterNextRender(
          () =>
            this.document
              .querySelector<HTMLElement>(
                `[data-client-id="${id}"] [data-client-action="${action}"]`,
              )
              ?.focus(),
          { injector: this.injector },
        );
      });
  }
  view(client: Clienta) {
    this.dialog
      .open(ClientaDetail, {
        data: { id: client.id },
        width: '1080px',
        maxWidth: '96vw',
        maxHeight: '94dvh',
        autoFocus: 'first-heading',
        closePredicate: (_result, _config, instance) =>
          !(instance instanceof ClientaDetail && instance.facade.busy()),
      })
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe(() => this.reloadAndFocus(client.id));
  }
  edit(client?: Clienta) {
    if (!this.session.hasPermission(client ? 'negocio.change_clientas' : 'negocio.add_clientas'))
      return;
    this.dialog
      .open(ClientaForm, {
        data: client,
        width: '760px',
        maxWidth: '96vw',
        maxHeight: '94dvh',
        autoFocus: 'first-heading',
        closePredicate: (_result, _config, instance) => {
          if (!(instance instanceof ClientaForm)) return true;
          if (instance.facade.busy()) return false;
          return (
            !instance.form.dirty ||
            window.confirm('Hay cambios sin guardar. ¿Cerrar y descartarlos?')
          );
        },
      })
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe((saved) => {
        if (saved) this.reloadAndFocus(client?.id, 'edit');
      });
  }
  async toggle(client: Clienta) {
    if (
      !this.session.hasPermission('negocio.change_clientas') ||
      this.facade.busy() ||
      this.confirming()
    )
      return;
    this.confirming.set(true);
    try {
      if (
        client.activa &&
        !(await firstValueFrom(
          this.dialog
            .open(ConfirmDialog, {
              data: {
                title: 'Eliminar clienta',
                description:
                  'Se quitará del listado de clientas activas. Su ficha y su historial se conservan; podrás activarla desde el filtro Inactivas.',
                confirm: 'Eliminar',
              },
            })
            .afterClosed(),
        ))
      )
        return;
      this.facade.record.set(client);
      await this.facade.active(!client.activa);
      if (!this.facade.error()) this.reloadAndFocus(client.id, 'state');
    } finally {
      this.confirming.set(false);
    }
  }
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
