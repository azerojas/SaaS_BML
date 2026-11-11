import { DestroyRef, inject, signal } from '@angular/core';
import { firstValueFrom, Observable } from 'rxjs';
import { ApiFailure } from '../../core/http/api-failure';
import { messageOf } from '../domain/records';
export class OperationState {
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly fields = signal<Readonly<Record<string, readonly string[]>>>({});
  readonly success = signal<string | null>(null);
  readonly failure = signal<ApiFailure | null>(null);
  async run<T>(source: Observable<T>): Promise<T | null> {
    if (this.busy()) return null;
    this.busy.set(true);
    this.error.set(null);
    this.fields.set({});
    this.success.set(null);
    this.failure.set(null);
    try {
      return await firstValueFrom(source);
    } catch (error: unknown) {
      this.error.set(messageOf(error));
      if (error instanceof ApiFailure) {
        this.fields.set(error.fields);
        this.failure.set(error);
      }
      return null;
    } finally {
      this.busy.set(false);
    }
  }
}
export class RecordState<T> extends OperationState {
  readonly record = signal<T | null>(null);
  readonly loading = signal(false);
  private epoch = 0;
  constructor() {
    super();
    inject(DestroyRef).onDestroy(() => {
      this.epoch++;
    });
  }
  async load(source: Observable<T>) {
    const epoch = ++this.epoch;
    this.loading.set(true);
    this.error.set(null);
    this.record.set(null);
    try {
      const record = await firstValueFrom(source);
      if (epoch === this.epoch) this.record.set(record);
    } catch (error: unknown) {
      if (epoch === this.epoch) this.error.set(messageOf(error));
    } finally {
      if (epoch === this.epoch) this.loading.set(false);
    }
  }
}
