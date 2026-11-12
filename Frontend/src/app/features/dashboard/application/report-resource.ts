import { DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, defer, EMPTY, finalize, Observable, Subject, switchMap } from 'rxjs';
import { Query, messageOf } from '../../../shared/domain/records';
export class ReportResource<T> {
  readonly data = signal<T | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly query = signal<Query>({});
  private epoch = 0;
  private readonly requests = new Subject<{ query: Query; epoch: number }>();
  constructor(loader: (query: Query) => Observable<T>) {
    this.requests
      .pipe(
        switchMap(({ query, epoch }) =>
          defer(() => loader(query)).pipe(
            catchError((error: unknown) => {
              if (epoch === this.epoch) this.error.set(messageOf(error));
              return EMPTY;
            }),
            finalize(() => {
              if (epoch === this.epoch) this.loading.set(false);
            }),
          ),
        ),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe((data) => this.data.set(data));
  }
  load(query: Query) {
    this.query.set(query);
    this.data.set(null);
    this.error.set(null);
    this.loading.set(true);
    this.requests.next({ query, epoch: ++this.epoch });
  }
  retry() {
    this.load(this.query());
  }
}
