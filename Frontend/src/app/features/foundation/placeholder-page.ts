import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { EmptyState } from '../../shared/ui/empty-state';
@Component({
  selector: 'bm-placeholder-page',
  imports: [EmptyState],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template:
    '<bm-empty-state [title]="title" [icon]="icon" description="Este módulo estará disponible en una próxima fase. Aquí no se muestran datos de negocio ni se realizan operaciones."/>',
})
export class PlaceholderPage {
  private readonly route = inject(ActivatedRoute);
  readonly title = String(this.route.snapshot.data['title'] ?? 'Estamos preparando este espacio.');
  readonly icon = String(this.route.snapshot.data['icon'] ?? 'sparkles');
}
