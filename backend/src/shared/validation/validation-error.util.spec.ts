import type { ValidationError } from 'class-validator';
import { buildValidationFailedResponse } from './validation-error.util';

describe('validation-error.util', () => {
  it('maps class-validator errors to field-based message keys', () => {
    const errors: ValidationError[] = [
      {
        property: 'minimumAgeYears',
        constraints: {
          min: 'rentalRules.validation.minimumAgeYears.min',
        },
        children: [],
      },
    ];

    const response = buildValidationFailedResponse(errors);
    expect(response.code).toBe('VALIDATION_FAILED');
    expect(response.fieldErrors).toEqual([
      {
        field: 'minimumAgeYears',
        messageKey: 'rentalRules.validation.minimumAgeYears.min',
        constraints: undefined,
      },
    ]);
  });
});
