import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { PaymentForm } from './payment-form';
import { ConsumptionReview } from './consumption-review';
import { SaleDetail } from '../domain/sale';
describe('formularios de caja y consumo real', () => {
  it('exige monto decimal positivo, verificación manual y referencia no efectiva', () => {
    const fixture = TestBed.createComponent(PaymentForm);
    fixture.detectChanges();
    const page = fixture.componentInstance;
    const emissions: unknown[] = [];
    page.submitted.subscribe((value) => emissions.push(value));
    page.form.patchValue({ metodo: 'YAPE', monto: '10.00', verificado: true });
    page.submit();
    expect(emissions).toHaveLength(0);
    page.form.controls.referencia.setValue(' op-test ');
    page.submit();
    expect(emissions).toEqual([
      { metodo: 'YAPE', monto: '10.00', referencia: 'op-test', verificado_manualmente: true },
    ]);
    for (const invalid of ['0', '-1', '1e2', '1,20', '1.001']) {
      page.form.controls.monto.setValue(invalid);
      expect(page.form.invalid).toBe(true);
    }
  });
  it('bloquea el formulario durante un intento desconocido y limpia datos al completar', () => {
    const fixture = TestBed.createComponent(PaymentForm);
    fixture.detectChanges();
    const page = fixture.componentInstance;
    page.form.patchValue({ monto: '5.00', verificado: true, referencia: 'PRIVATE' });
    fixture.componentRef.setInput('disabled', true);
    fixture.detectChanges();
    let count = 0;
    page.submitted.subscribe(() => count++);
    page.submit();
    expect(count).toBe(0);
    fixture.componentRef.setInput('resetVersion', 1);
    fixture.detectChanges();
    expect(page.form.controls.monto.value).toBe('');
    expect(page.form.controls.referencia.value).toBe('');
  });
  it('cada servicio requiere revisión explícita incluso sin consumos; nunca aplica receta automáticamente', () => {
    const fixture = TestBed.createComponent(ConsumptionReview);
    fixture.componentRef.setInput('sale', {
      id: 3,
      lineas: [{ id: 8, tipo: 'SERVICIO', descripcion_snapshot: 'Tratamiento' }],
    } as SaleDetail);
    fixture.detectChanges();
    const page = fixture.componentInstance;
    const values: unknown[] = [];
    page.confirmed.subscribe((value) => values.push(value));
    expect(page.payload()).toEqual([{ detalle_id: 8, insumos: [] }]);
    page.submit(true);
    expect(values).toHaveLength(0);
    page.groups.at(0).controls.revisado.setValue(true);
    page.form.controls.verificado.setValue(true);
    page.submit(true);
    expect(values).toEqual([[{ detalle_id: 8, insumos: [] }]]);
  });
});
