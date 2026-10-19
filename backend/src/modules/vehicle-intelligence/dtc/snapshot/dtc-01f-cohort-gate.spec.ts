import {
  dtcPollWebhookAdmissionAligned,
  evaluateDtc01fSafetyPathAdmission,
  evaluateDtcPollJobAdmission,
  evaluateDtcWebhookAdmission,
  parseDtc01fCohortVehicleAllowlist,
  resolveDtc01fCohortGateConfig,
} from './dtc-01f-cohort-gate';

/** Production pilot (KS MS 661) */
const VID_PILOT = 'c10351f8-b6a2-4258-947f-631aeaa6d359';
/** Production ACTIVE fleet (HMÜ C 215, KS FH 660E, WOB L 7503) */
const VID_HMU_C_215 = '8c850ff1-4201-432b-af2e-2711dbc7ca48';
const VID_KS_FH_660E = '68868291-5478-42cd-b0c4-cc77b2a78e21';
const VID_WOB_L_7503 = '19fedd4b-c4e8-4de8-a125-dab293326e7e';
const VID = VID_PILOT;

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

  describe('webhook admission parity with poll fan-out', () => {
    const scenarios: Array<{
      name: string;
      lifecycle: string;
      env: NodeJS.ProcessEnv;
      vehicleId?: string;
    }> = [
      { name: 'global off active', lifecycle: 'ACTIVE', env: {} },
      { name: 'global off offboarded', lifecycle: 'OFFBOARDED', env: {} },
      { name: 'global off archived', lifecycle: 'ARCHIVED', env: {} },
      {
        name: 'global on open rollout',
        lifecycle: 'ACTIVE',
        env: { DTC_01A_SAFETY_FOUNDATION_ENABLED: 'true' },
      },
      {
        name: 'cohort invalid',
        lifecycle: 'ACTIVE',
        env: {
          DTC_01A_SAFETY_FOUNDATION_ENABLED: 'true',
          DTC_01F_COHORT_GATE_ENABLED: 'true',
          DTC_01F_COHORT_VEHICLE_ALLOWLIST: 'bad',
        },
      },
      {
        name: 'cohort allowlisted',
        lifecycle: 'ACTIVE',
        env: {
          DTC_01A_SAFETY_FOUNDATION_ENABLED: 'true',
          DTC_01F_COHORT_GATE_ENABLED: 'true',
          DTC_01F_COHORT_VEHICLE_ALLOWLIST: VID,
        },
      },
      {
        name: 'cohort non-allowlisted',
        lifecycle: 'ACTIVE',
        vehicleId: 'a60c0749-a7cd-494e-b5b9-dea3c6b97d63',
        env: {
          DTC_01A_SAFETY_FOUNDATION_ENABLED: 'true',
          DTC_01F_COHORT_GATE_ENABLED: 'true',
          DTC_01F_COHORT_VEHICLE_ALLOWLIST: VID,
        },
      },
    ];

    for (const s of scenarios) {
      it(`poll/webhook aligned: ${s.name}`, () => {
        const input = {
          vehicleId: s.vehicleId ?? VID,
          registryLifecycle: s.lifecycle,
          env: s.env,
        };
        expect(dtcPollWebhookAdmissionAligned(input)).toBe(true);
      });
    }

    it('webhook global off uses legacy mutations path', () => {
      expect(evaluateDtcWebhookAdmission({ vehicleId: VID, registryLifecycle: 'ACTIVE', env: {} })).toEqual({
        mutate: true,
        runtimePath: 'legacy',
      });
    });

    it('replica config: same env yields identical cohort resolution', () => {
      const env = {
        DTC_01A_SAFETY_FOUNDATION_ENABLED: 'true',
        DTC_01F_COHORT_GATE_ENABLED: 'true',
        DTC_01F_COHORT_VEHICLE_ALLOWLIST: VID,
      };
      const a = resolveDtc01fCohortGateConfig(env);
      const b = resolveDtc01fCohortGateConfig({ ...env });
      expect(a).toEqual(b);
      expect(a.mode).toBe('COHORT');
    });

    it('webhook cohort on skips non-allowlisted without legacy', () => {
      expect(
        evaluateDtcWebhookAdmission({
          vehicleId: 'a60c0749-a7cd-494e-b5b9-dea3c6b97d63',
          registryLifecycle: 'ACTIVE',
          env: {
            DTC_01A_SAFETY_FOUNDATION_ENABLED: 'true',
            DTC_01F_COHORT_GATE_ENABLED: 'true',
            DTC_01F_COHORT_VEHICLE_ALLOWLIST: VID,
          },
        }),
      ).toEqual({ mutate: false, reason: 'NOT_IN_COHORT_ALLOWLIST' });
    });
  });

  describe('DTC-02 P5A mixed-mode routing (default OFF)', () => {
    const strictCohortEnv = {
      DTC_01A_SAFETY_FOUNDATION_ENABLED: 'true',
      DTC_01F_COHORT_GATE_ENABLED: 'true',
      DTC_01F_COHORT_VEHICLE_ALLOWLIST: VID_PILOT,
    };
    const mixedCohortEnv = {
      ...strictCohortEnv,
      DTC_01F_COHORT_MIXED_MODE_ENABLED: 'true',
    };

    it('resolves MIXED_COHORT only when mixed flag is explicitly true', () => {
      expect(resolveDtc01fCohortGateConfig(strictCohortEnv).mode).toBe('COHORT');
      expect(resolveDtc01fCohortGateConfig(mixedCohortEnv).mode).toBe('MIXED_COHORT');
      expect(
        resolveDtc01fCohortGateConfig({
          ...strictCohortEnv,
          DTC_01F_COHORT_MIXED_MODE_ENABLED: 'false',
        }).mode,
      ).toBe('COHORT');
    });

    it('strict cohort unchanged when mixed mode OFF (non-pilot blocked)', () => {
      for (const otherId of [VID_HMU_C_215, VID_KS_FH_660E, VID_WOB_L_7503]) {
        expect(
          evaluateDtcPollJobAdmission({
            vehicleId: otherId,
            registryLifecycle: 'ACTIVE',
            env: strictCohortEnv,
          }),
        ).toEqual({ enqueue: false, reason: 'NOT_IN_COHORT_ALLOWLIST' });
      }
    });

    it('four-vehicle admission matrix under mixed cohort', () => {
      const cases: Array<{
        vehicleId: string;
        lifecycle: string;
        poll: ReturnType<typeof evaluateDtcPollJobAdmission>;
        webhook: ReturnType<typeof evaluateDtcWebhookAdmission>;
      }> = [
        {
          vehicleId: VID_PILOT,
          lifecycle: 'ACTIVE',
          poll: { enqueue: true, runtimePath: 'safety01a' },
          webhook: { mutate: true, runtimePath: 'safety01a' },
        },
        {
          vehicleId: VID_HMU_C_215,
          lifecycle: 'ACTIVE',
          poll: { enqueue: true, runtimePath: 'legacy' },
          webhook: { mutate: true, runtimePath: 'legacy' },
        },
        {
          vehicleId: VID_KS_FH_660E,
          lifecycle: 'ACTIVE',
          poll: { enqueue: true, runtimePath: 'legacy' },
          webhook: { mutate: true, runtimePath: 'legacy' },
        },
        {
          vehicleId: VID_WOB_L_7503,
          lifecycle: 'ACTIVE',
          poll: { enqueue: true, runtimePath: 'legacy' },
          webhook: { mutate: true, runtimePath: 'legacy' },
        },
      ];

      for (const c of cases) {
        expect(
          evaluateDtcPollJobAdmission({
            vehicleId: c.vehicleId,
            registryLifecycle: c.lifecycle,
            env: mixedCohortEnv,
          }),
        ).toEqual(c.poll);
        expect(
          evaluateDtcWebhookAdmission({
            vehicleId: c.vehicleId,
            registryLifecycle: c.lifecycle,
            env: mixedCohortEnv,
          }),
        ).toEqual(c.webhook);
        expect(
          dtcPollWebhookAdmissionAligned({
            vehicleId: c.vehicleId,
            registryLifecycle: c.lifecycle,
            env: mixedCohortEnv,
          }),
        ).toBe(true);
      }
    });

    it('pilot never receives legacy runtime path when mixed mode on', () => {
      const poll = evaluateDtcPollJobAdmission({
        vehicleId: VID_PILOT,
        registryLifecycle: 'ACTIVE',
        env: mixedCohortEnv,
      });
      expect(poll).toEqual({ enqueue: true, runtimePath: 'safety01a' });
      expect(
        evaluateDtc01fSafetyPathAdmission({
          vehicleId: VID_PILOT,
          registryLifecycle: 'ACTIVE',
          env: mixedCohortEnv,
        }),
      ).toEqual({ useDtc01aSafetyPath: true, reason: 'COHORT_ADMITTED' });
    });

    it('non-pilot uses legacy path admission without 01A safety path', () => {
      expect(
        evaluateDtc01fSafetyPathAdmission({
          vehicleId: VID_WOB_L_7503,
          registryLifecycle: 'ACTIVE',
          env: mixedCohortEnv,
        }),
      ).toEqual({ useDtc01aSafetyPath: false, reason: 'COHORT_MIXED_NON_PILOT_LEGACY' });
    });

    it('offboarded excluded in mixed mode', () => {
      expect(
        evaluateDtcPollJobAdmission({
          vehicleId: VID_PILOT,
          registryLifecycle: 'OFFBOARDED',
          env: mixedCohortEnv,
        }),
      ).toEqual({ enqueue: false, reason: 'REGISTRY_LIFECYCLE_EXCLUDED' });
    });

    it('replica parity: identical env resolves identical mixed cohort config', () => {
      const a = resolveDtc01fCohortGateConfig(mixedCohortEnv);
      const b = resolveDtc01fCohortGateConfig({ ...mixedCohortEnv });
      expect(a).toEqual(b);
      expect(a.mode).toBe('MIXED_COHORT');
    });
  });
});
