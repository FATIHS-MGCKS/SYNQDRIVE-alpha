import {
  resolveActivationVehicleFields,
  resolveFuelTypeStrict,
  validateActivationYear,
} from '../policy/activation-field-resolution';
import { VehicleOnboardingError } from '../errors/vehicle-onboarding.errors';

describe('activation field resolution', () => {
  const baseIdentity = {
    version: 1 as const,
    vin: null,
    vinProvenance: null,
    vinVerificationState: null,
    make: 'VW',
    model: 'Golf',
    year: 2020,
    fuelType: 'PETROL',
    sourceEvidenceRefs: [],
  };

  it('maps PETROL to GASOLINE', () => {
    expect(resolveFuelTypeStrict('PETROL')).toBe('GASOLINE');
  });

  it('allows explicit OTHER', () => {
    expect(resolveFuelTypeStrict('OTHER')).toBe('OTHER');
  });

  it('fails closed on missing fuel type', () => {
    expect(() => resolveFuelTypeStrict(null)).toThrow(VehicleOnboardingError);
  });

  it('fails closed on unknown fuel type', () => {
    expect(() => resolveFuelTypeStrict('BIOETHANOL_X')).toThrow(VehicleOnboardingError);
  });

  it('rejects year 0', () => {
    expect(() => validateActivationYear(0)).toThrow(VehicleOnboardingError);
  });

  it('resolves activation fields with strict fuel', () => {
    const fields = resolveActivationVehicleFields(baseIdentity, null);
    expect(fields.fuelType).toBe('GASOLINE');
  });
});
