import { randomUUID } from 'crypto';
import {
  DI_V0_DS4_FLEET_MOTION_GLOBAL_ROLLOUT_ENV,
  parseDiV0Ds4FleetMotionAdmissionPolicyV1,
} from '../../../driving-intelligence/fleet-motion-admission/di-v0-ds4-fleet-motion-admission-policy.v1';
import { evaluateDiV0S4KillRow } from '../../../driving-intelligence/s4a-foundation/di-v0-s4a-control-plane';
import { evaluateTripDiBoundaryAdmissionRecoveryVehicleEligibilityV1 } from '../trip-di-boundary-admission-recovery.eligibility.v1';
import { readTripDiBoundaryAdmissionRecoveryPolicyFromEnv } from '../trip-di-boundary-admission-recovery.policy';

const org = randomUUID();
const veh = randomUUID();
const killOk = evaluateDiV0S4KillRow({ kind: 'ROW', killState: 'NOT_KILLED' });

describe('trip-di-boundary-admission-recovery.eligibility.v1', () => {
  it('fails closed when recovery is not activated', () => {
    const policy = readTripDiBoundaryAdmissionRecoveryPolicyFromEnv({});
    const fleetPolicy = parseDiV0Ds4FleetMotionAdmissionPolicyV1({
      [DI_V0_DS4_FLEET_MOTION_GLOBAL_ROLLOUT_ENV.authorized]: 'true',
    });
    const result = evaluateTripDiBoundaryAdmissionRecoveryVehicleEligibilityV1({
      policy,
      fleetPolicy,
      kill: killOk,
      vehicle: {
        organizationId: org,
        vehicleId: veh,
        vehicleOrganizationId: org,
        registryLifecycle: 'ACTIVE',
        dimoRawJson: { aftermarketDevice: { serial: 'R1-X' } },
      },
    });
    expect(result.eligible).toBe(false);
    expect(result.failedTerms).toContain('RECOVERY_NOT_ACTIVATED');
  });

  it('accepts fleet-wide S4 without legacy vehicle allowlist when global rollout authorized', () => {
    const policy = readTripDiBoundaryAdmissionRecoveryPolicyFromEnv({
      TRIP_DI_BOUNDARY_ADMISSION_RECOVERY_ACTIVATED_AT_UTC: '2026-11-01T00:00:00.000Z',
      DI_V0_S4_MASTER_ENABLED: 'true',
      DI_V0_S4_DISCOVERY_ENABLED: 'true',
      DI_V0_S4_POSITION_ENABLED: 'true',
    });
    const fleetPolicy = parseDiV0Ds4FleetMotionAdmissionPolicyV1({
      [DI_V0_DS4_FLEET_MOTION_GLOBAL_ROLLOUT_ENV.authorized]: 'true',
    });
    const result = evaluateTripDiBoundaryAdmissionRecoveryVehicleEligibilityV1({
      policy,
      fleetPolicy,
      kill: killOk,
      vehicle: {
        organizationId: org,
        vehicleId: veh,
        vehicleOrganizationId: org,
        registryLifecycle: 'ACTIVE',
        dimoRawJson: { syntheticDevice: { id: 1 } },
      },
    });
    expect(result.eligible).toBe(true);
  });

  it('rejects UNKNOWN provider families', () => {
    const policy = readTripDiBoundaryAdmissionRecoveryPolicyFromEnv({
      TRIP_DI_BOUNDARY_ADMISSION_RECOVERY_ACTIVATED_AT_UTC: '2026-11-01T00:00:00.000Z',
      DI_V0_S4_MASTER_ENABLED: 'true',
      DI_V0_S4_DISCOVERY_ENABLED: 'true',
      DI_V0_S4_POSITION_ENABLED: 'true',
      DI_V0_S4_ORGANIZATION_ALLOWLIST: org,
      DI_V0_S4_VEHICLE_ALLOWLIST: veh,
    });
    const result = evaluateTripDiBoundaryAdmissionRecoveryVehicleEligibilityV1({
      policy,
      fleetPolicy: parseDiV0Ds4FleetMotionAdmissionPolicyV1({}),
      kill: killOk,
      vehicle: {
        organizationId: org,
        vehicleId: veh,
        vehicleOrganizationId: org,
        registryLifecycle: 'ACTIVE',
        dimoRawJson: null,
      },
    });
    expect(result.eligible).toBe(false);
    expect(result.failedTerms.some((t) => t.startsWith('PROVIDER_'))).toBe(true);
  });
});
