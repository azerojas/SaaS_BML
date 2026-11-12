import { ValidatorFn } from '@angular/forms';
import { decimalValid } from '../../../shared/domain/records';
export const exactDecimal =
  (scale: number, positive = false): ValidatorFn =>
  (control) =>
    decimalValid(control.value, scale, scale === 2 ? 10 : 11, positive) ? null : { decimal: true };
export const optionalMoney: ValidatorFn = (control) =>
  control.value === '' || decimalValid(control.value, 2) ? null : { decimal: true };
