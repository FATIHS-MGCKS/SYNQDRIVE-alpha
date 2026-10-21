import {
  BatteryShutdownEvidenceClass,
  BatteryShutdownEvidenceConfidenceClass,
  BatteryShutdownStateAlignmentClass,
  BatteryShutdownStateCompleteness,
} from '@prisma/client';
import { classifyShutdownEvidence } from './shutdown-evidence-classification.policy';
import type { ShutdownEvidenceFieldBundle } from './shutdown-evidence.types';
import { SHUTDOWN_TIMESTAMP_SOURCES } from './shutdown-evidence.constants';

function baseFields(overrides: Partial<ShutdownEvidenceFieldBundle> = {}): ShutdownEvidenceFieldBundle {
  const at = new Date('2026-09-06T20:00:44.000Z');
  return {
    voltage: 12.2,
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

describe('classifyShutdownEvidence', () => {
  const tripEndedAt = new Date('2026-09-06T20:00:44.000Z');

  it('classifies engine on + alternator voltage as ACTIVE_ALTERNATOR', () => {
    const result = classifyShutdownEvidence({
      fields: baseFields({
        voltage: 14.5,
        engineRunning: true,
        ignitionOn: true,
        speedKmh: 40,
      }),
      tripEndedAt,
      tripStartedAt: new Date('2026-09-06T19:30:00.000Z'),
      relativeToTripEndMs: 0,
      referenceAt: tripEndedAt,
    });
    expect(result.evidenceClass).toBe(BatteryShutdownEvidenceClass.ACTIVE_ALTERNATOR);
  });

  it('classifies aligned trip-finalized shutdown as POST_ENGINE_OFF_PRE_SLEEP', () => {
    const result = classifyShutdownEvidence({
      fields: baseFields({ activeTrip: false }),
      tripEndedAt,
      tripStartedAt: new Date('2026-09-06T19:30:00.000Z'),
      relativeToTripEndMs: 0,
      referenceAt: tripEndedAt,
    });
    expect(result.evidenceClass).toBe(
      BatteryShutdownEvidenceClass.POST_ENGINE_OFF_PRE_SLEEP,
    );
    expect(result.confidenceClass).toBe(
      BatteryShutdownEvidenceConfidenceClass.HIGH,
    );
  });

  it('classifies excessive timestamp skew as STALE_OR_SKEWED_STATE', () => {
    const voltageAt = new Date('2026-09-06T20:00:44.000Z');
    const staleMotionAt = new Date('2026-09-06T19:50:00.000Z');
    const result = classifyShutdownEvidence({
      fields: baseFields({
        speedObservedAt: staleMotionAt,
        ignitionObservedAt: staleMotionAt,
        engineRunningObservedAt: staleMotionAt,
        chargingContextObservedAt: staleMotionAt,
        voltageObservedAt: voltageAt,
      }),
      tripEndedAt,
      tripStartedAt: new Date('2026-09-06T19:30:00.000Z'),
      relativeToTripEndMs: 0,
      referenceAt: voltageAt,
    });
    expect(result.evidenceClass).toBe(
      BatteryShutdownEvidenceClass.STALE_OR_SKEWED_STATE,
    );
    expect(result.stateAlignmentClass).toBe(
      BatteryShutdownStateAlignmentClass.SKEWED,
    );
  });

  it('classifies missing engine state as UNKNOWN_STATE with INSUFFICIENT confidence', () => {
    const result = classifyShutdownEvidence({
      fields: baseFields({
        speedKmh: null,
        ignitionOn: null,
        engineRunning: null,
        speedObservedAt: null,
        ignitionObservedAt: null,
        engineRunningObservedAt: null,
      }),
      tripEndedAt,
      tripStartedAt: new Date('2026-09-06T19:30:00.000Z'),
      relativeToTripEndMs: 0,
      referenceAt: tripEndedAt,
    });
    expect(result.stateCompleteness).toBe(BatteryShutdownStateCompleteness.PARTIAL);
    expect(result.evidenceClass).toBe(BatteryShutdownEvidenceClass.UNKNOWN_STATE);
    expect(result.confidenceClass).toBe(
      BatteryShutdownEvidenceConfidenceClass.INSUFFICIENT,
    );
  });

  it('does not classify null speed as POST_ENGINE_OFF_PRE_SLEEP', () => {
    const result = classifyShutdownEvidence({
      fields: baseFields({
        activeTrip: false,
        speedKmh: null,
        speedObservedAt: null,
        speedTimestampSource: SHUTDOWN_TIMESTAMP_SOURCES.UNKNOWN,
      }),
      tripEndedAt,
      tripStartedAt: new Date('2026-09-06T19:30:00.000Z'),
      relativeToTripEndMs: 0,
      referenceAt: tripEndedAt,
    });
    expect(result.evidenceClass).not.toBe(
      BatteryShutdownEvidenceClass.POST_ENGINE_OFF_PRE_SLEEP,
    );
  });

  it('prefers SHUTDOWN_TRANSITION when engine off but trip still active', () => {
    const result = classifyShutdownEvidence({
      fields: baseFields({ activeTrip: true }),
      tripEndedAt,
      tripStartedAt: new Date('2026-09-06T19:30:00.000Z'),
      relativeToTripEndMs: 0,
      referenceAt: tripEndedAt,
    });
    expect(result.evidenceClass).toBe(
      BatteryShutdownEvidenceClass.SHUTDOWN_TRANSITION,
    );
  });
});
