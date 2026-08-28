import type { EnergyEventsRecoveryPlan } from './energy-events-recovery-plan';

/** Synthetic segment ids for repository tests only — never production identifiers. */
export const SYNTHETIC_E3A_RECOVERY_PLAN: EnergyEventsRecoveryPlan = {
  planVersion: 'e3a-test-fixture-2026-08',
  reviewProvenance: 'synthetic-repository-tests-only',
  reviewedDispositions: [
    {
      dimoSegmentId: 'synthetic-refuel-case-a',
      mechanism: 'refuel',
      disposition: 'EXCLUDE_FROM_BACKFILL',
      evidenceCategory:
        'continuous_driving_irreconcilable_fuel_signals_no_stationary_refuel',
      reviewedAt: '2026-08-28T14:00:00.000Z',
    },
    {
      dimoSegmentId: 'synthetic-refuel-case-b',
      mechanism: 'refuel',
      disposition: 'EXCLUDE_FROM_BACKFILL',
      evidenceCategory:
        'dimo_segment_padding_unsustained_micro_fuel_bump_during_driving',
      reviewedAt: '2026-08-28T14:00:00.000Z',
    },
  ],
};
