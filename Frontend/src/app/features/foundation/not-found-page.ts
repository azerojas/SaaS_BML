import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { EmptyState } from '../../shared/ui/empty-state';
@Component({
  selector: 'bm-not-found-page',
  imports: [EmptyState, RouterLink, MatButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template:
    '<bm-empty-state title="Este camino no lleva a tu espacio." description="La página que buscas no está disponible. Puedes volver al acceso para continuar." icon="help" eyebrow="PÁGINA NO ENCONTRADA" [back]="false"/><div class="back"><a mat-stroked-button routerLink="/login">Volver al acceso</a></div>',
  styles: '.back{text-align:center;margin-top:-2rem}',
})
export class NotFoundPage {}
