import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  OnInit,
  output,
  signal,
} from '@angular/core';
import { CatalogFacade } from '../application/catalog-facade';
import { CatalogRecord, Kind } from '../domain/catalog';
import { Pager } from '../../../shared/ui/pager';
import { Alert } from '../../../shared/ui/alert';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { SessionStore } from '../../../core/auth/application/session-store';
@Component({
  selector: 'bm-reference-picker',
  host: { '[attr.id]': 'null' },
  imports: [Pager, Alert, FormsModule, MatButtonModule, MatTooltipModule],
  providers: [CatalogFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="reference-picker">
    <label [for]="id()">{{ label() }}{{ required() ? ' *' : '' }}</label
    ><select
      [id]="id()"
      [ngModel]="adding() ? '__other__' : value()"
      [ngModelOptions]="{ standalone: true }"
      [disabled]="facade.busy()"
      [attr.aria-required]="required()"
      (ngModelChange)="choose($event)"
    >
      <option value="">Sin selección</option>
      @if (value()) {
        <option [value]="value()">
          {{ selectionLabel() }}
        </option>
      }
      @for (row of facade.list.rows(); track row.id) {
        @if (String(row.id) !== value()) {
          <option
            [value]="String(row.id)"
            [disabled]="materialsOnly() && (row['tipo'] === 'VENTA' || row['activo'] === false)"
          >
            {{ row.nombre
            }}{{
              row['unidad_codigo']
                ? ' · ' + row['unidad_codigo']
                : row['codigo']
                  ? ' · ' + row['codigo']
                  : ''
            }}
          </option>
        }
      }
      @if (canCreate()) {
        <option value="__other__">Otros</option>
      }
    </select>
    @if (adding()) {
      <div class="new-category">
        <label [for]="id() + '-new'">Nueva categoría</label>
        <div class="new-category-controls">
          <input
            [id]="id() + '-new'"
            type="text"
            maxlength="100"
            placeholder="Escribe la nueva categoría"
            [ngModel]="draft()"
            [ngModelOptions]="{ standalone: true }"
            (ngModelChange)="draft.set($event); draftError.set(null)"
            [disabled]="facade.busy()"
            (keydown.enter)="$event.preventDefault(); createCategory()"
          />
          <button
            mat-flat-button
            type="button"
            aria-label="Guardar nueva categoría"
            matTooltip="Guardar categoría"
            [disabled]="facade.busy() || !draft().trim()"
            (click)="createCategory()"
          >
            Guardar
          </button>
        </div>
        <small>Guarda la categoría para seleccionarla y usarla en próximos registros.</small>
        <div class="field-feedback" tabindex="0" role="region" aria-label="Avisos de categor?a">
          @if (draftError() || facade.error()) {
            <p class="field-error" role="alert">
              {{ draftError() || facade.fields()['nombre']?.join(' ') || facade.error() }}
            </p>
          }
        </div>
      </div>
    }
    @if (facade.list.loading()) {
      <small role="status">Cargando opciones…</small>
    }
    @if (facade.list.error(); as error) {
      <bm-alert [message]="error" /><button type="button" (click)="facade.list.reload()">
        Reintentar opciones
      </button>
    }
    @if (facade.list.count() > 20) {
      <bm-pager
        [count]="facade.list.count()"
        [page]="page()"
        [size]="20"
        [busy]="facade.list.loading()"
        (changed)="facade.list.page($event)"
      />
    }
  </div>`,
  styles: `
    .new-category {
      margin-top: 12px;
    }
    .new-category-controls {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .new-category-controls input {
      min-width: 0;
      flex: 1;
    }
    .new-category-controls button {
      flex-shrink: 0;
      height: 36px;
      min-height: 36px;
      padding-inline: 12px;
      border-radius: 8px;
    }
    small {
      display: block;
      margin-top: 6px;
      color: var(--muted);
    }
    [role='alert'] {
      color: var(--error);
    }
  `,
})
export class ReferencePicker implements OnInit {
  readonly facade = inject(CatalogFacade);
  readonly kind = input.required<Kind>();
  readonly label = input.required<string>();
  readonly id = input.required<string>();
  readonly required = input(false);
  readonly value = input('');
  readonly currentLabel = input('');
  readonly materialsOnly = input(false);
  readonly activeOnly = input(false);
  readonly allowCreate = input(false);
  readonly pending = output<boolean>();
  readonly adding = signal(false);
  readonly draft = signal('');
  readonly draftError = signal<string | null>(null);
  private readonly created = signal<CatalogRecord | null>(null);
  private readonly session = inject(SessionStore);
  readonly selected = output<CatalogRecord | null>();
  readonly changed = output<string>();
  readonly String = String;
  selectionLabel() {
    const row =
      this.facade.list.rows().find((item) => String(item.id) === this.value()) ??
      (String(this.created()?.id) === this.value() ? this.created() : null);
    if (row) return row.nombre + (row['codigo'] ? ' · ' + row['codigo'] : '');
    return this.currentLabel() || 'Selección actual (#' + this.value() + ')';
  }
  ngOnInit() {
    this.facade.configure(this.kind(), true);
    if (this.materialsOnly() || this.activeOnly()) this.facade.list.filter({ activo: 'true' });
  }
  choose(value: string) {
    if (value === '__other__') {
      if (!this.canCreate()) return;
      this.adding.set(true);
      this.pending.emit(true);
      this.changed.emit('');
      this.selected.emit(null);
      return;
    }
    this.adding.set(false);
    this.draft.set('');
    this.draftError.set(null);
    this.pending.emit(false);
    this.changed.emit(value);
    this.selected.emit(this.facade.list.rows().find((row) => String(row.id) === value) ?? null);
  }
  canCreate() {
    const model =
      this.kind() === 'categorias-servicio'
        ? 'categoriasservicio'
        : this.kind() === 'categorias-articulo'
          ? 'categoriasarticulo'
          : null;
    return this.allowCreate() && !!model && this.session.hasPermission('negocio.add_' + model);
  }
  async createCategory() {
    if (!this.canCreate() || !this.adding() || this.facade.busy()) return;
    const nombre = this.draft().trim().replace(/\s+/g, ' ');
    if (!nombre || nombre.length > 100) {
      this.draftError.set('Escribe una categoría de entre 1 y 100 caracteres.');
      return;
    }
    const saved = await this.facade.save({ nombre });
    if (!saved) return;
    this.created.set(saved);
    this.adding.set(false);
    this.draft.set('');
    this.changed.emit(String(saved.id));
    this.selected.emit(saved);
    this.pending.emit(false);
    this.facade.list.reload();
  }
  page() {
    return Number(this.facade.list.query()['page']);
  }
}
