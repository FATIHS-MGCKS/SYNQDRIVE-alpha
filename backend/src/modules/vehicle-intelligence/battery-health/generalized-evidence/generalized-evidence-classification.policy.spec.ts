import {
  BatteryGeneralizedEvidenceClass,
  BatteryShutdownStateAlignmentClass,
} from '@prisma/client';
import { classifyGeneralizedEvidence } from './generalized-evidence-classification.policy';
import type { GeneralizedEvidenceFieldBundle } from './generalized-evidence.types';
import { SHUTDOWN_TIMESTAMP_SOURCES } from '../shutdown-evidence/shutdown-evidence.constants';
import { R1_NOMINAL_REST_CADENCE_MS } from './generalized-evidence.constants';

function baseFields(
  overrides: Partial<GeneralizedEvidenceFieldBundle> = {},
): GeneralizedEvidenceFieldBundle {
  const at = new Date('2026-09-21T08:00:00.000Z');
  return {
    voltage: 12.35,
    voltageObservedAt: at,
    voltageTimestampSource: SHUTDOWN_TIMESTAMP_SOURCES.PROVIDER_FIELD_TIMESTAMP,
    speedKmh: 0,
    speedObservedAt: at,
    speedTimestampSource: SHUTDOWN_TIMESTAMP_SOURCES.PROVIDER_SNAPSHOT_TIMESTAMP,
    ignitionOn: false,
    ignitionObservedAt: at,
    ignitionTimestampSource: SHUTDOWN_TIMESTAMP_SOURCES.PROVIDER_SNAPSHOT_TIMESTAMP,
    engineRunning: false,
    engineRunningObservedAt: at,
    engineRunningTimestampSource: SHUTDOWN_TIMESTAMP_SOURCES.PROVIDER_SNAPSHOT_TIMESTAMP,
    isLvCharging: false,
    isHvCharging: false,
    chargingContextObservedAt: at,
    chargingContextTimestampSource: SHUTDOWN_TIMESTAMP_SOURCES.PROVIDER_SNAPSHOT_TIMESTAMP,
    activeTrip: false,
    activeTripObservedAt: at,
    activeTripTimestampSource: SHUTDOWN_TIMESTAMP_SOURCES.INGEST_WALL_CLOCK,
    vehicleOnline: true,
    vehicleOnlineObservedAt: at,
    providerLastSeenAt: at,
    ...overrides,
  };
}

describe('classifyGeneralizedEvidence (M3.3A.1 semantics)', () => {
  const referenceAt = new Date('2026-09-21T08:00:00.000Z');

  it('does not classify sub-8h parked samples as REST_WAKE by time alone', () => {
    const ageMs = 8 * 60 * 60_000 + 10 * 60_000;
    const result = classifyGeneralizedEvidence({
      fields: baseFields(),
      referenceAt: new Date(referenceAt.getTime() + ageMs),
      actualRestAgeMs: ageMs,
      restWakeCadenceQualified: false,
      restWakeSourceSemantic: false,
    });
    expect(result.evidenceClass).toBe(
      BatteryGeneralizedEvidenceClass.PARKED_REST_CANDIDATE,
    );
    expect(result.evidenceClass).not.toBe(
      BatteryGeneralizedEvidenceClass.REST_WAKE_VOLTAGE,
    );
  });

  it('classifies shutdown at anchor as ENGINE_OFF_TRANSITION', () => {
    const result = classifyGeneralizedEvidence({
      fields: baseFields(),
      referenceAt,
      actualRestAgeMs: 0,
    });
    expect(result.evidenceClass).toBe(
      BatteryGeneralizedEvidenceClass.ENGINE_OFF_TRANSITION,
    );
  });

  it('emits REST_WAKE only when cadence or source semantic is qualified', () => {
    const ageMs = R1_NOMINAL_REST_CADENCE_MS;
    const wake = classifyGeneralizedEvidence({
      fields: baseFields(),
      referenceAt,
      actualRestAgeMs: ageMs,
      restWakeCadenceQualified: true,
    });
    expect(wake.evidenceClass).toBe(
      BatteryGeneralizedEvidenceClass.REST_WAKE_VOLTAGE,
    );
  });

  it('F: false trip end — active trip + speed → contaminated', () => {
    const result = classifyGeneralizedEvidence({
      fields: baseFields({
        activeTrip: true,
        speedKmh: 22,
        engineRunning: true,
        ignitionOn: true,
      }),
      referenceAt,
    });
    expect(result.evidenceClass).toBe(
      BatteryGeneralizedEvidenceClass.ACTIVE_VEHICLE_CONTAMINATED,
    );
  });
});

describe('generalized evidence provenance helpers', () => {
  it('computes rest age only from provider field timestamp', async () => {
    const { computeActualRestAgeMs } = await import(
      './generalized-evidence-provenance.helpers'
    );
    const anchor = new Date('2026-09-21T08:00:00.000Z');
    const at = new Date('2026-09-21T16:10:00.000Z');
    expect(
      computeActualRestAgeMs({
        sessionAnchorAt: anchor,
        voltageObservedAt: at,
        voltageTimestampSource: SHUTDOWN_TIMESTAMP_SOURCES.PROVIDER_FIELD_TIMESTAMP,
      }),
    ).toBe(at.getTime() - anchor.getTime());
    expect(
      computeActualRestAgeMs({
        sessionAnchorAt: anchor,
        voltageObservedAt: at,
        voltageTimestampSource: SHUTDOWN_TIMESTAMP_SOURCES.UNKNOWN,
      }),
    ).toBeNull();
  });

  it('valid rest ladder point requires alignment + provider age', async () => {
    const { isValidRestLadderObservation } = await import(
      './generalized-evidence-provenance.helpers'
    );
    expect(
      isValidRestLadderObservation({
        stateAlignmentClass: BatteryShutdownStateAlignmentClass.SKEWED,
        actualRestAgeMs: 1000,
      }),
    ).toBe(false);
    expect(
      isValidRestLadderObservation({
        stateAlignmentClass: BatteryShutdownStateAlignmentClass.ALIGNED,
        actualRestAgeMs: null,
      }),
    ).toBe(false);
    expect(
      isValidRestLadderObservation({
        stateAlignmentClass: BatteryShutdownStateAlignmentClass.ALIGNED,
        actualRestAgeMs: 0,
      }),
    ).toBe(false);
  });
});
