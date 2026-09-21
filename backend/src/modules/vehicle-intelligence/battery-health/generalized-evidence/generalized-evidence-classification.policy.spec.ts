import {
  BatteryGeneralizedEvidenceClass,
  BatteryGeneralizedEvidenceConfidence,
} from '@prisma/client';
import { classifyGeneralizedEvidence } from './generalized-evidence-classification.policy';
import type { GeneralizedEvidenceFieldBundle } from './generalized-evidence.types';
import { SHUTDOWN_TIMESTAMP_SOURCES } from '../shutdown-evidence/shutdown-evidence.constants';
import {
  MIN_REST_WAKE_AGE_AFTER_ANCHOR_MS,
  R1_NOMINAL_REST_CADENCE_MS,
} from './generalized-evidence.constants';

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

describe('classifyGeneralizedEvidence (M3.3A matrix)', () => {
  const referenceAt = new Date('2026-09-21T08:00:00.000Z');

  it('A/B: driving LV then shutdown transition at anchor', () => {
    const driving = classifyGeneralizedEvidence({
      fields: baseFields({
        engineRunning: true,
        ignitionOn: true,
        speedKmh: 45,
      }),
      referenceAt,
    });
    expect(driving.evidenceClass).toBe(
      BatteryGeneralizedEvidenceClass.DRIVING_NON_CHARGING,
    );

    const shutdown = classifyGeneralizedEvidence({
      fields: baseFields(),
      referenceAt,
      actualRestAgeMs: 0,
    });
    expect(shutdown.evidenceClass).toBe(
      BatteryGeneralizedEvidenceClass.ENGINE_OFF_TRANSITION,
    );
  });

  it('B/C: ~8h and ~16h parked samples classify as REST_WAKE (not REST_STABLE)', () => {
    for (const hours of [8, 16, 24]) {
      const ageMs = hours * 60 * 60_000 + (hours === 8 ? 10 * 60_000 : 0);
      const result = classifyGeneralizedEvidence({
        fields: baseFields(),
        referenceAt: new Date(referenceAt.getTime() + ageMs),
        actualRestAgeMs: ageMs,
        restStablePromotionEnabled: false,
      });
      expect(result.evidenceClass).toBe(
        BatteryGeneralizedEvidenceClass.REST_WAKE_VOLTAGE,
      );
      expect(result.evidenceClass).not.toBe(
        BatteryGeneralizedEvidenceClass.REST_STABLE_VOLTAGE,
      );
    }
  });

  it('D: ~16h without prior 8h still REST_WAKE when engine off', () => {
    const ageMs = 16 * 60 * 60_000 + 47 * 60_000;
    const result = classifyGeneralizedEvidence({
      fields: baseFields(),
      referenceAt: new Date(referenceAt.getTime() + ageMs),
      actualRestAgeMs: ageMs,
    });
    expect(result.evidenceClass).toBe(
      BatteryGeneralizedEvidenceClass.REST_WAKE_VOLTAGE,
    );
  });

  it('E: vehicle activity after rest → driving class (session layer terminates separately)', () => {
    const result = classifyGeneralizedEvidence({
      fields: baseFields({
        engineRunning: true,
        ignitionOn: true,
        speedKmh: 30,
      }),
      referenceAt: new Date(referenceAt.getTime() + R1_NOMINAL_REST_CADENCE_MS),
      actualRestAgeMs: R1_NOMINAL_REST_CADENCE_MS,
    });
    expect(result.evidenceClass).toBe(
      BatteryGeneralizedEvidenceClass.DRIVING_NON_CHARGING,
    );
  });

  it('F: false trip end — driving resumes (active trip + speed → contaminated)', () => {
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

  it('I/J: stale replay provider outcome', () => {
    const result = classifyGeneralizedEvidence({
      fields: baseFields(),
      referenceAt,
      providerObservationOutcome: 'STALE_REPLAY',
    });
    expect(result.evidenceClass).toBe(
      BatteryGeneralizedEvidenceClass.STALE_REPLAY,
    );
    expect(result.evidenceConfidence).toBe(
      BatteryGeneralizedEvidenceConfidence.LOW,
    );
  });

  it('L/M: missing speed or engine → STATE_AMBIGUOUS or UNKNOWN', () => {
    const missingSpeed = classifyGeneralizedEvidence({
      fields: baseFields({ speedKmh: null }),
      referenceAt,
    });
    expect(missingSpeed.evidenceClass).toBe(
      BatteryGeneralizedEvidenceClass.STATE_AMBIGUOUS,
    );

    const missingEngine = classifyGeneralizedEvidence({
      fields: baseFields({
        engineRunning: null,
        ignitionOn: null,
        speedKmh: 0,
      }),
      referenceAt,
    });
    expect(missingEngine.evidenceClass).toBe(
      BatteryGeneralizedEvidenceClass.STATE_AMBIGUOUS,
    );
  });

  it('does not emit REST_WAKE before minimum age after anchor', () => {
    const result = classifyGeneralizedEvidence({
      fields: baseFields(),
      referenceAt,
      actualRestAgeMs: MIN_REST_WAKE_AGE_AFTER_ANCHOR_MS - 1,
    });
    expect(result.evidenceClass).toBe(
      BatteryGeneralizedEvidenceClass.ENGINE_OFF_TRANSITION,
    );
  });

  it('REST_STABLE only when promotion explicitly enabled', () => {
    const ageMs = 8 * 60 * 60_000;
    const enabled = classifyGeneralizedEvidence({
      fields: baseFields(),
      referenceAt,
      actualRestAgeMs: ageMs,
      restStablePromotionEnabled: true,
    });
    expect(enabled.evidenceClass).toBe(
      BatteryGeneralizedEvidenceClass.REST_STABLE_VOLTAGE,
    );
  });

  it('charging contamination', () => {
    const result = classifyGeneralizedEvidence({
      fields: baseFields({ isHvCharging: true }),
      referenceAt,
    });
    expect(result.evidenceClass).toBe(
      BatteryGeneralizedEvidenceClass.CHARGING_CONTAMINATED,
    );
  });
});
