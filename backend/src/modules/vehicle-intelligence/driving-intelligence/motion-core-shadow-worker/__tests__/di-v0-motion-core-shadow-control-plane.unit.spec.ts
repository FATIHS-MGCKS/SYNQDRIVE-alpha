import {
  evaluateDiV0S4Enablement,
  parseDiV0S4ControlPlaneConfig,
} from '../../s4a-foundation/di-v0-s4a-control-plane';
import {
  evaluateDiV0MotionCoreShadowEnablement,
  isDiV0MotionCoreShadowRunnable,
  parseDiV0MotionCoreShadowControlPlaneConfig,
} from '../di-v0-motion-core-shadow-control-plane';

describe('di-v0-motion-core-shadow control plane', () => {
  const scope = {
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    vehicleOrganizationId: 'org-1',
  };

  it('defaults all shadow flags OFF', () => {
    const cfg = parseDiV0MotionCoreShadowControlPlaneConfig({});
    expect(cfg.shadowEnabled).toBe(false);
    expect(cfg.workerEnabled).toBe(false);
    expect(cfg.c5_1ActivationSince).toBeNull();
    expect(isDiV0MotionCoreShadowRunnable(cfg)).toBe(false);
  });

  it('requires activation cutoff when FSM gap-bridge flag is enabled', () => {
    expect(() =>
      parseDiV0MotionCoreShadowControlPlaneConfig({
        DI_V0_MOTION_CORE_FSM_GAP_BRIDGE_V1_ENABLED: 'true',
      }),
    ).toThrow(/DI_V0_MOTION_CORE_FSM_GAP_BRIDGE_V1_ACTIVATION_SINCE/);
  });

  it('requires activation cutoff when C5.1 preferred speed flag is enabled', () => {
    expect(() =>
      parseDiV0MotionCoreShadowControlPlaneConfig({
        DI_V0_MOTION_CORE_C5_1_PREFERRED_SPEED_ENABLED: 'true',
      }),
    ).toThrow(/DI_V0_MOTION_CORE_C5_1_ACTIVATION_SINCE/);
  });

  it('fails closed when allowlists empty even if flags on', () => {
    const shadow = parseDiV0MotionCoreShadowControlPlaneConfig({
      DI_V0_MOTION_CORE_SHADOW_ENABLED: 'true',
      DI_V0_MOTION_CORE_SHADOW_WORKER_ENABLED: 'true',
    });
    const s4 = parseDiV0S4ControlPlaneConfig({
      DI_V0_S4_MASTER_ENABLED: 'true',
      DI_V0_S4_WORKER_ENABLED: 'true',
      DI_V0_S4_ORGANIZATION_ALLOWLIST: 'org-1',
      DI_V0_S4_VEHICLE_ALLOWLIST: 'veh-1',
    });
    const res = evaluateDiV0MotionCoreShadowEnablement(shadow, s4, { state: 'NOT_KILLED', reason: null }, scope);
    expect(res.enabled).toBe(false);
    expect(res.reason).toBe('MOTION_CORE_SHADOW_ALLOWLIST_EMPTY');
  });

  it('requires vehicle in allowlist and effective S4', () => {
    const shadow = parseDiV0MotionCoreShadowControlPlaneConfig({
      DI_V0_MOTION_CORE_SHADOW_ENABLED: 'true',
      DI_V0_MOTION_CORE_SHADOW_WORKER_ENABLED: 'true',
      DI_V0_MOTION_CORE_SHADOW_ORGANIZATION_ALLOWLIST: 'org-1',
      DI_V0_MOTION_CORE_SHADOW_VEHICLE_ALLOWLIST: 'veh-1',
    });
    const s4 = parseDiV0S4ControlPlaneConfig({
      DI_V0_S4_MASTER_ENABLED: 'true',
      DI_V0_S4_WORKER_ENABLED: 'true',
      DI_V0_S4_POSITION_ENABLED: 'true',
      DI_V0_S4_ORGANIZATION_ALLOWLIST: 'org-1',
      DI_V0_S4_VEHICLE_ALLOWLIST: 'veh-1',
    });
    const kill = { state: 'NOT_KILLED' as const, reason: null };
    expect(evaluateDiV0MotionCoreShadowEnablement(shadow, s4, kill, scope).enabled).toBe(true);
    expect(
      evaluateDiV0MotionCoreShadowEnablement(shadow, s4, kill, { ...scope, vehicleId: 'veh-2' }).reason,
    ).toBe('MOTION_CORE_SHADOW_VEHICLE_NOT_ALLOWLISTED');
    expect(evaluateDiV0S4Enablement(s4, 'WORKER', scope, kill).enabled).toBe(true);
  });
});
