import { effect, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiFailure } from '../../../core/http/api-failure';
import { SessionStore } from '../../../core/auth/application/session-store';
import { FinanceApi } from '../infrastructure/finance-api';
import { FinanceResult } from '../domain/sale';
import { OperationState } from '../../../shared/application/operation-state';
interface Attempt {
  operation: string;
  target: string;
  path: string;
  body: unknown;
  method: 'POST' | 'PATCH';
  actor: number;
  key: string;
}
/** Only UUIDs persist. Payloads, amounts, references and PII remain in memory. No automatic POST retry. */
@Injectable({ providedIn: 'root' })
export class FinancialIntent extends OperationState {
  private readonly api = inject(FinanceApi);
  private readonly session = inject(SessionStore);
  readonly uncertain = signal(false);
  private attempt: Attempt | null = null;
  readonly pendingLabel = signal('');
  readonly canRetry = signal(false);
  constructor() {
    super();
    effect(() => {
      const actor = this.session.currentUser()?.id;
      if (this.attempt?.actor === actor) return;
      this.attempt = null;
      this.uncertain.set(false);
      this.error.set(null);
      this.fields.set({});
      this.canRetry.set(false);
      if (!actor) return;
      const prefix = 'lasheo.finance.' + actor + '.';
      for (let index = 0; index < sessionStorage.length; index++) {
        const name = sessionStorage.key(index);
        if (!name?.startsWith(prefix)) continue;
        const match =
          /^(visita\.(?:abrir|notas|cancelar|finalizar)|venta\.(?:crear|editar|confirmar|anular)|pago\.(?:registrar|anular)|anticipo\.aplicar)\.(new|visit-\d+|\d+)$/.exec(
            name.slice(prefix.length),
          );
        const key = sessionStorage.getItem(name);
        if (!match || !key || !/^[0-9a-f-]{36}$/i.test(key)) continue;
        this.attempt = {
          operation: match[1],
          target: match[2],
          path: '',
          method: 'POST',
          actor,
          key,
          body: null,
        };
        this.pendingLabel.set(match[1] + ' · ' + match[2]);
        this.uncertain.set(true);
        this.error.set(
          'Hay una operación pendiente de comprobación después de recargar. Consulta el resultado antes de continuar.',
        );
        break;
      }
    });
  }
  private storageKey(actor: number, operation: string, target: string) {
    return 'lasheo.finance.' + actor + '.' + operation + '.' + target;
  }
  async send(
    operation: string,
    target: string,
    path: string,
    body: unknown,
    method: 'POST' | 'PATCH' = 'POST',
  ): Promise<FinanceResult | null> {
    if (this.busy()) return null;
    const actor = this.session.currentUser()?.id;
    if (!actor) return null;
    if (this.attempt && this.attempt.actor !== actor) {
      this.attempt = null;
      this.uncertain.set(false);
    }
    if (
      this.attempt &&
      (this.attempt.operation !== operation ||
        this.attempt.target !== target ||
        (this.attempt.body !== null && JSON.stringify(this.attempt.body) !== JSON.stringify(body)))
    ) {
      this.error.set(
        'Hay una operación sin respuesta. Consulta su resultado y reintenta con la misma clave antes de iniciar otra.',
      );
      return null;
    }
    this.busy.set(true);
    this.error.set(null);
    this.fields.set({});
    const storageKey = this.storageKey(actor, operation, target);
    let key = sessionStorage.getItem(storageKey);
    let checkingStatus = !!key;
    try {
      if (key) {
        const status = await firstValueFrom(this.api.status(key, operation));
        checkingStatus = false;
        if (this.session.currentUser()?.id !== actor) return null;
        if (status.encontrado && status.resultado) {
          sessionStorage.removeItem(storageKey);
          this.attempt = null;
          this.uncertain.set(false);
          return status.resultado;
        }
      } else {
        key = crypto.randomUUID();
        sessionStorage.setItem(storageKey, key);
      }
      this.attempt = { operation, target, path, body: structuredClone(body), method, actor, key };
      this.pendingLabel.set(operation + ' · ' + target);
      this.canRetry.set(true);
      const result = await firstValueFrom(this.api.mutate(path, this.attempt.body, key, method));
      if (this.session.currentUser()?.id !== actor) return null;
      sessionStorage.removeItem(storageKey);
      this.attempt = null;
      this.uncertain.set(false);
      return result;
    } catch (error: unknown) {
      if (this.session.currentUser()?.id !== actor) return null;
      const unknown =
        checkingStatus ||
        !(error instanceof ApiFailure) ||
        error.status === 0 ||
        error.status >= 500 ||
        error.status === 401 ||
        error.status === 403;
      this.uncertain.set(
        unknown || (error instanceof ApiFailure && error.code === 'idempotencia_conflicto'),
      );
      this.error.set(
        this.uncertain()
          ? 'Respuesta no confirmada. Consulta el resultado; no registres otro cobro para reemplazarlo.'
          : error instanceof Error
            ? error.message
            : 'No se pudo completar.',
      );
      if (error instanceof ApiFailure) this.fields.set(error.fields);
      if (!this.uncertain()) {
        sessionStorage.removeItem(storageKey);
        this.attempt = null;
      }
      return null;
    } finally {
      this.busy.set(false);
    }
  }
  async recover(): Promise<FinanceResult | null> {
    const attempt = this.attempt;
    if (!attempt || attempt.actor !== this.session.currentUser()?.id || this.busy()) return null;
    this.busy.set(true);
    try {
      const status = await firstValueFrom(this.api.status(attempt.key, attempt.operation));
      if (this.session.currentUser()?.id !== attempt.actor) return null;
      if (status.encontrado && status.resultado) {
        sessionStorage.removeItem(
          this.storageKey(attempt.actor, attempt.operation, attempt.target),
        );
        this.attempt = null;
        this.uncertain.set(false);
        this.error.set(null);
        return status.resultado;
      }
      if (attempt.body === null) {
        this.uncertain.set(false);
        this.error.set(
          'Django aún no registra el resultado. Vuelve al formulario de ' +
            this.pendingLabel() +
            ' e ingresa la misma operación. Se conservará su clave; no inicies otra.',
        );
      } else
        this.error.set(
          'Django aún no registra el resultado. Puedes reintentar exactamente la misma operación con su clave.',
        );
      return null;
    } catch (error: unknown) {
      if (this.session.currentUser()?.id !== attempt.actor) return null;
      this.error.set(error instanceof Error ? error.message : 'No se pudo consultar.');
      return null;
    } finally {
      this.busy.set(false);
    }
  }
  retry() {
    const attempt = this.attempt;
    return attempt && attempt.body !== null
      ? this.send(attempt.operation, attempt.target, attempt.path, attempt.body, attempt.method)
      : Promise.resolve(null);
  }
}
