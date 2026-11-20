import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { VisitDetail } from './visit-detail';
import { catchError, debounceTime, forkJoin, map, merge, of, switchMap } from 'rxjs';
import { VisitsFacade } from '../application/visits-facade';
import { VisitsApi } from '../infrastructure/visits-api';
import { Visit } from '../domain/visit';
import { ClientasApi } from '../../clientas/infrastructure/clientas-api';
import { SessionStore } from '../../../core/auth/application/session-store';
import { Alert } from '../../../shared/ui/alert';
import { Loading } from '../../../shared/ui/loading';
import { Pager } from '../../../shared/ui/pager';
import { DateField } from '../../../shared/ui/date-field';
import { Icon } from '../../../shared/ui/icon';
import { dateLima } from '../../inventario/domain/inventory';

@Component({
  selector: 'bm-visits-list',
  imports: [RouterLink, ReactiveFormsModule, Alert, Loading, Pager, DateField, Icon],
  providers: [VisitsFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './visits-list.html',
  styleUrl: './visits-list.scss',
})
export class VisitsList {
  readonly facade = inject(VisitsFacade);
  readonly session = inject(SessionStore);
  private readonly api = inject(VisitsApi);
  private readonly clients = inject(ClientasApi);
  private readonly dialog = inject(MatDialog);
  private readonly destroy = inject(DestroyRef);
  openVisit(row: Visit) {
    this.dialog
      .open(VisitDetail, {
        width: '820px',
        maxWidth: '96vw',
        maxHeight: '94dvh',
        data: { id: row.id, clientName: this.clientName(row) },
      })
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe(() => this.refresh());
  }
  readonly date = dateLima;
  readonly Number = Number;
  readonly today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(
    new Date(),
  );
  readonly todayLabel = new Intl.DateTimeFormat('es-PE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Lima',
  }).format(new Date());
  readonly form = inject(FormBuilder).nonNullable.group({
    estado: '',
    desde: this.today,
    hasta: this.today,
  });
  readonly search = signal('');
  readonly names = signal<Record<number, string>>({});
  readonly totals = signal<{
    total: number;
    open: number;
    finished: number;
    cancelled: number;
  } | null>(null);
  readonly updatedAt = signal('');
  readonly dateError = signal('');
  private readonly revision = signal(0);
  private readonly summaryQuery = computed(
    () => ({
      desde: this.facade.list.query()['desde'] ?? '',
      hasta: this.facade.list.query()['hasta'] ?? '',
      revision: this.revision(),
    }),
    { equal: (a, b) => a.desde === b.desde && a.hasta === b.hasta && a.revision === b.revision },
  );
  readonly tabs = [
    { value: '', label: 'Todas' },
    { value: 'ABIERTA', label: 'En atención' },
    { value: 'FINALIZADA', label: 'Finalizadas' },
    { value: 'CANCELADA', label: 'Canceladas' },
  ];
  readonly visibleRows = computed(() => {
    const search = this.normalize(this.search().trim());
    return this.facade.list
      .rows()
      .filter((row) =>
        this.normalize(
          `${this.clientName(row)} #VIS-${row.id} #${row.id} ${row.clienta_id}`,
        ).includes(search),
      );
  });
  readonly averageDuration = computed(() => {
    const durations = this.facade.list
      .rows()
      .filter((row) => row.estado === 'FINALIZADA' && row.fin_en)
      .map((row) => (Date.parse(row.fin_en!) - Date.parse(row.inicio_en)) / 60000)
      .filter((value) => Number.isFinite(value) && value >= 0);
    return durations.length
      ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length)
      : null;
  });

  constructor() {
    merge(this.form.controls.desde.valueChanges, this.form.controls.hasta.valueChanges)
      .pipe(debounceTime(250), takeUntilDestroyed())
      .subscribe(() => this.filter());
    // Resolve only current-page clients and respect client-record permissions.
    toObservable(this.facade.list.rows)
      .pipe(
        switchMap((rows) => {
          if (!this.session.hasPermission('negocio.view_clientas') || !rows.length) return of({});
          return forkJoin(
            [...new Set(rows.map((row) => row.clienta_id))].map((id) =>
              this.clients.get(id).pipe(
                map((client) => [id, `${client.nombres} ${client.apellidos}`] as const),
                catchError(() => of([id, `Ficha #${id}`] as const)),
              ),
            ),
          ).pipe(map((entries) => Object.fromEntries(entries)));
        }),
        takeUntilDestroyed(),
      )
      .subscribe((names) => this.names.set(names));
    // Totals cover the whole period, independently of the active tab and page.
    toObservable(this.summaryQuery)
      .pipe(
        switchMap(({ desde, hasta }) => {
          this.totals.set(null);
          return forkJoin(
            ['ABIERTA', 'FINALIZADA', 'CANCELADA'].map((estado) =>
              this.api.list({
                ...(desde ? { desde } : {}),
                ...(hasta ? { hasta } : {}),
                estado,
                page: 1,
                page_size: 1,
              }),
            ),
          ).pipe(
            map(([open, finished, cancelled]) => ({
              total: open.count + finished.count + cancelled.count,
              open: open.count,
              finished: finished.count,
              cancelled: cancelled.count,
            })),
            catchError(() => of(null)),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((totals) => this.totals.set(totals));
    toObservable(this.facade.list.loading)
      .pipe(takeUntilDestroyed())
      .subscribe((loading) => {
        if (!loading && !this.facade.list.error()) {
          this.updatedAt.set(
            new Intl.DateTimeFormat('es-PE', {
              hour: '2-digit',
              minute: '2-digit',
              timeZone: 'America/Lima',
            }).format(new Date()),
          );
        }
      });
    this.filter();
  }

  filter() {
    if (this.form.invalid) {
      this.dateError.set('Revisa las fechas del período antes de consultar.');
      return;
    }
    const values = this.form.getRawValue();
    if (values.desde && values.hasta && values.desde > values.hasta) {
      this.dateError.set('La fecha Desde debe ser anterior o igual a Hasta.');
      return;
    }
    this.dateError.set('');
    this.search.set('');
    this.facade.list.query.set({
      page: 1,
      page_size: 20,
      ...Object.fromEntries(Object.entries(values).filter(([, value]) => value !== '')),
    });
    this.facade.list.reload();
  }
  selectStatus(status: string) {
    this.form.controls.estado.setValue(status);
    this.filter();
  }
  refresh() {
    this.facade.list.reload();
    this.revision.update((value) => value + 1);
  }
  clientName(row: Visit) {
    return this.names()[row.clienta_id] || `Ficha #${row.clienta_id}`;
  }
  initials(row: Visit) {
    const name = this.names()[row.clienta_id];
    return name && !name.startsWith('Ficha #')
      ? name
          .split(' ')
          .filter(Boolean)
          .slice(0, 2)
          .map((part) => part[0])
          .join('')
          .toUpperCase()
      : 'CL';
  }
  statusLabel(row: Visit) {
    return row.estado === 'ABIERTA'
      ? 'En atención'
      : row.estado === 'FINALIZADA'
        ? 'Finalizada'
        : 'Cancelada';
  }
  tabCount(value: string) {
    const totals = this.totals();
    if (!totals) return '—';
    return value === 'ABIERTA'
      ? totals.open
      : value === 'FINALIZADA'
        ? totals.finished
        : value === 'CANCELADA'
          ? totals.cancelled
          : totals.total;
  }
  private normalize(value: string) {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }
}
