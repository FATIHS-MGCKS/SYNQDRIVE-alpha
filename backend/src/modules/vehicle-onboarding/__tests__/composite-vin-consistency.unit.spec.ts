import { assertCompositeVinConsistencyForActivation } from '../policy/composite-vin-consistency';
import { VehicleOnboardingError } from '../errors/vehicle-onboarding.errors';
import { ONBOARDING_SOURCE_SNAPSHOT_VERSION } from '../contracts/vo-document-versions';

describe('composite VIN consistency', () => {
  const draft = {
    version: 1 as const,
    vin: 'VINAAAAAAAAAAAAA',
    vinProvenance: 'PROVIDER' as const,
    vinVerificationState: 'UNVERIFIED' as const,
    make: 'A',
    model: 'B',
    year: 2020,
    fuelType: 'GASOLINE',
    sourceEvidenceRefs: [],
  };

  it('detects draft A vs snapshot B', () => {
    expect(() =>
      assertCompositeVinConsistencyForActivation(draft, [
        {
          id: 'r1',
          snapshotMetadataVersion: ONBOARDING_SOURCE_SNAPSHOT_VERSION,
          snapshotMetadataJson: {
            version: 1,
            vin: 'VINBBBBBBBBBBBBB',
            providerType: 'HIGH_MOBILITY',
          },
        } as any,
      ]),
    ).toThrow(VehicleOnboardingError);
  });
});
