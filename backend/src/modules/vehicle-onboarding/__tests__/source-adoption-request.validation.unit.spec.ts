import {
  parseSourceAdoptRequestBody,
  parseSourceAttachRequestBody,
} from '../policy/source-adoption-request.validation';
import { VehicleOnboardingError } from '../errors/vehicle-onboarding.errors';

describe('source-adoption-request.validation', () => {
  it('parses strict adopt body', () => {
    const body = {
      provider: 'DIMO',
      sourceMirrorId: '550e8400-e29b-41d4-a716-446655440000',
      idempotencyKey: 'key-1',
    };
    expect(parseSourceAdoptRequestBody(body)).toEqual(body);
  });

  it('rejects unknown adopt keys', () => {
    expect(() =>
      parseSourceAdoptRequestBody({
        provider: 'DIMO',
        sourceMirrorId: '550e8400-e29b-41d4-a716-446655440000',
        idempotencyKey: 'k',
        sourceAdoptionMode: 'PLATFORM_TRUSTED_ADOPTION',
      }),
    ).toThrow(VehicleOnboardingError);
  });

  it('parses strict attach body with null concurrency token', () => {
    expect(
      parseSourceAttachRequestBody({
        provider: 'HIGH_MOBILITY',
        sourceMirrorId: '550e8400-e29b-41d4-a716-446655440000',
        expectedConcurrencyToken: null,
      }),
    ).toMatchObject({ provider: 'HIGH_MOBILITY' });
  });
});
