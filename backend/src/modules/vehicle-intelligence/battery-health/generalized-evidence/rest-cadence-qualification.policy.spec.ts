import { BatteryShutdownStateAlignmentClass } from '@prisma/client';
import { SHUTDOWN_TIMESTAMP_SOURCES } from '../shutdown-evidence/shutdown-evidence.constants';
import { R1_NOMINAL_REST_CADENCE_MS } from './generalized-evidence.constants';
import {
  deriveNominalRestIntervalIndex,
  evaluateRestCadenceQualification,
} from './rest-cadence-qualification.policy';

describe('rest-cadence-qualification.policy', () => {
  it('maps anchor-age observations to index 0', () => {
    expect(deriveNominalRestIntervalIndex(60_000).nominalRestIntervalIndex).toBe(0);
  });

  it('maps ~8h rest age to index 1 with tolerance', () => {
    const age = R1_NOMINAL_REST_CADENCE_MS - 2 * 60_000;
    const mapped = deriveNominalRestIntervalIndex(age);
    expect(mapped.nominalRestIntervalIndex).toBe(1);
    expect(mapped.cadenceInTolerance).toBe(true);
  });

  it('maps ~16h rest age to index 2 when index 1 was skipped', () => {
    const age = 2 * R1_NOMINAL_REST_CADENCE_MS + 7 * 60_000;
    const mapped = deriveNominalRestIntervalIndex(age);
    expect(mapped.nominalRestIntervalIndex).toBe(2);
    expect(mapped.cadenceInTolerance).toBe(true);
  });

  it('qualifies REST_WAKE when session + provider time + cadence band pass', () => {
    const result = evaluateRestCadenceQualification({
      actualRestAgeMs: R1_NOMINAL_REST_CADENCE_MS,
      voltageTimestampSource: SHUTDOWN_TIMESTAMP_SOURCES.PROVIDER_FIELD_TIMESTAMP,
      providerObservationOutcome: 'NEW_OBSERVATION',
      stateAlignmentClass: BatteryShutdownStateAlignmentClass.ALIGNED,
      hasActiveRestSession: true,
    });
    expect(result.restWakeCadenceQualified).toBe(true);
    expect(result.nominalRestIntervalIndex).toBe(1);
  });

  it('does not qualify stale replay observations', () => {
    const result = evaluateRestCadenceQualification({
      actualRestAgeMs: R1_NOMINAL_REST_CADENCE_MS,
      voltageTimestampSource: SHUTDOWN_TIMESTAMP_SOURCES.PROVIDER_FIELD_TIMESTAMP,
      providerObservationOutcome: 'STALE_REPLAY',
      stateAlignmentClass: BatteryShutdownStateAlignmentClass.ALIGNED,
      hasActiveRestSession: true,
    });
    expect(result.restWakeCadenceQualified).toBe(false);
  });
});
