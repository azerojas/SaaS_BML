import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { ReportChart } from './report-chart';
import { envelopeFixture, overviewFixture, seriesFixture } from '../tests/fixtures';

describe('gráficos de reportes', () => {
  it('mantiene la dona visible cuando no hay costos ni gastos registrados', () => {
    const fixture = TestBed.createComponent(ReportChart);
    fixture.componentRef.setInput('report', 'overview');
    fixture.componentRef.setInput('overview', {
      ...overviewFixture(),
      indicadores: { costo_directo: '0.00', comisiones: '0.00', gastos_operativos: '0.00' },
    });
    fixture.detectChanges();
    const donut = fixture.nativeElement.querySelector(
      'bm-report-distribution .donut',
    ) as HTMLElement;
    expect(donut.textContent).toContain('Sin movimientos');
    expect(donut.style.background).not.toContain('NaN');
    expect(fixture.nativeElement.querySelector('bm-report-distribution').textContent).not.toContain(
      'NaN %',
    );
  });
  it('la vista general presenta exactamente cuatro tarjetas antes de barras y dona', () => {
    const fixture = TestBed.createComponent(ReportChart);
    fixture.componentRef.setInput('report', 'overview');
    fixture.componentRef.setInput('overview', overviewFixture());
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const cards = host.querySelectorAll('.overview-metrics .metric');
    expect(cards).toHaveLength(4);
    expect([...cards].map((card) => card.querySelector('strong')?.textContent?.trim())).toEqual([
      'S/ 95.00',
      'S/ 68.80',
      'S/ 20.00',
      'S/ 46.00',
    ]);
    const metrics = host.querySelector('.overview-metrics')!;
    const charts = host.querySelector('.report-chart-grid')!;
    expect(metrics.compareDocumentPosition(charts) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(host.querySelectorAll('figure')).toHaveLength(2);
    expect(host.querySelectorAll('.chart-bar')).toHaveLength(7);
    const vertical = host.querySelector('.vertical-bars .chart-bar') as HTMLElement;
    expect(vertical.style.height).toBe('100%');
    expect(vertical.style.width).toBe('');
    const donut = host.querySelector('bm-report-distribution .donut');
    expect(donut?.getAttribute('aria-label')).toContain('Gráfico de dona');
    expect(donut?.children).toHaveLength(1);
  });
  it('muestra barras y líneas con puntos simultáneamente para la evolución', () => {
    const fixture = TestBed.createComponent(ReportChart);
    fixture.componentRef.setInput('report', 'revenue-series');
    fixture.componentRef.setInput('series', seriesFixture());
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('svg circle')).toHaveLength(3);
    expect(fixture.nativeElement.querySelector('table')).toBeNull();
    expect(fixture.nativeElement.querySelectorAll('.chart-bar')).toHaveLength(3);
    expect(fixture.nativeElement.querySelectorAll('figure')).toHaveLength(2);
    expect(fixture.nativeElement.querySelectorAll('.metric')).toHaveLength(0);
  });
  it('muestra barras y dos donas separadas para cobros y anticipos', () => {
    const fixture = TestBed.createComponent(ReportChart);
    fixture.componentRef.setInput('report', 'payment-methods');
    fixture.componentRef.setInput('methods', {
      ...envelopeFixture,
      componentes_separados: true,
      results: [
        {
          metodo: 'Efectivo',
          cobros_registrados: '30.00',
          anticipos_recibidos: '0.00',
          pagos_count: 1,
          anticipos_count: 0,
        },
        {
          metodo: 'Yape',
          cobros_registrados: '10.00',
          anticipos_recibidos: '20.00',
          pagos_count: 1,
          anticipos_count: 1,
        },
      ],
    });
    fixture.detectChanges();
    const donuts = fixture.nativeElement.querySelectorAll('.donut');
    expect(donuts).toHaveLength(2);
    expect(donuts[0].getAttribute('aria-label')).toContain('cobros registrados');
    expect(donuts[1].getAttribute('aria-label')).toContain('anticipos recibidos');
    const lists = fixture.nativeElement.querySelectorAll('.method-list');
    expect(lists[0].textContent).toContain('75 %');
    expect(lists[1].textContent).toContain('100 %');
    expect(fixture.nativeElement.querySelectorAll('.chart-bar')).toHaveLength(4);
    expect(fixture.nativeElement.querySelector('table')).toBeNull();
    expect(fixture.nativeElement.querySelectorAll('.metric')).toHaveLength(0);
    fixture.componentRef.setInput('report', 'overview');
    fixture.componentRef.setInput('overview', overviewFixture());
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('bm-dashboard-methods')).toHaveLength(0);
    expect(fixture.nativeElement.querySelectorAll('figure')).toHaveLength(2);
    expect(fixture.nativeElement.querySelector('bm-report-distribution .donut')).not.toBeNull();
    expect(fixture.nativeElement.querySelectorAll('.chart-bar')).toHaveLength(7);
  });
  for (const report of ['top-services', 'top-clients', 'expenses'] as const) {
    it(`muestra barras y distribución para ${report} sin atribuir el porcentaje a grupos no cargados`, () => {
      const fixture = TestBed.createComponent(ReportChart);
      fixture.componentRef.setInput('report', report);
      fixture.componentRef.setInput('table', {
        ...envelopeFixture,
        count: 3,
        total_grupos: 3,
        next: 'next',
        previous: null,
        results: [
          {
            descripcion_snapshot: 'Tratamiento A',
            nombre: 'Clienta A',
            categoria: 'Categoría A',
            ingreso: '30.00',
            ventas_confirmadas: '30.00',
            monto: '30.00',
          },
          {
            descripcion_snapshot: 'Tratamiento B',
            nombre: 'Clienta B',
            categoria: 'Categoría B',
            ingreso: '10.00',
            ventas_confirmadas: '10.00',
            monto: '10.00',
          },
        ],
      });
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelectorAll('figure')).toHaveLength(2);
      expect(fixture.nativeElement.querySelectorAll('.chart-bar')).toHaveLength(2);
      expect(fixture.nativeElement.querySelector('.donut')).not.toBeNull();
      expect(fixture.nativeElement.querySelector('bm-report-distribution').textContent).toContain(
        '75 %',
      );
      expect(fixture.nativeElement.textContent).toContain(
        'La distribución corresponde a esta selección',
      );
    });
  }
  it('no convierte costos no disponibles o negativos en participaciones de una dona', () => {
    const fixture = TestBed.createComponent(ReportChart);
    fixture.componentRef.setInput('report', 'overview');
    fixture.componentRef.setInput('overview', {
      ...overviewFixture(),
      indicadores: { costo_directo: '10.00', comisiones: null, gastos_operativos: '-2.00' },
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('figure')).toHaveLength(2);
    const donut = fixture.nativeElement.querySelector(
      'bm-report-distribution .donut',
    ) as HTMLElement;
    expect(donut).not.toBeNull();
    expect(donut.textContent).toContain('No disponible');
    expect(donut.style.background).not.toContain('NaN');
    expect(fixture.nativeElement.querySelector('bm-report-distribution').textContent).toContain(
      'todos los importes disponibles',
    );
  });
  it('conserva importes no disponibles sin presentarlos como cero', () => {
    const fixture = TestBed.createComponent(ReportChart);
    fixture.componentRef.setInput('report', 'overview');
    fixture.componentRef.setInput('overview', {
      ...overviewFixture(),
      indicadores: { ...overviewFixture().indicadores, utilidad_estimada: null },
    });
    fixture.detectChanges();
    const row = [...fixture.nativeElement.querySelectorAll('.chart-row')].find((element: unknown) =>
      (element as HTMLElement).textContent?.includes('Utilidad estimada'),
    ) as HTMLElement;
    expect(row.textContent).toContain('No disponible');
    expect(row.textContent).not.toContain('S/ 0.00');
  });
  it('dibuja los importes negativos hacia la izquierda del cero y conserva el signo', () => {
    const fixture = TestBed.createComponent(ReportChart);
    fixture.componentRef.setInput('report', 'overview');
    fixture.componentRef.setInput('overview', {
      ...overviewFixture(),
      indicadores: { utilidad_estimada: '-10.00', ventas_confirmadas: '20.00' },
    });
    fixture.detectChanges();
    expect(fixture.componentInstance.signed()).toBe(true);
    expect(fixture.componentInstance.left('-10.00')).toBe(25);
    expect(fixture.componentInstance.format('-10.00')).toBe('−S/ 10.00');
    const rows = [...fixture.nativeElement.querySelectorAll('.chart-row')] as HTMLElement[];
    const negative = rows
      .find((row) => row.textContent?.includes('Utilidad estimada'))!
      .querySelector('.chart-bar') as HTMLElement;
    expect(negative.style.bottom).toBe('25%');
    expect(negative.style.height).toBe('25%');
  });
  it('el inventario grafica cantidades de artículos y no suma unidades diferentes', () => {
    const fixture = TestBed.createComponent(ReportChart);
    fixture.componentRef.setInput('report', 'inventory-alerts');
    fixture.componentRef.setInput('table', {
      ...envelopeFixture,
      count: 2,
      total_grupos: 2,
      next: null,
      previous: null,
      estadisticas: { articulos_activos: 4, stock_bajo: 2, sin_existencia: 1, stock_negativo: 0 },
      results: [
        { nombre: 'Pegamento', existencia: '50.000', unidad: 'ML' },
        { nombre: 'Pestañas', existencia: '3.000', unidad: 'UND' },
      ],
    });
    fixture.detectChanges();
    expect(fixture.componentInstance.rows().map((row) => row.values[0].value)).toEqual([
      4, 2, 1, 0,
    ]);
    expect(fixture.nativeElement.textContent).not.toContain('S/');
    expect(fixture.nativeElement.querySelectorAll('figure')).toHaveLength(2);
    expect(fixture.componentInstance.inventoryRates().map((item) => item.rate)).toEqual([
      50, 25, 0,
    ]);
    expect(fixture.nativeElement.textContent).toContain('los porcentajes no se suman');
  });
});
