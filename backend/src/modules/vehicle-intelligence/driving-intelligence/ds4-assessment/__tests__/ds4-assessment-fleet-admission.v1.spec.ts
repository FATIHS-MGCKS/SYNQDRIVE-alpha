import {
  DS4_ASSESSMENT_FLEET_VEHICLES_V1,
  evaluateDs4AssessmentFleetAdmissionV1,
} from '../ds4-assessment-fleet-admission.v1';

describe('ds4-assessment-fleet-admission.v1', () => {
  it('admits four canonical fleet vehicles by UUID', () => {
    for (const v of DS4_ASSESSMENT_FLEET_VEHICLES_V1) {
      const result = evaluateDs4AssessmentFleetAdmissionV1({
        organizationId: v.organizationId,
        vehicleId: v.vehicleId,
      });
      expect(result.admitted).toBe(true);
    }
  });

  it('rejects unknown vehicle UUID', () => {
    const result = evaluateDs4AssessmentFleetAdmissionV1({
      organizationId: DS4_ASSESSMENT_FLEET_VEHICLES_V1[0]!.organizationId,
      vehicleId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    });
    expect(result.admitted).toBe(false);
    if (!result.admitted) expect(result.reason).toBe('VEHICLE_NOT_IN_ASSESSMENT_FLEET');
  });

  it('rejects tenancy mismatch', () => {
    const v = DS4_ASSESSMENT_FLEET_VEHICLES_V1[0]!;
    const result = evaluateDs4AssessmentFleetAdmissionV1({
      organizationId: '00000000-0000-4000-8000-000000000099',
      vehicleId: v.vehicleId,
    });
    expect(result.admitted).toBe(false);
    if (!result.admitted) expect(result.reason).toBe('ORGANIZATION_TENANCY_MISMATCH');
  });
});
