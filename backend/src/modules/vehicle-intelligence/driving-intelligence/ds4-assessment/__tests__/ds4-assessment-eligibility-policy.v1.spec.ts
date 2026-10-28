import { DS4_ASSESSMENT_CALIBRATION_COHORT_V1 } from '../ds4-assessment-calibration-cohort.v1';
import {
  evaluateDs4AssessmentScopeEligibilityV1,
  isCanonicalDs4AssessmentUuidV1,
} from '../ds4-assessment-eligibility-policy.v1';

describe('ds4-assessment-eligibility-policy.v1', () => {
  it('admits any canonical org/vehicle/trip scope (fleet-wide)', () => {
    const result = evaluateDs4AssessmentScopeEligibilityV1({
      organizationId: '00000000-0000-4000-8000-000000000099',
      vehicleId: '00000000-0000-4000-8000-000000000001',
      tripId: '00000000-0000-4000-8000-000000000002',
    });
    expect(result.eligible).toBe(true);
  });

  it('admits calibration cohort vehicles without special casing', () => {
    for (const v of DS4_ASSESSMENT_CALIBRATION_COHORT_V1) {
      const result = evaluateDs4AssessmentScopeEligibilityV1({
        organizationId: v.organizationId,
        vehicleId: v.vehicleId,
        tripId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      });
      expect(result.eligible).toBe(true);
    }
  });

  it('rejects invalid scope identity', () => {
    const result = evaluateDs4AssessmentScopeEligibilityV1({
      organizationId: 'not-a-uuid',
      vehicleId: '00000000-0000-4000-8000-000000000001',
      tripId: '00000000-0000-4000-8000-000000000002',
    });
    expect(result.eligible).toBe(false);
    if (!result.eligible) expect(result.reason).toBe('SCOPE_IDENTITY_INVALID');
  });

  it('rejects cross-tenant motion run organization', () => {
    const org = DS4_ASSESSMENT_CALIBRATION_COHORT_V1[0]!.organizationId;
    const result = evaluateDs4AssessmentScopeEligibilityV1(
      { organizationId: org, vehicleId: DS4_ASSESSMENT_CALIBRATION_COHORT_V1[0]!.vehicleId, tripId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' },
      { motionRunOrganizationId: '00000000-0000-4000-8000-000000000099' },
    );
    expect(result.eligible).toBe(false);
    if (!result.eligible) expect(result.reason).toBe('ORGANIZATION_TENANCY_MISMATCH');
  });

  it('validates uuid helper', () => {
    expect(isCanonicalDs4AssessmentUuidV1('00000000-0000-4000-8000-000000000001')).toBe(true);
    expect(isCanonicalDs4AssessmentUuidV1('t')).toBe(false);
  });
});
