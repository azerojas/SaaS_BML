import { DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  Subject,
  catchError,
  debounceTime,
  defer,
  EMPTY,
  finalize,
  map,
  Observable,
  switchMap,
} from 'rxjs';
import { Page, Query, messageOf } from '../domain/records';
export class PagedState<T> {
  readonly rows = signal<readonly T[]>([]);
  readonly count = signal(0);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly query = signal<Query>({ page: 1, page_size: 20 });
  private readonly changes = new Subject<Query>();
  constructor(loader: (query: Query) => Observable<Page<T>>, automatic = true) {
    this.changes
      .pipe(
        debounceTime(300),
        switchMap((query) =>
          defer(() => {
            this.loading.set(true);
            this.error.set(null);
            return loader(query).pipe(
              map((page) => ({ page, query })),
              catchError((error: unknown) => {
                if (query === this.query()) this.error.set(messageOf(error));
                return EMPTY;
              }),
              finalize(() => {
                if (query === this.query()) this.loading.set(false);
              }),
            );
          }),
        ),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe(({ page, query }) => {
        if (query === this.query()) {
          this.rows.set(page.results);
          this.count.set(page.count);
        }
      });
    if (automatic) this.reload();
  }
  filter(values: Query) {
    this.query.update((old) => ({ ...old, ...values, page: 1 }));
    this.reload();
  }
  page(value: number) {
    this.query.update((old) => ({ ...old, page: value }));
    this.reload();
  }
  reload() {
    this.loading.set(true);
    this.changes.next(this.query());
  }
}
