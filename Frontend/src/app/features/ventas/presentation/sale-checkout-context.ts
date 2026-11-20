import { Injectable, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';

export interface SaleCheckoutData {
  visitId: number;
  clientName: string;
}

@Injectable()
export class SaleCheckoutContext {
  readonly data = inject<SaleCheckoutData>(MAT_DIALOG_DATA);
  readonly saleId = signal<number | null>(null);
  readonly editing = signal(false);
  showSale(id: number) {
    this.saleId.set(id);
    this.editing.set(false);
  }
}
