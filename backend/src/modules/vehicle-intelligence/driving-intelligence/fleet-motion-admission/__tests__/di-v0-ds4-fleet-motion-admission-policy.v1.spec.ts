import { randomUUID } from 'crypto';
import {
  DI_V0_DS4_FLEET_MOTION_ADMISSION_POLICY_DEFAULT_OFF,
  DI_V0_DS4_FLEET_MOTION_GLOBAL_ROLLOUT_ENV,
  evaluateDiV0MotionCoreShadowEnablementWithFleetMotionPolicyV1,
  evaluateDiV0S4EnablementWithFleetMotionPolicyV1,
  isDiV0S4DiscoverySchedulingConfiguredV1,
  isDiV0S4LegacyAllowlistAdmissionRequired,
  isDiV0S4WorkerSchedulingConfiguredV1,
  isDiV0MotionCoreShadowDiscoveryConfiguredV1,
  parseDiV0Ds4FleetMotionAdmissionPolicyV1,
} from '../di-v0-ds4-fleet-motion-admission-policy.v1';
import {
  evaluateDiV0S4KillRow,
  parseDiV0S4ControlPlaneConfig,
} from '../../s4a-foundation/di-v0-s4a-control-plane';
import { parseDiV0MotionCoreShadowControlPlaneConfig } from '../../motion-core-shadow-worker/di-v0-motion-core-shadow-control-plane';

const ORG = randomUUID();
const VEHICLE = randomUUID();
const killOk = evaluateDiV0S4KillRow({ kind: 'ROW', killState: 'NOT_KILLED' });

