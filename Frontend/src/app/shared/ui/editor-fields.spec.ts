import { TestBed } from '@angular/core/testing';
import { describe, it, expect } from 'vitest';
import { buildFields, EditorFields } from './editor-fields';
describe('formularios reutilizables accesibles', () => {
  it('relaciona label y campo y conserva el decimal ingresado como string', async () => {
    const fields = [
      { key: 'precio', label: 'Precio', type: 'decimal' as const, required: true, scale: 2 },
    ];
    const form = buildFields(fields, { precio: '0.10' });
    const fixture = TestBed.createComponent(EditorFields);
    fixture.componentRef.setInput('fields', fields);
    fixture.componentRef.setInput('form', form);
    await fixture.whenStable();
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector('label')?.htmlFor).toBe(element.querySelector('input')?.id);
    expect(form.getRawValue()['precio']).toBe('0.10');
    form.controls['precio'].setValue('0.001');
    form.controls['precio'].markAsTouched();
    fixture.detectChanges();
    expect(element.querySelector('[role=alert]')?.textContent).toContain('precisión');
  });
});
