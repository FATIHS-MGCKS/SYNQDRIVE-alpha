import { VehicleOnboardingError } from '../errors/vehicle-onboarding.errors';
import { parseHmOnlyOperatorIdentityCapture } from './hm-only-operator-identity.validation';

describe('parseHmOnlyOperatorIdentityCapture', () => {
  const base = { hmVehicleId: 'hm-1', organizationId: 'org-a', model: 'X5', year: 2022 };

  it('accepts valid model and year', () => {
    expect(parseHmOnlyOperatorIdentityCapture(base)).toEqual({ model: 'X5', year: 2022 });
  });

  it('rejects missing model', () => {
    expect(() => parseHmOnlyOperatorIdentityCapture({ ...base, model: '' })).toThrow(
      VehicleOnboardingError,
    );
    expect(() => parseHmOnlyOperatorIdentityCapture({ ...base, model: undefined })).toThrow(
      VehicleOnboardingError,
    );
  });

  it('rejects missing year', () => {
    expect(() => parseHmOnlyOperatorIdentityCapture({ ...base, year: undefined })).toThrow(
      VehicleOnboardingError,
    );
  });

  it('rejects year before minimum', () => {
    expect(() => parseHmOnlyOperatorIdentityCapture({ ...base, year: 1970 })).toThrow(
      VehicleOnboardingError,
    );
  });
});