describe('DS4_FLEET_MOTION_ADMISSION_POLICY_V1', () => {
  it('defaults global rollout OFF (empty env)', () => {
    const policy = parseDiV0Ds4FleetMotionAdmissionPolicyV1({});
    expect(policy.globalRolloutAuthorized).toBe(false);
    expect(isDiV0S4LegacyAllowlistAdmissionRequired(policy)).toBe(true);
  });

  it('parses explicit global rollout authorization', () => {
    const policy = parseDiV0Ds4FleetMotionAdmissionPolicyV1({
      [DI_V0_DS4_FLEET_MOTION_GLOBAL_ROLLOUT_ENV.authorized]: 'true',
    });
    expect(policy.globalRolloutAuthorized).toBe(true);
  });

  it('legacy mode requires non-empty allowlists for scheduling', () => {
    const config = parseDiV0S4ControlPlaneConfig({
      DI_V0_S4_MASTER_ENABLED: 'true',
      DI_V0_S4_DISCOVERY_ENABLED: 'true',
      DI_V0_S4_WORKER_ENABLED: 'true',
      DI_V0_S4_POSITION_ENABLED: 'true',
    });
    expect(isDiV0S4DiscoverySchedulingConfiguredV1(config, DI_V0_DS4_FLEET_MOTION_ADMISSION_POLICY_DEFAULT_OFF)).toBe(false);
    expect(isDiV0S4WorkerSchedulingConfiguredV1(config, DI_V0_DS4_FLEET_MOTION_ADMISSION_POLICY_DEFAULT_OFF)).toBe(false);
  });

  it('fleet-wide mode allows scheduling without legacy allowlists when master flags on', () => {
    const config = parseDiV0S4ControlPlaneConfig({
      DI_V0_S4_MASTER_ENABLED: 'true',
      DI_V0_S4_DISCOVERY_ENABLED: 'true',
      DI_V0_S4_WORKER_ENABLED: 'true',
      DI_V0_S4_POSITION_ENABLED: 'true',
    });
    const policy = parseDiV0Ds4FleetMotionAdmissionPolicyV1({
      [DI_V0_DS4_FLEET_MOTION_GLOBAL_ROLLOUT_ENV.authorized]: '1',
    });
    expect(isDiV0S4DiscoverySchedulingConfiguredV1(config, policy)).toBe(true);
    expect(isDiV0S4WorkerSchedulingConfiguredV1(config, policy)).toBe(true);
  });

  it('fleet-wide S4 enablement accepts any canonical tenant vehicle', () => {
    const config = parseDiV0S4ControlPlaneConfig({
      DI_V0_S4_MASTER_ENABLED: 'true',
      DI_V0_S4_WORKER_ENABLED: 'true',
      DI_V0_S4_POSITION_ENABLED: 'true',
    });
    const policy = parseDiV0Ds4FleetMotionAdmissionPolicyV1({
      [DI_V0_DS4_FLEET_MOTION_GLOBAL_ROLLOUT_ENV.authorized]: 'true',
    });
    const result = evaluateDiV0S4EnablementWithFleetMotionPolicyV1(
      config,
      policy,
      'WORKER',
      { organizationId: ORG, vehicleId: VEHICLE, vehicleOrganizationId: ORG },
      killOk,
    );
    expect(result.enabled).toBe(true);
  });

  it('fleet-wide motion-core skips shadow allowlist but requires shadow worker flags', () => {
    const shadow = parseDiV0MotionCoreShadowControlPlaneConfig({
      DI_V0_MOTION_CORE_SHADOW_ENABLED: 'false',
      DI_V0_MOTION_CORE_SHADOW_WORKER_ENABLED: 'false',
    });
    const s4 = parseDiV0S4ControlPlaneConfig({
      DI_V0_S4_MASTER_ENABLED: 'true',
      DI_V0_S4_WORKER_ENABLED: 'true',
      DI_V0_S4_POSITION_ENABLED: 'true',
    });
    const policy = parseDiV0Ds4FleetMotionAdmissionPolicyV1({
      [DI_V0_DS4_FLEET_MOTION_GLOBAL_ROLLOUT_ENV.authorized]: 'true',
    });
    expect(isDiV0MotionCoreShadowDiscoveryConfiguredV1(shadow, policy)).toBe(false);
    const enable = evaluateDiV0MotionCoreShadowEnablementWithFleetMotionPolicyV1(
      shadow,
      s4,
      policy,
      killOk,
      { organizationId: ORG, vehicleId: VEHICLE, vehicleOrganizationId: ORG },
    );
    expect(enable.enabled).toBe(false);
    expect(enable.reason).toBe('MOTION_CORE_SHADOW_FLAGS_OFF');
  });

  it('legacy empty shadow allowlist remains ineligible', () => {
    const shadow = parseDiV0MotionCoreShadowControlPlaneConfig({
      DI_V0_MOTION_CORE_SHADOW_ENABLED: 'true',
      DI_V0_MOTION_CORE_SHADOW_WORKER_ENABLED: 'true',
    });
    const enable = evaluateDiV0MotionCoreShadowEnablementWithFleetMotionPolicyV1(
      shadow,
      parseDiV0S4ControlPlaneConfig({}),
      DI_V0_DS4_FLEET_MOTION_ADMISSION_POLICY_DEFAULT_OFF,
      killOk,
      { organizationId: ORG, vehicleId: VEHICLE, vehicleOrganizationId: ORG },
    );
    expect(enable.enabled).toBe(false);
    expect(enable.reason).toBe('MOTION_CORE_SHADOW_ALLOWLIST_EMPTY');
  });

  it('fails closed on tenancy mismatch under fleet-wide rollout', () => {
    const config = parseDiV0S4ControlPlaneConfig({
      DI_V0_S4_MASTER_ENABLED: 'true',
      DI_V0_S4_WORKER_ENABLED: 'true',
      DI_V0_S4_POSITION_ENABLED: 'true',
    });
    const policy = parseDiV0Ds4FleetMotionAdmissionPolicyV1({
      [DI_V0_DS4_FLEET_MOTION_GLOBAL_ROLLOUT_ENV.authorized]: 'true',
    });
    const otherOrg = randomUUID();
    const result = evaluateDiV0S4EnablementWithFleetMotionPolicyV1(
      config,
      policy,
      'WORKER',
      { organizationId: ORG, vehicleId: VEHICLE, vehicleOrganizationId: otherOrg },
      killOk,
    );
    expect(result.enabled).toBe(false);
    expect(result.failedTerms).toContain('VEHICLE_BELONGS_TO_ORG');
  });
});
