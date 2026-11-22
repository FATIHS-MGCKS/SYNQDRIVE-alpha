import { BadRequestException } from '@nestjs/common';
import { parseOrganizationOffboardingPrepareBody } from './organization-offboarding-prepare.validation';

describe('parseOrganizationOffboardingPrepareBody', () => {
  it('accepts idempotencyKey and optional note', () => {
    expect(parseOrganizationOffboardingPrepareBody({ idempotencyKey: '  abc  ', note: ' hi ' })).toEqual({
      idempotencyKey: 'abc',
      note: 'hi',
    });
  });

  it('rejects non-object body', () => {
    expect(() => parseOrganizationOffboardingPrepareBody(null)).toThrow(BadRequestException);
    expect(() => parseOrganizationOffboardingPrepareBody([])).toThrow(BadRequestException);
  });

  it('rejects missing or blank idempotencyKey', () => {
    expect(() => parseOrganizationOffboardingPrepareBody({})).toThrow(BadRequestException);
    expect(() => parseOrganizationOffboardingPrepareBody({ idempotencyKey: '   ' })).toThrow(
      BadRequestException,
    );
  });

  it('rejects overlong idempotencyKey and note', () => {
    expect(() =>
      parseOrganizationOffboardingPrepareBody({ idempotencyKey: 'x'.repeat(129) }),
    ).toThrow(BadRequestException);
    expect(() =>
      parseOrganizationOffboardingPrepareBody({ idempotencyKey: 'ok', note: 'n'.repeat(2001) }),
    ).toThrow(BadRequestException);
  });
});