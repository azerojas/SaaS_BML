import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
export interface Confirmation {
  title: string;
  description: string;
  confirm: string;
}
@Component({
  selector: 'bm-confirm-dialog',
  imports: [MatDialogModule, MatButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template:
    '<h2 mat-dialog-title>{{ data.title }}</h2><mat-dialog-content><p>{{ data.description }}</p></mat-dialog-content><mat-dialog-actions align="end"><button mat-button [mat-dialog-close]="false" cdkFocusInitial>Volver</button><button mat-flat-button [mat-dialog-close]="true">{{ data.confirm }}</button></mat-dialog-actions>',
  styles: 'p{line-height:1.7}mat-dialog-actions{padding:1rem 1.5rem 1.5rem;gap:.5rem}',
})
export class ConfirmDialog {
  readonly data = inject<Confirmation>(MAT_DIALOG_DATA);
}
