import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { Icon } from './icon';
export interface Confirmation {
  title: string;
  description: string;
  confirm: string;
}
@Component({
  selector: 'bm-confirm-dialog',
  imports: [MatDialogModule, MatButtonModule, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<header>
      <h2 mat-dialog-title>{{ data.title }}</h2>
      <button
        mat-icon-button
        type="button"
        [mat-dialog-close]="false"
        cdkFocusInitial
        aria-label="Cerrar diálogo"
      >
        <bm-icon name="close" />
      </button>
    </header>
    <mat-dialog-content
      ><p>{{ data.description }}</p></mat-dialog-content
    >
    <mat-dialog-actions align="end">
      <button mat-flat-button [mat-dialog-close]="true">{{ data.confirm }}</button>
    </mat-dialog-actions>`,
  styles: `
    header {
      display: flex;
      align-items: center;
      padding-right: 1rem;
    }
    h2 {
      flex: 1;
      min-width: 0;
    }
    header button {
      flex-shrink: 0;
    }
    p {
      line-height: 1.7;
    }
    mat-dialog-actions {
      padding: 1rem 1.5rem 1.5rem;
      gap: 0.5rem;
    }
  `,
})
export class ConfirmDialog {
  readonly data = inject<Confirmation>(MAT_DIALOG_DATA);
}
