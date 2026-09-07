import {
  buildTripShutdownContextSnapshotFields,
  resolveProviderLvTimestamp,
} from './shutdown-evidence-provenance.builder';
import { SHUTDOWN_TIMESTAMP_SOURCES } from './shutdown-evidence.constants';

describe('buildTripShutdownContextSnapshotFields', () => {
  it('records per-field ageMsAtTripEnd relative to trip end', () => {
    const tripEndedAt = new Date('2026-09-06T20:00:44.000Z');
    const snapshotAt = new Date('2026-09-06T20:00:30.000Z');
    const capturedAt = new Date('2026-09-06T20:00:45.000Z');

    const snapshot = buildTripShutdownContextSnapshotFields({
      tripId: 'trip-1',
      vehicleId: 'veh-1',
      tripEndedAt,
      capturedAt,
      vls: {
        lvBatteryVoltage: 12.15,
        speedKmh: 0,
        isIgnitionOn: false,
        engineLoad: 0,
        tractionBatteryIsCharging: false,
        tractionBatteryChargingPowerKw: 0,
        online: true,
        lastSeenAt: snapshotAt,
        sourceTimestamp: snapshotAt,
        providerFetchedAt: snapshotAt,
      },
      tripDetection: { activeTripId: null },
    });

    expect(snapshot.atomicClaim).toBe(false);
    expect(snapshot.fields.voltage.ageMsAtTripEnd).toBe(14_000);
    expect(snapshot.fields.voltage.timestampSource).toBe(
      SHUTDOWN_TIMESTAMP_SOURCES.PROVIDER_SNAPSHOT_TIMESTAMP,
    );
    expect(snapshot.fields.speedKmh.ageMsAtTripEnd).toBe(14_000);
  });

  it('falls back to providerFetchedAt age when sourceTimestamp absent', () => {
    const tripEndedAt = new Date('2026-09-06T20:00:44.000Z');
    const motionAt = new Date('2026-09-06T19:58:00.000Z');

    const snapshot = buildTripShutdownContextSnapshotFields({
      tripId: 'trip-1',
      vehicleId: 'veh-1',
      tripEndedAt,
      capturedAt: tripEndedAt,
      vls: {
        lvBatteryVoltage: 12.15,
        speedKmh: 0,
        isIgnitionOn: false,
        engineLoad: 0,
        tractionBatteryIsCharging: false,
        tractionBatteryChargingPowerKw: 0,
        online: true,
        lastSeenAt: motionAt,
        sourceTimestamp: null,
        providerFetchedAt: motionAt,
      },
      tripDetection: { activeTripId: null },
    });

    expect(snapshot.fields.speedKmh.ageMsAtTripEnd).toBe(164_000);
    expect(snapshot.fields.speedKmh.timestampSource).toBe(
      SHUTDOWN_TIMESTAMP_SOURCES.VLS_PROVIDER_FETCHED_AT,
    );
  });
});

describe('resolveProviderLvTimestamp', () => {
  it('never labels ingest time as provider field timestamp', () => {
    const ingestedAt = new Date('2026-09-06T20:01:00.000Z');
    const resolved = resolveProviderLvTimestamp({
      lvBatteryObservedAt: null,
      ingestedAt,
    });
    expect(resolved.voltageObservedAt).toBeNull();
    expect(resolved.voltageTimestampSource).not.toBe(
      SHUTDOWN_TIMESTAMP_SOURCES.PROVIDER_FIELD_TIMESTAMP,
    );
  });
});
