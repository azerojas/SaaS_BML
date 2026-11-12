import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { AnalyticsApi } from './analytics-api';
import { Query, messageOf } from '../../../shared/domain/records';
import { Report } from '../domain/analytics';
export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export function reportFilename(header: string | null, report: Report, query: Query): string {
  const fallback =
    'beauty_manager_reporte_' +
    report +
    '_' +
    String(query['desde']) +
    '_' +
    String(query['hasta']) +
    '.xlsx';
  const match =
    /(?:^|;)\s*filename="(beauty_manager_reporte_[a-z-]+_\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}\.xlsx)"(?:;|$)/.exec(
      header ?? '',
    );
  return match?.[1] === fallback ? match[1] : fallback;
}
@Injectable()
export class ReportDownload {
  private readonly api = inject(AnalyticsApi);
  private readonly destroy = inject(DestroyRef);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null);
  private readonly urls = new Set<string>();
  constructor() {
    this.destroy.onDestroy(() => {
      for (const url of this.urls) URL.revokeObjectURL(url);
      this.urls.clear();
    });
  }
  async save(report: Report, query: Query) {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    this.success.set(null);
    try {
      const response = await firstValueFrom(
        this.api.export(report, query).pipe(takeUntilDestroyed(this.destroy)),
      );
      const blob = response.body;
      if (
        !blob ||
        response.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== XLSX_MIME ||
        blob.size < 4 ||
        blob.size > 10 * 1024 * 1024
      )
        throw new Error(
          'El servidor no entregó un archivo Excel válido. Vuelve a consultar el reporte antes de exportar.',
        );
      const signature = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
      if (this.destroy.destroyed) return;
      if (
        signature[0] !== 0x50 ||
        signature[1] !== 0x4b ||
        signature[2] !== 3 ||
        signature[3] !== 4
      )
        throw new Error('El archivo recibido no tiene el formato XLSX esperado.');
      const filename = reportFilename(response.headers.get('Content-Disposition'), report, query);
      const url = URL.createObjectURL(blob);
      this.urls.add(url);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      anchor.rel = 'noopener';
      document.body.appendChild(anchor);
      try {
        anchor.click();
      } finally {
        anchor.remove();
        setTimeout(() => {
          if (this.urls.delete(url)) URL.revokeObjectURL(url);
        }, 1000);
      }
      this.success.set(
        'Excel generado por el servidor. La fecha final del archivo es exclusiva: ' +
          String(query['hasta']) +
          '.',
      );
    } catch (error: unknown) {
      if (!this.destroy.destroyed) this.error.set(messageOf(error));
    } finally {
      this.busy.set(false);
    }
  }
}
