import { signal } from '@angular/core';
import { Observable } from 'rxjs';
import { OperationState } from './operation-state';
/** Stores only a non-secret operation UUID per tab/user. Never payloads, PII or credentials. */
export class IntentState<T, R> extends OperationState {
  readonly key = signal<string | null>(null);
  readonly uncertain = signal(false);
  readonly result = signal<R | null>(null);
  readonly needsRecovery = signal(false);
  readonly body = signal<T | null>(null);
  private readonly storageKey: string;
  constructor(scope: 'purchase' | 'adjustment', actorId: number) {
    super();
    this.storageKey = 'lasheo.pending.' + scope + '.' + actorId;
    const key = sessionStorage.getItem(this.storageKey);
    if (key && /^[0-9a-f-]{36}$/i.test(key)) {
      this.key.set(key);
      this.needsRecovery.set(true);
    }
  }
  async send(payload: T, request: (body: T, key: string) => Observable<R>): Promise<R | null> {
    if (this.busy() || this.needsRecovery()) return null;
    if (this.result()) return this.result();
    if (this.uncertain() && JSON.stringify(payload) !== JSON.stringify(this.body())) {
      this.error.set(
        'La operación anterior no está confirmada. Reintenta su mismo contenido o consulta el estado.',
      );
      return null;
    }
    if (!this.key()) {
      const key = crypto.randomUUID();
      sessionStorage.setItem(this.storageKey, key);
      this.key.set(key);
    }
    this.body.set(structuredClone(payload));
    const result = await this.run(request(this.body()!, this.key()!));
    if (result !== null) {
      this.accept(result);
    } else {
      const failure = this.failure();
      this.uncertain.set(!failure || failure.status === 0 || failure.status >= 500);
    }
    return result;
  }
  accept(result: R) {
    this.result.set(result);
    this.uncertain.set(false);
    this.needsRecovery.set(false);
    sessionStorage.removeItem(this.storageKey);
  }
  notFound() {
    this.needsRecovery.set(false);
    this.uncertain.set(false);
    this.error.set(null);
  }
  reset() {
    if (this.uncertain() || this.needsRecovery()) return;
    sessionStorage.removeItem(this.storageKey);
    this.key.set(null);
    this.body.set(null);
    this.result.set(null);
    this.error.set(null);
    this.fields.set({});
  }
}
