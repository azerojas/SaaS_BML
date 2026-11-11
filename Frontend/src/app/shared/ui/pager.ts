import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
@Component({
  selector: 'bm-pager',
  imports: [MatButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<nav class="pager" aria-label="Paginación">
    <span>{{ count() }} registros · Página {{ page() }}</span>
    <div>
      <button
        mat-stroked-button
        type="button"
        [disabled]="page() <= 1 || busy()"
        (click)="changed.emit(page() - 1)"
      >
        Anterior</button
      ><button
        mat-stroked-button
        type="button"
        [disabled]="page() * size() >= count() || busy()"
        (click)="changed.emit(page() + 1)"
      >
        Siguiente
      </button>
    </div>
  </nav>`,
})
export class Pager {
  readonly count = input.required<number>();
  readonly page = input(1);
  readonly size = input(20);
  readonly busy = input(false);
  readonly changed = output<number>();
}
