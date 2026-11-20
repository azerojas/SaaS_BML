import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { Observable } from 'rxjs';
import { RecordState } from '../application/operation-state';
import { Alert } from './alert';
import { Loading } from './loading';
import { Icon } from './icon';

export interface PreviewField {
  label: string;
  value: string;
  icon?: string;
}
export interface PreviewContent {
  fields: PreviewField[];
  note?: string;
  kind?: 'supplier' | 'stock' | 'movement';
  status?: { label: string; positive: boolean };
  metrics?: { label: string; value: string; icon: string }[];
  links?: { label: string; href: string; icon: string }[];
  stock?: { current: number; minimum: number; unit: string };
}
export interface PreviewData {
  title: string;
  subtitle?: string;
  load: () => Observable<PreviewContent>;
  action?: { label: string; run: () => void };
}

@Component({
  selector: 'bm-record-preview',
  imports: [MatDialogModule, MatButtonModule, Alert, Loading, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './record-preview.html',
  styleUrl: './record-preview.scss',
})
export class RecordPreview {
  private readonly ref = inject(MatDialogRef<RecordPreview>);
  actionBusy = false;
  readonly data = inject<PreviewData>(MAT_DIALOG_DATA);
  readonly state = new RecordState<PreviewContent>();
  initials() {
    return this.data.title
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase();
  }
  stockLevel(current: number, minimum: number) {
    return Math.max(0, Math.min(100, (current / minimum) * 100));
  }
  constructor() {
    this.load();
  }
  load() {
    void this.state.load(this.data.load());
  }
  runAction() {
    const action = this.data.action;
    if (!action || this.actionBusy) return;
    this.actionBusy = true;
    this.ref.afterClosed().subscribe(() => action.run());
    this.ref.close();
  }
}
