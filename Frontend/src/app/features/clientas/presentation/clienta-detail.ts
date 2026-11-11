import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { SessionStore } from '../../../core/auth/application/session-store';
import { ClientasFacade } from '../application/clientas-facade';
import { Field, safeNotice } from '../../../shared/domain/records';
import { buildFields, EditorFields } from '../../../shared/ui/editor-fields';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog';
import { Alert } from '../../../shared/ui/alert';
import { Loading } from '../../../shared/ui/loading';
import { Button } from '../../../shared/ui/button';
@Component({
  selector: 'bm-clienta-detail',
  imports: [RouterLink, ReactiveFormsModule, MatButtonModule, EditorFields, Alert, Loading, Button],
  providers: [ClientasFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<a class="back-link" routerLink="/admin/clientas">← Clientas</a>
    @if (facade.loading()) {
      <bm-loading />
    }
    @if (facade.error(); as error) {
      <bm-alert [message]="error" />
    }
    @if (facade.success(); as success) {
      <bm-alert kind="info" [message]="success" />
    }
    @if (facade.record(); as client) {
      <header class="feature-heading">
        <div>
          <p class="eyebrow">FICHA PERSONAL</p>
          <h1>{{ client.nombres }} {{ client.apellidos }}</h1>
          <span class="badge" [class.inactive]="!client.activa">{{
            client.activa ? 'Activa' : 'Inactiva'
          }}</span>
        </div>
        @if (canEdit()) {
          <div class="form-actions">
            <a mat-stroked-button [routerLink]="['editar']">Editar ficha</a
            ><button mat-button type="button" [disabled]="facade.busy()" (click)="toggle()">
              {{ client.activa ? 'Desactivar' : 'Reactivar' }}
            </button>
          </div>
        }
      </header>
      <section class="surface">
        <h2>Los detalles que importan</h2>
        <dl class="details-grid">
          <div>
            <dt>Teléfono</dt>
            <dd>{{ client.telefono }}</dd>
          </div>
          <div>
            <dt>Correo electrónico</dt>
            <dd>{{ client.email || 'Sin registrar' }}</dd>
          </div>
          <div>
            <dt>Fecha de nacimiento</dt>
            <dd>{{ client.fecha_nacimiento || 'Sin registrar' }}</dd>
          </div>
          <div>
            <dt>Fecha de alta</dt>
            <dd>{{ client.creado_en }}</dd>
          </div>
          <div class="wide">
            <dt>Notas privadas</dt>
            <dd class="preserve-lines">{{ client.notas_privadas || 'Sin notas' }}</dd>
          </div>
        </dl>
      </section>
      <section class="surface section-gap">
        <h2>Consentimiento de datos</h2>
        <p>
          {{ client.consentimiento_datos ? 'Otorgado' : 'No otorgado'
          }}{{ client.consentimiento_fecha ? ' · ' + client.consentimiento_fecha : '' }}
        </p>
        @if (canEdit()) {
          @if (noticeUrl(); as url) {
            <p>
              <a [href]="url" target="_blank" rel="noopener noreferrer">Leer aviso vigente</a> ·
              Versión {{ facade.config()?.privacy_notice?.version }}
            </p>
            <form [formGroup]="consent" (ngSubmit)="saveConsent()">
              <bm-editor-fields
                prefix="consent-"
                [fields]="consentFields"
                [form]="consent"
                [errors]="facade.fields()"
              /><bm-button type="submit" [busy]="facade.busy()">Registrar consentimiento</bm-button>
            </form>
          } @else {
            <p class="muted">
              No se puede registrar consentimiento hasta que administración configure el aviso de
              privacidad vigente en Django.
            </p>
          }
        }
      </section>
      <p class="muted section-gap">
        El historial de atenciones y las métricas se incorporarán en la fase de visitas. No se
        consultan datos financieros desde esta ficha.
      </p>
    }`,
})
export class ClientaDetail {
  readonly facade = inject(ClientasFacade);
  readonly session = inject(SessionStore);
  private readonly route = inject(ActivatedRoute);
  private readonly dialog = inject(MatDialog);
  readonly consentFields: readonly Field[] = [
    {
      key: 'otorgado',
      label: 'La clienta otorga consentimiento para tratar sus datos',
      type: 'checkbox',
    },
    {
      key: 'evidencia',
      label: 'Referencia de la evidencia',
      required: true,
      max: 500,
      hint: 'Referencia no sensible del consentimiento o retiro. No copies documentos personales.',
    },
  ];
  readonly consent = buildFields(this.consentFields);
  constructor() {
    void this.facade.loadClient(Number(this.route.snapshot.paramMap.get('id')));
    void this.facade.configure();
  }
  canEdit() {
    return this.session.hasPermission('negocio.change_clientas');
  }
  noticeUrl() {
    return safeNotice(this.facade.config()?.privacy_notice.url, location.origin);
  }
  async toggle() {
    const c = this.facade.record();
    if (!c) return;
    const confirmed = await firstValueFrom(
      this.dialog
        .open(ConfirmDialog, {
          data: {
            title: c.activa ? '¿Desactivar clienta?' : '¿Reactivar clienta?',
            description: 'Se conservarán su ficha y todas las referencias históricas.',
            confirm: c.activa ? 'Desactivar' : 'Reactivar',
          },
        })
        .afterClosed(),
    );
    if (confirmed) await this.facade.active(!c.activa);
  }
  async saveConsent() {
    if (this.consent.invalid) {
      this.consent.markAllAsTouched();
      return;
    }
    const version = this.facade.config()?.privacy_notice.version;
    if (!version) return;
    const raw = this.consent.getRawValue();
    await this.facade.consent({
      otorgado: raw['otorgado'] === true,
      evidencia: String(raw['evidencia']).trim(),
      version_aviso: version,
    });
  }
}
