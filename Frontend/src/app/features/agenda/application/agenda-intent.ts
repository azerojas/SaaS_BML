import { effect, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { SessionStore } from '../../../core/auth/application/session-store';
import { ApiFailure } from '../../../core/http/api-failure';
import { OperationState } from '../../../shared/application/operation-state';
import { AgendaApi } from '../infrastructure/agenda-api';
import { MutationResult, WriteMethod } from '../domain/agenda';
interface Pending {
  key: string;
  path: string;
  method: WriteMethod;
  digest: string;
}
/** Persist only a UUID and SHA-256 fingerprint. No names, notes, amounts or tokens. */
@Injectable({ providedIn: 'root' })
export class AgendaIntent extends OperationState {
  private readonly api = inject(AgendaApi);
  private readonly session = inject(SessionStore);
  readonly pending = signal(false);
  private body: unknown;
  private attempt: Pending | null = null;
  private actor: number | undefined;
  constructor() {
    super();
    effect(() => {
      const actor = this.session.currentUser()?.id;
      if (this.actor === actor) return;
      this.actor = actor;
      this.body = undefined;
      this.attempt = null;
      this.pending.set(false);
      this.error.set(null);
      if (actor) {
        try {
          const raw = sessionStorage.getItem('lasheo.agenda.' + actor);
          if (raw) {
            const item = JSON.parse(raw) as Pending;
            if (
              /^[a-f\d-]{36}$/i.test(item.key) &&
              /^[a-f\d]{64}$/.test(item.digest) &&
              /^(\/api\/v1\/agenda\/|\/api\/anticipos\/)/.test(item.path) &&
              ['POST', 'PATCH', 'PUT', 'DELETE'].includes(item.method)
            ) {
              this.attempt = item;
              this.pending.set(true);
            } else throw new Error('Metadatos de operación inválidos.');
          }
        } catch {
          this.error.set(
            'No se pudo recuperar la clave de operación. No repitas reservas ni cobros; solicita revisión administrativa.',
          );
          this.pending.set(true);
        }
      }
    });
  }
  async send(
    path: string,
    body: unknown,
    method: WriteMethod = 'POST',
  ): Promise<MutationResult | null> {
    if (this.busy() || !this.actor) return null;
    this.busy.set(true);
    this.error.set(null);
    this.failure.set(null);
    this.fields.set({});
    const actor = this.actor;
    try {
      const frozen = structuredClone(body);
      const encoded = new TextEncoder().encode(JSON.stringify(frozen));
      const digest = Array.from(
        new Uint8Array(await crypto.subtle.digest('SHA-256', encoded)),
        (b) => b.toString(16).padStart(2, '0'),
      ).join('');
      if (this.actor !== actor) return null;
      if (this.pending() && !this.attempt)
        throw new Error('La operación anterior necesita revisión administrativa.');
      if (
        this.attempt &&
        (this.attempt.path !== path ||
          this.attempt.method !== method ||
          this.attempt.digest !== digest)
      )
        throw new Error(
          'Hay una operación sin respuesta. Reenvía exactamente su formulario original; no crees otra reserva ni anticipo.',
        );
      this.attempt ??= { key: crypto.randomUUID(), path, method, digest };
      sessionStorage.setItem('lasheo.agenda.' + actor, JSON.stringify(this.attempt));
      this.body = frozen;
      this.pending.set(true);
      const result = await firstValueFrom(this.api.mutate(path, frozen, this.attempt.key, method));
      if (this.actor !== actor) return null;
      sessionStorage.removeItem('lasheo.agenda.' + actor);
      this.attempt = null;
      this.body = undefined;
      this.pending.set(false);
      return result;
    } catch (error: unknown) {
      if (this.actor !== actor) return null;
      this.error.set(error instanceof Error ? error.message : 'No se pudo completar.');
      if (error instanceof ApiFailure) {
        this.fields.set(error.fields);
        this.failure.set(error);
        // These domain errors are raised inside the idempotent transaction, which rolled back.
        // Generic authentication/permission failures remain uncertain: a previous attempt may exist.
        const rolledBackPolicy =
          error.status === 403 &&
          [
            'CANCELLATION_DEADLINE',
            'HISTORICAL_BLOCK_FORBIDDEN',
            'USER_ASSIGNMENT_FORBIDDEN',
          ].includes(error.code);
        if (
          rolledBackPolicy ||
          (error.status >= 400 &&
            error.status < 500 &&
            ![401, 403, 408, 429].includes(error.status) &&
            error.code !== 'idempotencia_conflicto')
        ) {
          sessionStorage.removeItem('lasheo.agenda.' + actor);
          this.attempt = null;
          this.body = undefined;
          this.pending.set(false);
        }
      }
      return null;
    } finally {
      this.busy.set(false);
    }
  }
  retry() {
    return this.attempt && this.body !== undefined
      ? this.send(this.attempt.path, this.body, this.attempt.method)
      : Promise.resolve(null);
  }
}
