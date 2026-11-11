import { ChangeDetectionStrategy, Component } from '@angular/core';
import { EmptyState } from '../../shared/ui/empty-state';
@Component({
  selector: 'bm-public-page',
  imports: [EmptyState],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template:
    '<bm-empty-state title="Un espacio para darte la bienvenida." description="El registro de llegada estará disponible en una próxima fase. Por ahora, acércate al equipo del salón para que te acompañe." icon="sparkles" eyebrow="QUÉ BUENO TENERTE AQUÍ" [back]="false"/>',
})
export class PublicPage {}
