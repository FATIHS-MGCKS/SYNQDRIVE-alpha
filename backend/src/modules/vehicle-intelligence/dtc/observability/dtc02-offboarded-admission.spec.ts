import { evaluateDtcPollJobAdmission } from '../snapshot/dtc-01f-cohort-gate';

describe('DTC-02 P1 offboarded scheduling eligibility (read-only)', () => {
  const envOff = {
    DTC_01A_SAFETY_FOUNDATION_ENABLED: undefined,
    DTC_01F_COHORT_GATE_ENABLED: undefined,
  } as NodeJS.ProcessEnv;

  it('excludes OFFBOARDED vehicles from poll enqueue when flags are off', () => {
    const admission = evaluateDtcPollJobAdmission({
      vehicleId: 'a60c0749-a7cd-494e-b5b9-dea3c6b97d63',
      registryLifecycle: 'OFFBOARDED',
      env: envOff,
    });
    expect(admission.enqueue).toBe(false);
    if (!admission.enqueue) {
      expect(admission.reason).toBe('REGISTRY_LIFECYCLE_EXCLUDED');
    }
  });

  it('allows ACTIVE vehicles on legacy path when flags are off', () => {
    const admission = evaluateDtcPollJobAdmission({
      vehicleId: '19fedd4b-c4e8-4de8-a125-dab293326e7e',
      registryLifecycle: 'ACTIVE',
      env: envOff,
    });
    expect(admission.enqueue).toBe(true);
    if (admission.enqueue) {
      expect(admission.runtimePath).toBe('legacy');
    }
  });

  it('cohort gate skips non-allowlisted vehicles without legacy fallback', () => {
    const admission = evaluateDtcPollJobAdmission({
      vehicleId: '19fedd4b-c4e8-4de8-a125-dab293326e7e',
      registryLifecycle: 'ACTIVE',
      env: {
        DTC_01A_SAFETY_FOUNDATION_ENABLED: 'true',
        DTC_01F_COHORT_GATE_ENABLED: 'true',
        DTC_01F_COHORT_VEHICLE_ALLOWLIST: 'c10351f8-b6a2-4258-947f-631aeaa6d359',
      },
    });
    expect(admission.enqueue).toBe(false);
    if (!admission.enqueue) {
      expect(admission.reason).toBe('NOT_IN_COHORT_ALLOWLIST');
    }
  });
});
