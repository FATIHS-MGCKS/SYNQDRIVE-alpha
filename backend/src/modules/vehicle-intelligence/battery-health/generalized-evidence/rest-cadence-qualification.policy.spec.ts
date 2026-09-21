import { BatteryShutdownStateAlignmentClass } from '@prisma/client';
import { SHUTDOWN_TIMESTAMP_SOURCES } from '../shutdown-evidence/shutdown-evidence.constants';
import {
  R1_NOMINAL_REST_CADENCE_MS,
  REST_CADENCE_AUTOMATIC_WAKE_PROMOTION_ENABLED,
} from './generalized-evidence.constants';
import {
  deriveNominalRestIntervalIndex,
  evaluateRestCadenceQualification,
  computeRungResidualMs,
} from './rest-cadence-qualification.policy';

describe('rest-cadence-qualification.policy (M3.3B.1)', () => {
  const h = (n: number) => n * 60 * 60_000;

  it('maps anchor-age observations to index 0', () => {
    expect(deriveNominalRestIntervalIndex(60_000).nominalRestIntervalIndex).toBe(0);
  });

  it('uses non-overlapping midpoint boundaries', () => {
    expect(deriveNominalRestIntervalIndex(h(3.98)).nominalRestIntervalIndex).toBe(0);
    expect(deriveNominalRestIntervalIndex(h(4)).nominalRestIntervalIndex).toBe(1);
    expect(deriveNominalRestIntervalIndex(h(11.98)).nominalRestIntervalIndex).toBe(1);
    expect(deriveNominalRestIntervalIndex(h(12)).nominalRestIntervalIndex).toBe(2);
    expect(deriveNominalRestIntervalIndex(h(12) + 60_000).nominalRestIntervalIndex).toBe(2);
    expect(deriveNominalRestIntervalIndex(h(19.98)).nominalRestIntervalIndex).toBe(2);
    expect(deriveNominalRestIntervalIndex(h(20)).nominalRestIntervalIndex).toBe(3);
    expect(deriveNominalRestIntervalIndex(h(20) + h(0.5)).nominalRestIntervalIndex).toBe(3);
    expect(deriveNominalRestIntervalIndex(h(24)).nominalRestIntervalIndex).toBe(3);
  });

  it('computes rung residual relative to nearest rung', () => {
    const age = h(8);
    const mapped = deriveNominalRestIntervalIndex(age);
    expect(mapped.nominalRestIntervalIndex).toBe(1);
    expect(mapped.rungResidualMs).toBe(0);
    expect(computeRungResidualMs(h(16), 2)).toBe(0);
  });

  it('does not promote REST_WAKE under M3.3B.1 decision C', () => {
    expect(REST_CADENCE_AUTOMATIC_WAKE_PROMOTION_ENABLED).toBe(false);
    const result = evaluateRestCadenceQualification({
      actualRestAgeMs: R1_NOMINAL_REST_CADENCE_MS,
      voltageTimestampSource: SHUTDOWN_TIMESTAMP_SOURCES.PROVIDER_FIELD_TIMESTAMP,
      providerObservationOutcome: 'NEW_OBSERVATION',
      stateAlignmentClass: BatteryShutdownStateAlignmentClass.ALIGNED,
      hasActiveRestSession: true,
    });
    expect(result.restWakeCadenceQualified).toBe(false);
    expect(result.nominalRestIntervalIndex).toBe(1);
  });

  it('does not promote incidental 2h parked samples (index 0 band)', () => {
    const result = evaluateRestCadenceQualification({
      actualRestAgeMs: h(2),
      voltageTimestampSource: SHUTDOWN_TIMESTAMP_SOURCES.PROVIDER_FIELD_TIMESTAMP,
      stateAlignmentClass: BatteryShutdownStateAlignmentClass.ALIGNED,
      hasActiveRestSession: true,
    });
    expect(result.nominalRestIntervalIndex).toBe(0);
    expect(result.restWakeCadenceQualified).toBe(false);
  });

  it('does not promote when provider timestamp missing', () => {
    const result = evaluateRestCadenceQualification({
      actualRestAgeMs: R1_NOMINAL_REST_CADENCE_MS,
      voltageTimestampSource: SHUTDOWN_TIMESTAMP_SOURCES.UNKNOWN,
      stateAlignmentClass: BatteryShutdownStateAlignmentClass.ALIGNED,
      hasActiveRestSession: true,
    });
    expect(result.restWakeCadenceQualified).toBe(false);
    expect(result.nominalRestIntervalIndex).toBeNull();
  });

  it('does not promote stale replay', () => {
    const result = evaluateRestCadenceQualification({
      actualRestAgeMs: R1_NOMINAL_REST_CADENCE_MS,
      voltageTimestampSource: SHUTDOWN_TIMESTAMP_SOURCES.PROVIDER_FIELD_TIMESTAMP,
      providerObservationOutcome: 'STALE_REPLAY',
      stateAlignmentClass: BatteryShutdownStateAlignmentClass.ALIGNED,
      hasActiveRestSession: true,
    });
    expect(result.restWakeCadenceQualified).toBe(false);
  });

  it('does not promote without active rest session', () => {
    const result = evaluateRestCadenceQualification({
      actualRestAgeMs: R1_NOMINAL_REST_CADENCE_MS,
      voltageTimestampSource: SHUTDOWN_TIMESTAMP_SOURCES.PROVIDER_FIELD_TIMESTAMP,
      stateAlignmentClass: BatteryShutdownStateAlignmentClass.ALIGNED,
      hasActiveRestSession: false,
    });
    expect(result.restWakeCadenceQualified).toBe(false);
  });

  it('supports skipped rung — 16h maps to index 2', () => {
    const mapped = deriveNominalRestIntervalIndex(h(16) + h(0.12));
    expect(mapped.nominalRestIntervalIndex).toBe(2);
  });
});
