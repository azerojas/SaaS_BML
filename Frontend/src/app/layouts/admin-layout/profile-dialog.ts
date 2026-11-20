import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { SessionStore } from '../../core/auth/application/session-store';
import { Icon } from '../../shared/ui/icon';
import { Alert } from '../../shared/ui/alert';
import { signal } from '@angular/core';

export interface ProfilePreferences {
  compact: boolean;
  showUsername: boolean;
}
export function profilePreferences(userId: number | undefined): ProfilePreferences {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem('lasheo.ui.profile.' + userId) ?? '{}');
    if (stored && typeof stored === 'object')
      return {
        compact: 'compact' in stored && stored.compact === true,
        showUsername: 'showUsername' in stored && stored.showUsername === true,
      };
  } catch {
    /* Display preferences are optional; access never depends on browser storage. */
  }
  return { compact: false, showUsername: false };
}

@Component({
  selector: 'bm-profile-dialog',
  imports: [ReactiveFormsModule, MatDialogModule, MatButtonModule, Icon, Alert],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="profile-heading">
      <span class="profile-symbol"><bm-icon name="users" /></span>
      <div>
        <p>MI CUENTA</p>
        <h2 mat-dialog-title>Configurar perfil</h2>
      </div>
      <button
        class="profile-close"
        mat-icon-button
        type="button"
        mat-dialog-close
        aria-label="Cerrar perfil"
      >
        <bm-icon name="close" />
      </button>
    </div>
    <mat-dialog-content>
      <section class="account-details" aria-label="Datos de la cuenta">
        <div>
          <span>Nombre</span><strong>{{ session.displayName() }}</strong>
        </div>
        <div>
          <span>Usuario</span><strong>{{ session.currentUser()?.username }}</strong>
        </div>
        <div><span>Acceso</span><strong>Administración del salón</strong></div>
      </section>
      <form [formGroup]="form" id="profile-preferences" (ngSubmit)="save()">
        <h3>Preferencias de visualización</h3>
        <p class="description">Personaliza tu espacio de trabajo en este dispositivo.</p>
        <label class="preference"
          ><input type="checkbox" formControlName="compact" /><span
            ><strong>Vista compacta</strong
            ><small>Reduce el espacio de la cabecera y el área de trabajo.</small></span
          ></label
        >
        <label class="preference"
          ><input type="checkbox" formControlName="showUsername" /><span
            ><strong>Mostrar mi nombre de usuario</strong
            ><small>Úsalo en la cabecera en lugar de tu nombre completo.</small></span
          ></label
        >
        @if (error()) {
          <bm-alert [message]="error()" />
        }
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end"
      ><button mat-flat-button type="submit" form="profile-preferences">
        Guardar preferencias
      </button></mat-dialog-actions
    >`,
  styles: `
    :host {
      display: block;
    }
    .profile-heading {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 1.5rem 1.5rem 0;
    }
    .profile-heading > div {
      min-width: 0;
    }
    .profile-close {
      margin-left: auto;
      flex-shrink: 0;
    }
    .profile-symbol {
      display: grid;
      place-items: center;
      width: 44px;
      height: 44px;
      background: var(--sage);
      color: var(--forest);
      border-radius: 12px;
      flex-shrink: 0;
    }
    .profile-heading p {
      font-size: 0.6rem;
      font-weight: 750;
      letter-spacing: 0.15em;
      color: var(--muted);
      margin: 0 0 0.3rem;
    }
    h2[mat-dialog-title] {
      padding: 0;
      font-size: 1.35rem;
      letter-spacing: -0.035em;
      line-height: 1.5;
    }
    h2:before {
      display: none;
    }
    .account-details {
      background: var(--canvas);
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 1rem;
      margin: 1.3rem 0 1.5rem;
    }
    .account-details > div {
      display: flex;
      justify-content: space-between;
      gap: 1rem;
      font-size: 0.75rem;
      line-height: 1.8;
    }
    .account-details > div + div {
      margin-top: 0.6rem;
    }
    .account-details span {
      color: var(--muted);
      flex-shrink: 0;
    }
    .account-details strong {
      text-align: right;
      font-weight: 600;
      overflow-wrap: anywhere;
      min-width: 0;
    }
    h3 {
      font-size: 0.9rem;
      margin: 0 0 0.4rem;
    }
    .description {
      color: var(--muted);
      font-size: 0.76rem;
      line-height: 1.8;
      margin: 0 0 1rem;
    }
    .preference {
      display: flex;
      align-items: flex-start;
      gap: 0.75rem;
      padding: 1rem 0;
      border-top: 1px solid var(--line);
    }
    .preference input {
      width: 18px;
      height: 18px;
      accent-color: var(--forest);
      margin-top: 0.1rem;
      flex-shrink: 0;
    }
    .preference strong {
      display: block;
      font-size: 0.78rem;
      font-weight: 650;
      line-height: 1.5;
    }
    .preference small {
      display: block;
      color: var(--muted);
      font-size: 0.71rem;
      line-height: 1.7;
      margin-top: 0.3rem;
    }
    mat-dialog-actions {
      padding: 1rem 1.5rem 1.4rem;
      gap: 0.5rem;
    }
    @media (max-width: 400px) {
      .account-details > div {
        flex-direction: column;
        gap: 0.1rem;
      }
      .account-details strong {
        text-align: left;
      }
    }
  `,
})
export class ProfileDialog {
  readonly session = inject(SessionStore);
  private readonly ref = inject(MatDialogRef<ProfileDialog, ProfilePreferences>);
  readonly initial = inject<ProfilePreferences>(MAT_DIALOG_DATA);
  readonly error = signal('');
  readonly form = inject(FormBuilder).nonNullable.group({
    compact: this.initial.compact,
    showUsername: this.initial.showUsername,
  });
  save() {
    const value = this.form.getRawValue();
    try {
      localStorage.setItem(
        'lasheo.ui.profile.' + this.session.currentUser()!.id,
        JSON.stringify(value),
      );
    } catch {
      this.error.set(
        'No se pudieron guardar las preferencias en este dispositivo. Revisa los permisos del navegador.',
      );
      return;
    }
    this.ref.close(value);
  }
}
