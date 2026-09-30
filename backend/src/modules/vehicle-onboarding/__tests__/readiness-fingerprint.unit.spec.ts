import { computeReadinessInputFingerprint } from '../readiness/readiness-input-fingerprint.v1';
import { RENTAL_ONBOARDING_PROFILE_V1 } from '../readiness/profiles/rental-onboarding.profile';

describe('readiness input fingerprint', () => {
  const baseCase = {
    organizationId: 'org-1',
    sourceMode: 'DIMO',
    draftIdentityVersion: 1,
    draftIdentityJson: { version: 1, make: 'A', model: 'B', year: 2020, fuelType: 'GASOLINE' },
    draftAdminBaselineVersion: 1,
    draftAdminBaselineJson: { version: 1, licensePlate: 'X' },
    draftTechnicalBaselineVersion: 1,
    draftTechnicalBaselineJson: { version: 1, referenceInputs: {} },
    validationFindingsVersion: 1,
    validationFindingsJson: { version: 1, findings: [] },
  };

  it('is stable for equivalent input', () => {
    const a = computeReadinessInputFingerprint({
      caseRow: baseCase as any,
      sourceRefs: [],
      profile: RENTAL_ONBOARDING_PROFILE_V1,
      jurisdictionCode: 'JURISDICTION_UNKNOWN',
      productLabel: 'RENTAL',
    });
    const b = computeReadinessInputFingerprint({
      caseRow: baseCase as any,
      sourceRefs: [],
      profile: RENTAL_ONBOARDING_PROFILE_V1,
      jurisdictionCode: 'JURISDICTION_UNKNOWN',
      productLabel: 'RENTAL',
    });
    expect(a).toBe(b);
  });

  it('changes when admin plate changes', () => {
    const a = computeReadinessInputFingerprint({
      caseRow: baseCase as any,
      sourceRefs: [],
      profile: RENTAL_ONBOARDING_PROFILE_V1,
      jurisdictionCode: 'JURISDICTION_UNKNOWN',
      productLabel: 'RENTAL',
    });
    const b = computeReadinessInputFingerprint({
      caseRow: {
        ...baseCase,
        draftAdminBaselineJson: { version: 1, licensePlate: 'Y' },
      } as any,
      sourceRefs: [],
      profile: RENTAL_ONBOARDING_PROFILE_V1,
      jurisdictionCode: 'JURISDICTION_UNKNOWN',
      productLabel: 'RENTAL',
    });
    expect(a).not.toBe(b);
  });
});
