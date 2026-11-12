import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { KpiGrid } from './kpi-grid';
import { FinancialTrend } from './financial-trend';
import { ReportFilters } from './report-filters';
import { overviewFixture, seriesFixture } from '../tests/fixtures';
describe('componentes de reportes accesibles y sin cifras inventadas', () => {
  it('muestra null como no disponible y conserva cobros separados de anticipos', () => {
    const fixture = TestBed.createComponent(KpiGrid);
    fixture.componentRef.setInput('data', overviewFixture());
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector('[data-testid="kpi-dinero_recaudado"]')?.textContent).toContain(
      'No disponible',
    );
    expect(element.querySelector('[data-testid="kpi-cobros_registrados"]')?.textContent).toContain(
      'S/ 20.00',
    );
    expect(element.querySelector('[data-testid="kpi-anticipos_recibidos"]')?.textContent).toContain(
      'S/ 0.00',
    );
  });
  it('ofrece tabla completa para la gráfica con valores oficiales sin sumarlos', () => {
    const fixture = TestBed.createComponent(FinancialTrend);
    fixture.componentRef.setInput('data', seriesFixture());
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector('svg[role="img"]')).not.toBeNull();
    expect(element.querySelector('table')?.textContent).toContain('S/ 95.00');
    expect(element.querySelector('table')?.textContent).toContain('S/ 20.00');
  });
  it('no emite rangos inválidos ni aplica un formulario deshabilitado', () => {
    const fixture = TestBed.createComponent(ReportFilters);
    fixture.detectChanges();
    const values: unknown[] = [];
    fixture.componentInstance.applied.subscribe((value) => values.push(value));
    fixture.componentInstance.form.patchValue({
      preset: 'custom',
      desde: '2026-11-02',
      hasta: '2026-11-01',
    });
    fixture.componentInstance.apply();
    expect(values).toHaveLength(0);
    fixture.componentInstance.form.patchValue({ desde: '2026-10-01', hasta: '2026-10-31' });
    fixture.componentRef.setInput('disabled', true);
    fixture.componentInstance.apply();
    expect(values).toHaveLength(0);
    fixture.componentRef.setInput('disabled', false);
    fixture.componentInstance.apply();
    expect(values).toHaveLength(1);
  });
});
