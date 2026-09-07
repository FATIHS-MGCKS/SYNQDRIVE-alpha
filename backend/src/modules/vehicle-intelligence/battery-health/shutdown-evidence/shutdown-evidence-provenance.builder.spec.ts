import { buildTripShutdownContextSnapshotFields } from './shutdown-evidence-provenance.builder';
import { SHUTDOWN_TIMESTAMP_SOURCES } from './shutdown-evidence.constants';

describe('buildTripShutdownContextSnapshotFields', () => {
  it('records per-field ageMsAtTripEnd relative to trip end', () => {
    const tripEndedAt = new Date('2026-09-06T20:00:44.000Z');
    const voltageAt = new Date('2026-09-06T20:00:30.000Z');
    const motionAt = new Date('2026-09-06T19:58:00.000Z');
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
        lastSeenAt: motionAt,
        sourceTimestamp: voltageAt,
        providerFetchedAt: motionAt,
      },
      tripDetection: { activeTripId: null },
    });

    expect(snapshot.atomicClaim).toBe(false);
    expect(snapshot.fields.voltage.ageMsAtTripEnd).toBe(14_000);
    expect(snapshot.fields.voltage.timestampSource).toBe(
      SHUTDOWN_TIMESTAMP_SOURCES.PROVIDER_SIGNAL_TIMESTAMP,
    );
    // VLS motion fields share sourceTimestamp when present (non-atomic binding)
    expect(snapshot.fields.speedKmh.ageMsAtTripEnd).toBe(14_000);
    expect(snapshot.fields.speedKmh.timestampSource).toBe(
      SHUTDOWN_TIMESTAMP_SOURCES.VLS_SOURCE_TIMESTAMP,
    );
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
