import {
  isAutomaticLiveFsmAdmissionCohort,
  parseLiveFsmAutomaticAdmissionActivationHorizon,
  readLiveFsmAutomaticAdmissionPolicyFromEnv,
} from '../trip-di-boundary-admission-live-fsm-auto.policy';

describe('trip-di-boundary-admission-live-fsm-auto.policy', () => {
  it('fails closed when activation horizon is missing or invalid', () => {
    expect(parseLiveFsmAutomaticAdmissionActivationHorizon(undefined)).toBeNull();
    expect(parseLiveFsmAutomaticAdmissionActivationHorizon('')).toBeNull();
    expect(parseLiveFsmAutomaticAdmissionActivationHorizon('not-a-date')).toBeNull();
    expect(parseLiveFsmAutomaticAdmissionActivationHorizon('2026-10-20T00:00:00.000Z')).toBeInstanceOf(Date);
  });

  it('requires S4 master and explicit allowlist membership for automatic admission', () => {
    const policy = readLiveFsmAutomaticAdmissionPolicyFromEnv({
      DI_V0_S4_MASTER_ENABLED: 'true',
      DI_V0_S4_ORGANIZATION_ALLOWLIST: 'org-a',
      DI_V0_S4_VEHICLE_ALLOWLIST: 'veh-a',
    });
    expect(
      isAutomaticLiveFsmAdmissionCohort(policy, {
        organizationId: 'org-a',
        vehicleId: 'veh-a',
        vehicleOrganizationId: 'org-a',
      }),
    ).toBe(true);
    expect(
      isAutomaticLiveFsmAdmissionCohort(policy, {
        organizationId: 'org-a',
        vehicleId: 'veh-b',
        vehicleOrganizationId: 'org-a',
      }),
    ).toBe(false);
    expect(
      isAutomaticLiveFsmAdmissionCohort(policy, {
        organizationId: 'org-b',
        vehicleId: 'veh-a',
        vehicleOrganizationId: 'org-b',
      }),
    ).toBe(false);
  });
});
