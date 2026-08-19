import {
  buildServiceComplianceRecoveryEligibility,
  buildVehicleHealthRecoveryEligibility,
  isHealthModuleRecoveryEligible,
} from './vehicle-health-recovery.policy';

describe('vehicle-health-recovery.policy', () => {
  it('treats only good module state as recovery eligible', () => {
    expect(isHealthModuleRecoveryEligible({ state: 'good' })).toBe(true);
    expect(isHealthModuleRecoveryEligible({ state: 'unknown' })).toBe(false);
    expect(isHealthModuleRecoveryEligible({ state: 'warning' })).toBe(false);
    expect(isHealthModuleRecoveryEligible(undefined)).toBe(false);
  });

  it('does not allow battery/tire/brake recovery when rental health failed to load', () => {
    const eligibility = buildVehicleHealthRecoveryEligibility({
      rentalHealthLoaded: false,
      dtcQuerySucceeded: true,
    });
    expect(eligibility.BATTERY_CRITICAL).toBe(false);
    expect(eligibility.TIRE_CRITICAL).toBe(false);
    expect(eligibility.BRAKE_CRITICAL).toBe(false);
    expect(eligibility.ACTIVE_DTC).toBe(true);
  });

  it('allows module recovery only with positively confirmed good states', () => {
    const eligibility = buildVehicleHealthRecoveryEligibility({
      rentalHealthLoaded: true,
      modules: {
        battery: { state: 'good', reason: '', last_updated_at: null, data_stale: false, pipeline_available: true },
        tires: { state: 'unknown', reason: '', last_updated_at: null, data_stale: false, pipeline_available: false },
        brakes: { state: 'good', reason: '', last_updated_at: null, data_stale: false, pipeline_available: true },
      },
      dtcQuerySucceeded: true,
    });
    expect(eligibility.BATTERY_CRITICAL).toBe(true);
    expect(eligibility.TIRE_CRITICAL).toBe(false);
    expect(eligibility.BRAKE_CRITICAL).toBe(true);
    expect(eligibility.ACTIVE_DTC).toBe(true);
  });

  it('preserves ACTIVE_DTC when DTC query failed', () => {
    const eligibility = buildVehicleHealthRecoveryEligibility({
      rentalHealthLoaded: true,
      modules: {
        battery: { state: 'good', reason: '', last_updated_at: null, data_stale: false, pipeline_available: true },
      },
      dtcQuerySucceeded: false,
    });
    expect(eligibility.ACTIVE_DTC).toBe(false);
  });

  it('preserves service compliance recovery when evaluation failed', () => {
    const eligibility = buildServiceComplianceRecoveryEligibility({
      evaluationSucceeded: false,
      evaluation: null,
    });
    expect(eligibility.TUV_OVERDUE).toBe(false);
    expect(eligibility.BOKRAFT_OVERDUE).toBe(false);
    expect(eligibility.SERVICE_OVERDUE).toBe(false);
  });
});
