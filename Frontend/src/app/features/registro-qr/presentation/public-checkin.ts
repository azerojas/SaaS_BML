import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { CheckinFacade } from '../application/checkin-facade';
import { phone } from '../../clientas/domain/clienta';
import { safeNotice } from '../../../shared/domain/records';
import { Alert } from '../../../shared/ui/alert';
import { Loading } from '../../../shared/ui/loading';
import { ValidationSummary } from '../../../shared/ui/validation-summary';
@Component({
  selector: 'bm-public-checkin',
  imports: [ReactiveFormsModule, MatButtonModule, Alert, Loading, ValidationSummary],
  providers: [CheckinFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="checkin-page">
    <p class="eyebrow">TU LLEGADA · LASHEO</p>
    <h1>Qué gusto recibirte.</h1>
    <p>Registra tu llegada y acércate a recepción. El equipo confirmará tu identidad en persona.</p>
    @if (facade.loading()) {
      <bm-loading />
    }
    @if (facade.error(); as error) {
      <bm-alert [message]="error" />
    }
    <bm-validation-summary [errors]="facade.fields()" />
    @if (facade.state() === 'received') {
      <section class="surface" role="status" tabindex="-1">
        <h2>Solicitud recibida</h2>
        <p>{{ facade.success() }}</p>
        <p>Este mensaje no confirma una visita ni genera cobros.</p>
      </section>
    } @else if (facade.record(); as config) {
      @if (config.aviso_privacidad.solo_pruebas) {
        <bm-alert
          kind="info"
          message="Entorno de pruebas: utiliza únicamente datos ficticios. El aviso disponible no es el aviso legal definitivo."
        />
      }
      @if (notice(config.aviso_privacidad.url); as url) {
        <form
          class="surface phase4-form"
          [formGroup]="form"
          (ngSubmit)="submit()"
          autocomplete="off"
        >
          <h2>{{ config.establecimiento }} · Registro de llegada</h2>
          <label for="checkin-phone">Teléfono</label
          ><input
            id="checkin-phone"
            formControlName="telefono"
            type="tel"
            inputmode="tel"
            maxlength="40"
            required
            aria-describedby="phone-hint"
          />
          <p id="phone-hint" class="muted">
            Celular peruano de 9 dígitos o número con prefijo internacional.
          </p>
          <label class="check-row"
            ><input type="checkbox" formControlName="alta" /> Quiero proponer mi ficha con mis
            datos</label
          >
          <p class="muted">
            Si ya tienes una ficha, puedes enviar solo tu teléfono. No se consulta ni muestra si
            está registrado.
          </p>
          @if (form.controls.alta.value) {
            <label for="checkin-names">Nombres</label
            ><input id="checkin-names" formControlName="nombres" maxlength="120" />
            <label for="checkin-surnames">Apellidos</label
            ><input id="checkin-surnames" formControlName="apellidos" maxlength="120" />
            <label class="check-row"
              ><input type="checkbox" formControlName="consentimiento" /> He leído el aviso y
              autorizo el tratamiento de mis datos para este registro.</label
            >
          }
          <a [href]="url" target="_blank" rel="noopener noreferrer"
            >Leer aviso de privacidad (versión {{ config.aviso_privacidad.version }})</a
          >
          @if (invalid) {
            <p role="alert">
              Revisa el teléfono. Para proponer una ficha, completa nombres, apellidos y
              consentimiento.
            </p>
          }
          @if (facade.cooldown() > 0) {
            <p role="status">Espera {{ facade.cooldown() }} segundos antes de reintentar.</p>
          }
          <button
            mat-flat-button
            type="submit"
            [disabled]="facade.busy() || facade.cooldown() > 0 || facade.state() === 'expired'"
          >
            {{ facade.busy() ? 'Enviando…' : 'Registrar mi llegada' }}
          </button>
        </form>
      } @else {
        <bm-alert
          message="El aviso de privacidad no está disponible de forma segura. Solicita ayuda en recepción."
        />
      }
    } @else if (!facade.loading()) {
      @if (facade.state() === 'expired' || !hasToken()) {
        <p>Este enlace QR no está disponible. Solicita el código vigente en recepción.</p>
      } @else {
        <p>
          No pudimos cargar el formulario. Puedes volver a consultar o pedir ayuda en recepción.
        </p>
        @if (facade.cooldown() > 0) {
          <p role="status">Espera {{ facade.cooldown() }} segundos antes de reintentar.</p>
        }
        <button
          mat-stroked-button
          type="button"
          [disabled]="facade.busy() || facade.cooldown() > 0"
          (click)="reload()"
        >
          Volver a cargar formulario
        </button>
      }
    }
  </div>`,
})
export class PublicCheckin {
  readonly facade = inject(CheckinFacade);
  private readonly fb = inject(FormBuilder);
  private token = '';
  invalid = false;
  readonly form = this.fb.nonNullable.group({
    telefono: ['', [Validators.required, Validators.maxLength(40)]],
    alta: false,
    nombres: ['', Validators.maxLength(120)],
    apellidos: ['', Validators.maxLength(120)],
    consentimiento: false,
  });
  readonly notice = (url: string) => safeNotice(url, location.origin);
  hasToken() {
    return this.token !== '';
  }
  reload() {
    if (this.token) void this.facade.get(this.token);
  }
  constructor() {
    inject(ActivatedRoute)
      .paramMap.pipe(takeUntilDestroyed())
      .subscribe((params) => {
        this.token = params.get('token') ?? '';
        this.form.reset();
        this.facade.state.set('idle');
        if (this.token) void this.facade.get(this.token);
      });
  }
  async submit() {
    const raw = this.form.getRawValue();
    const telefono = phone(raw.telefono);
    this.invalid =
      !telefono ||
      this.form.invalid ||
      (raw.alta && (!raw.nombres.trim() || !raw.apellidos.trim() || !raw.consentimiento));
    if (this.invalid || !telefono || !this.token) return;
    const version = this.facade.record()?.aviso_privacidad.version;
    await this.facade.submit(
      this.token,
      raw.alta
        ? {
            telefono,
            nombres: raw.nombres.trim(),
            apellidos: raw.apellidos.trim(),
            consentimiento_datos: true,
            version_aviso: version,
          }
        : { telefono },
    );
    if (this.facade.state() === 'received') this.form.reset();
  }
}
