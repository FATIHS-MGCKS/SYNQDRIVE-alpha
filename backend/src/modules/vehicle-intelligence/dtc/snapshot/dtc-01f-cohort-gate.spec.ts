import {
  evaluateDtc01fSafetyPathAdmission,
  evaluateDtcPollJobAdmission,
  parseDtc01fCohortVehicleAllowlist,
  resolveDtc01fCohortGateConfig,
} from './dtc-01f-cohort-gate';

const VID = 'c10351f8-b6a2-4258-947f-631aeaa6d359';

describe('dtc-01f-cohort-gate', () => {
  it('defaults to legacy when global flag is off', () => {
    const r = evaluateDtc01fSafetyPathAdmission({
      vehicleId: VID,
      registryLifecycle: 'ACTIVE',
      env: {},
    });
    expect(r.useDtc01aSafetyPath).toBe(false);
  });

  it('admits all eligible vehicles when cohort gate is off', () => {
    const r = evaluateDtc01fSafetyPathAdmission({
      vehicleId: VID,
      registryLifecycle: 'ACTIVE',
      env: { DTC_01A_SAFETY_FOUNDATION_ENABLED: 'true' },
    });
    expect(r.useDtc01aSafetyPath).toBe(true);
    expect(r.reason).toBe('COHORT_GATE_OFF_ALL_ELIGIBLE');
  });

  it('excludes offboarded vehicles even when cohort gate is off', () => {
    const r = evaluateDtc01fSafetyPathAdmission({
      vehicleId: VID,
      registryLifecycle: 'OFFBOARDED',
      env: { DTC_01A_SAFETY_FOUNDATION_ENABLED: 'true' },
    });
    expect(r.useDtc01aSafetyPath).toBe(false);
  });

  it('fail-closes when cohort gate is on with invalid allowlist', () => {
    const cfg = resolveDtc01fCohortGateConfig({
      DTC_01A_SAFETY_FOUNDATION_ENABLED: 'true',
      DTC_01F_COHORT_GATE_ENABLED: 'true',
      DTC_01F_COHORT_VEHICLE_ALLOWLIST: 'not-a-uuid',
    });
    expect(cfg.mode).toBe('INVALID');
    const r = evaluateDtc01fSafetyPathAdmission({
      vehicleId: VID,
      registryLifecycle: 'ACTIVE',
      env: {
        DTC_01A_SAFETY_FOUNDATION_ENABLED: 'true',
        DTC_01F_COHORT_GATE_ENABLED: 'true',
        DTC_01F_COHORT_VEHICLE_ALLOWLIST: 'not-a-uuid',
      },
    });
    expect(r.useDtc01aSafetyPath).toBe(false);
    expect(r.reason).toBe('COHORT_GATE_INVALID_CONFIG');
  });

  it('admits only allowlisted vehicles when cohort gate is on', () => {
    const env = {
      DTC_01A_SAFETY_FOUNDATION_ENABLED: 'true',
      DTC_01F_COHORT_GATE_ENABLED: 'true',
      DTC_01F_COHORT_VEHICLE_ALLOWLIST: VID,
    };
    expect(
      evaluateDtc01fSafetyPathAdmission({
        vehicleId: VID,
        registryLifecycle: 'ACTIVE',
        env,
      }).useDtc01aSafetyPath,
    ).toBe(true);
    expect(
      evaluateDtc01fSafetyPathAdmission({
        vehicleId: 'a60c0749-a7cd-494e-b5b9-dea3c6b97d63',
        registryLifecycle: 'ACTIVE',
        env,
      }).reason,
    ).toBe('NOT_IN_COHORT_ALLOWLIST');
  });

  it('poll fan-out: global off uses legacy path', () => {
    const r = evaluateDtcPollJobAdmission({
      vehicleId: VID,
      registryLifecycle: 'ACTIVE',
      env: {},
    });
    expect(r).toEqual({ enqueue: true, runtimePath: 'legacy' });
  });

  it('poll fan-out: offboarded never enqueued', () => {
    const r = evaluateDtcPollJobAdmission({
      vehicleId: VID,
      registryLifecycle: 'OFFBOARDED',
      env: { DTC_01A_SAFETY_FOUNDATION_ENABLED: 'true' },
    });
    expect(r).toEqual({ enqueue: false, reason: 'REGISTRY_LIFECYCLE_EXCLUDED' });
  });

  it('poll fan-out: archived never enqueued', () => {
    const r = evaluateDtcPollJobAdmission({
      vehicleId: VID,
      registryLifecycle: 'ARCHIVED',
      env: { DTC_01A_SAFETY_FOUNDATION_ENABLED: 'true' },
    });
    expect(r).toEqual({ enqueue: false, reason: 'REGISTRY_LIFECYCLE_EXCLUDED' });
  });

  it('poll fan-out: global on + cohort off enqueues safety01a path', () => {
    const r = evaluateDtcPollJobAdmission({
      vehicleId: VID,
      registryLifecycle: 'ACTIVE',
      env: { DTC_01A_SAFETY_FOUNDATION_ENABLED: 'true' },
    });
    expect(r).toEqual({ enqueue: true, runtimePath: 'safety01a' });
  });

  it('poll fan-out: invalid cohort config fail-closed', () => {
    const r = evaluateDtcPollJobAdmission({
      vehicleId: VID,
      registryLifecycle: 'ACTIVE',
      env: {
        DTC_01A_SAFETY_FOUNDATION_ENABLED: 'true',
        DTC_01F_COHORT_GATE_ENABLED: 'true',
        DTC_01F_COHORT_VEHICLE_ALLOWLIST: 'bad',
      },
    });
    expect(r).toEqual({ enqueue: false, reason: 'COHORT_GATE_INVALID_CONFIG' });
  });

  it('poll fan-out: cohort on skips non-allowlisted (no legacy fallback)', () => {
    const env = {
      DTC_01A_SAFETY_FOUNDATION_ENABLED: 'true',
      DTC_01F_COHORT_GATE_ENABLED: 'true',
      DTC_01F_COHORT_VEHICLE_ALLOWLIST: VID,
    };
    const admitted = evaluateDtcPollJobAdmission({
      vehicleId: VID,
      registryLifecycle: 'ACTIVE',
      env,
    });
    expect(admitted).toEqual({ enqueue: true, runtimePath: 'safety01a' });
    expect(
      evaluateDtcPollJobAdmission({
        vehicleId: 'a60c0749-a7cd-494e-b5b9-dea3c6b97d63',
        registryLifecycle: 'ACTIVE',
        env,
      }),
    ).toEqual({ enqueue: false, reason: 'NOT_IN_COHORT_ALLOWLIST' });
  });

  it('parses comma-separated allowlist', () => {
    const parsed = parseDtc01fCohortVehicleAllowlist(`${VID}, a60c0749-a7cd-494e-b5b9-dea3c6b97d63`);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.allowlist.size).toBe(2);
    }
  });
});
