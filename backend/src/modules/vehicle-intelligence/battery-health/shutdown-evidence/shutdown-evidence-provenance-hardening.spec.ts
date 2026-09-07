import {
  buildShutdownFieldBundleFromSnapshotIngest,
  buildTripShutdownContextSnapshotFields,
  resolveProviderLvTimestamp,
  resolveVlsSharedSnapshotTimestamp,
} from './shutdown-evidence-provenance.builder';
import {
  classifyShutdownEvidence,
  resolveStateAlignment,
} from './shutdown-evidence-classification.policy';
import { resolveShutdownEvidenceConfidence } from './shutdown-evidence-confidence.policy';
import {
  BatteryShutdownEvidenceClass,
  BatteryShutdownEvidenceConfidenceClass,
  BatteryShutdownStateAlignmentClass,
} from '@prisma/client';
import { SHUTDOWN_TIMESTAMP_SOURCES } from './shutdown-evidence.constants';

describe('shutdown evidence provenance hardening', () => {
  const tripEndedAt = new Date('2026-09-06T20:00:44.000Z');
  const ingestedAt = new Date('2026-09-06T20:01:00.000Z');
  const providerAt = new Date('2026-09-06T20:00:44.000Z');
  const snapshotAt = new Date('2026-09-06T20:00:30.000Z');

  it('does not fabricate provider LV timestamp when lvBatteryObservedAt absent', () => {
    const resolved = resolveProviderLvTimestamp({
      lvBatteryObservedAt: null,
      ingestedAt,
    });
    expect(resolved.providerObservationAt).toBeNull();
    expect(resolved.effectiveCaptureReferenceAt).toEqual(ingestedAt);
    expect(resolved.voltageObservedAt).toBeNull();
    expect(resolved.voltageTimestampSource).toBe(SHUTDOWN_TIMESTAMP_SOURCES.UNKNOWN);

    const bundle = buildShutdownFieldBundleFromSnapshotIngest({
      snapshotContext: {
        providerFetchedAt: ingestedAt.toISOString(),
        lvBatteryVoltage: 12.2,
        lvBatteryObservedAt: null,
      },
      vls: null,
      tripDetection: null,
      ingestedAt,
    });
    expect(bundle.fields.voltageObservedAt).toBeNull();
    expect(bundle.fields.voltageTimestampSource).toBe(
      SHUTDOWN_TIMESTAMP_SOURCES.UNKNOWN,
    );
  });

  it('cannot reach HIGH clean shutdown confidence without provider field timestamp', () => {
    const fields = buildShutdownFieldBundleFromSnapshotIngest({
      snapshotContext: {
        providerFetchedAt: ingestedAt.toISOString(),
        lvBatteryVoltage: 12.2,
        lvBatteryObservedAt: null,
      },
      vls: {
        speedKmh: 0,
        isIgnitionOn: false,
        engineLoad: 0,
        tractionBatteryIsCharging: false,
        tractionBatteryChargingPowerKw: 0,
        online: true,
        lastSeenAt: ingestedAt,
        sourceTimestamp: ingestedAt,
        providerFetchedAt: ingestedAt,
        syncJobRef: 'poll-1',
      },
      tripDetection: { activeTripId: null, lastActivityAt: tripEndedAt },
      ingestedAt,
    }).fields;

    const classification = classifyShutdownEvidence({
      fields,
      tripEndedAt,
      tripStartedAt: new Date('2026-09-06T19:30:00.000Z'),
      relativeToTripEndMs: 0,
      referenceAt: ingestedAt,
    });

    expect(classification.evidenceClass).not.toBe(
      BatteryShutdownEvidenceClass.POST_ENGINE_OFF_PRE_SLEEP,
    );
    expect(
      resolveShutdownEvidenceConfidence({
        evidenceClass: BatteryShutdownEvidenceClass.UNKNOWN_STATE,
        stateCompleteness: classification.stateCompleteness,
        stateAlignmentClass: classification.stateAlignmentClass,
        fields,
      }),
    ).not.toBe(BatteryShutdownEvidenceConfidenceClass.HIGH);
  });

  it('rejects POST_ENGINE_OFF_PRE_SLEEP when speed is null despite other shutdown signals', () => {
    const fields = buildShutdownFieldBundleFromSnapshotIngest({
      snapshotContext: {
        providerFetchedAt: providerAt.toISOString(),
        lvBatteryVoltage: 12.2,
        lvBatteryObservedAt: providerAt.toISOString(),
      },
      vls: {
        speedKmh: null,
        isIgnitionOn: false,
        engineLoad: 0,
        tractionBatteryIsCharging: false,
        tractionBatteryChargingPowerKw: 0,
        online: true,
        lastSeenAt: providerAt,
        sourceTimestamp: providerAt,
        providerFetchedAt: providerAt,
        syncJobRef: 'poll-1',
      },
      tripDetection: { activeTripId: null, lastActivityAt: tripEndedAt },
      ingestedAt: providerAt,
    }).fields;

    const result = classifyShutdownEvidence({
      fields,
      tripEndedAt,
      tripStartedAt: new Date('2026-09-06T19:30:00.000Z'),
      relativeToTripEndMs: 0,
      referenceAt: providerAt,
    });

    expect(result.evidenceClass).not.toBe(
      BatteryShutdownEvidenceClass.POST_ENGINE_OFF_PRE_SLEEP,
    );
  });

  it('records shared VLS snapshot timestamp across motion fields', () => {
    const bundle = buildShutdownFieldBundleFromSnapshotIngest({
      snapshotContext: {
        providerFetchedAt: ingestedAt.toISOString(),
        lvBatteryVoltage: 12.2,
        lvBatteryObservedAt: providerAt.toISOString(),
      },
      vls: {
        speedKmh: 0,
        isIgnitionOn: false,
        engineLoad: 0,
        tractionBatteryIsCharging: false,
        tractionBatteryChargingPowerKw: 0,
        online: true,
        lastSeenAt: snapshotAt,
        sourceTimestamp: snapshotAt,
        providerFetchedAt: ingestedAt,
        syncJobRef: 'poll-1',
      },
      tripDetection: { activeTripId: null, lastActivityAt: tripEndedAt },
      ingestedAt,
    });

    expect(bundle.vlsSharedSnapshot.source).toBe(
      SHUTDOWN_TIMESTAMP_SOURCES.PROVIDER_SNAPSHOT_TIMESTAMP,
    );
    expect(bundle.fields.speedTimestampSource).toBe(
      SHUTDOWN_TIMESTAMP_SOURCES.PROVIDER_SNAPSHOT_TIMESTAMP,
    );
    expect(bundle.fields.ignitionTimestampSource).toBe(
      SHUTDOWN_TIMESTAMP_SOURCES.PROVIDER_SNAPSHOT_TIMESTAMP,
    );
    expect(bundle.fields.speedObservedAt).toEqual(snapshotAt);
    expect(bundle.fields.voltageTimestampSource).toBe(
      SHUTDOWN_TIMESTAMP_SOURCES.PROVIDER_FIELD_TIMESTAMP,
    );
    expect(bundle.fields.voltageObservedAt).toEqual(providerAt);
  });

  it('does not treat ingest wall-clock as aligned observed state', () => {
    const fields = buildShutdownFieldBundleFromSnapshotIngest({
      snapshotContext: {
        providerFetchedAt: ingestedAt.toISOString(),
        lvBatteryVoltage: 12.2,
        lvBatteryObservedAt: null,
      },
      vls: null,
      tripDetection: { activeTripId: null, lastActivityAt: tripEndedAt },
      ingestedAt,
    }).fields;

    const alignment = resolveStateAlignment(fields, ingestedAt);
    expect(alignment.stateAlignmentClass).toBe(
      BatteryShutdownStateAlignmentClass.UNKNOWN,
    );
  });

  it('labels trip context voltage with shared snapshot provenance not provider field timestamp', () => {
    const snapshot = buildTripShutdownContextSnapshotFields({
      tripId: 'trip-1',
      vehicleId: 'veh-1',
      tripEndedAt,
      capturedAt: ingestedAt,
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
        providerFetchedAt: ingestedAt,
      },
      tripDetection: { activeTripId: null },
    });

    expect(snapshot.fields.voltage.timestampSource).toBe(
      SHUTDOWN_TIMESTAMP_SOURCES.PROVIDER_SNAPSHOT_TIMESTAMP,
    );
    expect(snapshot.vlsSharedSnapshotTimestamp.timestampSource).toBe(
      SHUTDOWN_TIMESTAMP_SOURCES.PROVIDER_SNAPSHOT_TIMESTAMP,
    );
    expect(snapshot.vlsSharedSnapshotTimestamp.sharedFields).toContain('voltage');
  });

  it('classifies strict clean shutdown when all required signals are present', () => {
    const fields = buildShutdownFieldBundleFromSnapshotIngest({
      snapshotContext: {
        providerFetchedAt: providerAt.toISOString(),
        lvBatteryVoltage: 12.2,
        lvBatteryObservedAt: providerAt.toISOString(),
      },
      vls: {
        speedKmh: 0,
        isIgnitionOn: false,
        engineLoad: 0,
        tractionBatteryIsCharging: false,
        tractionBatteryChargingPowerKw: 0,
        online: true,
        lastSeenAt: providerAt,
        sourceTimestamp: providerAt,
        providerFetchedAt: providerAt,
        syncJobRef: 'poll-1',
      },
      tripDetection: { activeTripId: null, lastActivityAt: tripEndedAt },
      ingestedAt: providerAt,
    }).fields;

    const result = classifyShutdownEvidence({
      fields,
      tripEndedAt,
      tripStartedAt: new Date('2026-09-06T19:30:00.000Z'),
      relativeToTripEndMs: 0,
      referenceAt: providerAt,
    });

    expect(result.evidenceClass).toBe(
      BatteryShutdownEvidenceClass.POST_ENGINE_OFF_PRE_SLEEP,
    );
    expect(result.confidenceClass).toBe(
      BatteryShutdownEvidenceConfidenceClass.HIGH,
    );
  });

  it('uses VLS_PROVIDER_FETCHED_AT only when snapshot timestamp absent', () => {
    const fetchedAt = new Date('2026-09-06T19:59:00.000Z');
    const resolved = resolveVlsSharedSnapshotTimestamp({
      sourceTimestamp: null,
      providerFetchedAt: fetchedAt,
    });
    expect(resolved.source).toBe(SHUTDOWN_TIMESTAMP_SOURCES.VLS_PROVIDER_FETCHED_AT);
    expect(resolved.observedAt).toEqual(fetchedAt);
  });
});
