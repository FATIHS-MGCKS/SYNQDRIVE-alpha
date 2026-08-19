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

  it('SERVICE_OVERDUE: TRACKED + non-overdue is recovery eligible', () => {
    const eligibility = buildServiceComplianceRecoveryEligibility({
      evaluationSucceeded: true,
      evaluation: {
        nextService: {
          trackingStatus: 'TRACKED',
          source: 'HM_OEM',
          distanceToNextServiceKm: 5000,
          timeToNextServiceDays: 90,
          lastUpdatedAt: '2026-08-01T00:00:00.000Z',
          serviceSourceLabel: 'HM',
          severity: 'GOOD',
          blocksRental: false,
          title: 'OK',
          description: 'OK',
          message: 'OK',
          hmDistanceFromOem: false,
          hmTimeFromOem: false,
          hmDerivedDueDate: null,
        },
        tuvBokraft: {
          tuvValidTill: null,
          tuvRemainingMonths: null,
          tuvRemainingDays: null,
          tuvOverdue: false,
          tuvLastDate: null,
          bokraftValidTill: null,
          bokraftRemainingMonths: null,
          bokraftRemainingDays: null,
          bokraftOverdue: false,
          bokraftLastDate: null,
        },
      },
    });
    expect(eligibility.SERVICE_OVERDUE).toBe(true);
  });

  it('SERVICE_OVERDUE: NO_TRACKING preserves (not recovery eligible)', () => {
    const eligibility = buildServiceComplianceRecoveryEligibility({
      evaluationSucceeded: true,
      evaluation: {
        nextService: {
          trackingStatus: 'NO_TRACKING',
          source: null,
          distanceToNextServiceKm: null,
          timeToNextServiceDays: null,
          lastUpdatedAt: null,
          serviceSourceLabel: null,
          severity: 'INFO',
          blocksRental: false,
          title: 'No tracking',
          description: '',
          message: '',
          hmDistanceFromOem: false,
          hmTimeFromOem: false,
          hmDerivedDueDate: null,
        },
        tuvBokraft: {
          tuvValidTill: null,
          tuvRemainingMonths: null,
          tuvRemainingDays: null,
          tuvOverdue: false,
          tuvLastDate: null,
          bokraftValidTill: null,
          bokraftRemainingMonths: null,
          bokraftRemainingDays: null,
          bokraftOverdue: false,
          bokraftLastDate: null,
        },
      },
    });
    expect(eligibility.SERVICE_OVERDUE).toBe(false);
  });

  it('SERVICE_OVERDUE: STALE preserves (not recovery eligible)', () => {
    const eligibility = buildServiceComplianceRecoveryEligibility({
      evaluationSucceeded: true,
      evaluation: {
        nextService: {
          trackingStatus: 'STALE',
          source: 'HM_OEM',
          distanceToNextServiceKm: 5000,
          timeToNextServiceDays: 90,
          lastUpdatedAt: '2026-08-01T00:00:00.000Z',
          serviceSourceLabel: 'HM',
          severity: 'WARNING',
          blocksRental: false,
          title: 'Stale',
          description: '',
          message: '',
          hmDistanceFromOem: false,
          hmTimeFromOem: false,
          hmDerivedDueDate: null,
        },
        tuvBokraft: {
          tuvValidTill: null,
          tuvRemainingMonths: null,
          tuvRemainingDays: null,
          tuvOverdue: false,
          tuvLastDate: null,
          bokraftValidTill: null,
          bokraftRemainingMonths: null,
          bokraftRemainingDays: null,
          bokraftOverdue: false,
          bokraftLastDate: null,
        },
      },
    });
    expect(eligibility.SERVICE_OVERDUE).toBe(false);
  });

  it('TUV_OVERDUE: null remainingDays preserves', () => {
    const eligibility = buildServiceComplianceRecoveryEligibility({
      evaluationSucceeded: true,
      evaluation: {
        nextService: {
          trackingStatus: 'TRACKED',
          source: 'HM_OEM',
          distanceToNextServiceKm: 5000,
          timeToNextServiceDays: 90,
          lastUpdatedAt: null,
          serviceSourceLabel: 'HM',
          severity: 'GOOD',
          blocksRental: false,
          title: '',
          description: '',
          message: '',
          hmDistanceFromOem: false,
          hmTimeFromOem: false,
          hmDerivedDueDate: null,
        },
        tuvBokraft: {
          tuvValidTill: null,
          tuvRemainingMonths: null,
          tuvRemainingDays: null,
          tuvOverdue: false,
          tuvLastDate: null,
          bokraftValidTill: null,
          bokraftRemainingMonths: null,
          bokraftRemainingDays: 365,
          bokraftOverdue: false,
          bokraftLastDate: null,
        },
      },
    });
    expect(eligibility.TUV_OVERDUE).toBe(false);
    expect(eligibility.BOKRAFT_OVERDUE).toBe(true);
  });
});
