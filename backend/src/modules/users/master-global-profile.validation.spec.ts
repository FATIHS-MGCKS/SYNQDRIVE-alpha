import { BadRequestException } from '@nestjs/common';
import {
  assertOptionalStringField,
  validateGlobalProfilePatchValues,
} from './policies/master-global-profile.validation';

describe('master-global-profile.validation', () => {
  it('rejects null profile strings', () => {
    expect(() => assertOptionalStringField('phone', null)).toThrow(BadRequestException);
  });

  it('validates language and timezone contracts', () => {
    expect(() =>
      validateGlobalProfilePatchValues({ language: 'xx', timezone: 'Europe/Berlin' }),
    ).toThrow(BadRequestException);
    expect(() =>
      validateGlobalProfilePatchValues({ language: 'de', timezone: 'Not/A/Zone' }),
    ).toThrow(BadRequestException);
    expect(() =>
      validateGlobalProfilePatchValues({ dateFormat: 'MM/DD/YY' as never }),
    ).toThrow(BadRequestException);
  });
});