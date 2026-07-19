import { DimoDeviceConnectionEventType } from '@prisma/client';
import { deriveEpisodeWindows } from './device-connection-episode-reconciliation.engine';
import { FIXTURE_VEHICLE_ALIASES } from './device-connection-episode-reconciliation.anonymize';
import {
  RECONCILIATION_FIXTURE_VEHICLES,
  enrichFixtureVehicle,
} from './device-connection-episode-reconciliation.fixtures';
import {
  assembleEpisodeHistoricalEvidence,
  historicalEvidenceSupportsSnapshotRecovery,
  historicalEvidenceSupportsTelemetryRecovery,
} from './device-connection-episode-reconciliation-historical.assembler';
import type { ReconciliationVehicleHistoricalSources } from './device-connection-episode-reconciliation-historical.types';
import type { ReconciliationVehicleInput } from './device-connection-episode-reconciliation.types';

function event(
  id: string,
  type: DimoDeviceConnectionEventType,
  observedAt: string,
  receivedAt?: string,
) {
  const observed = new Date(observedAt);
  return {
    id,
    eventType: type,
    observedAt: observed,
    receivedAt: new Date(receivedAt ?? observedAt),
    tokenId: 1001,
    dedupBucket: BigInt(Math.floor(observed.getTime() / 30_000)),
    providerEventIdPresent: true,
    providerEventIdConflict: false,
  };
}

function baseVehicle(overrides: Partial<ReconciliationVehicleInput> = {}): ReconciliationVehicleInput {
  return {
    vehicleId: 'veh-test',
    anonymizedVehicleId: 'VEHICLE_TEST',
    provider: 'DIMO',
    hardwareType: 'LTE_R1',
    dimoConnectionStatus: null,
    bindings: [
      {
        id: 'bind-1',
        provider: 'DIMO',
        sourceType: 'DIMO',
        sourceSubtype: null,
        isActive: true,
        activatedAt: new Date('2026-01-01T00:00:00.000Z'),
        deactivatedAt: null,
        sourceReferenceId: 'ref-1',
      },
    ],
    events: [
      event('unplug-1', DimoDeviceConnectionEventType.OBD_DEVICE_UNPLUGGED, '2026-07-08T17:21:19.000Z'),
    ],
    snapshot: { observedAt: null, receivedAt: null, source: null, obdIsPluggedIn: null, sameBindingAsEpisode: true },
    telemetry: { firstAfterUnplugAt: null, lastSeenAt: null, sustainedAfterUnplug: false },
    trips: { firstTripStartAfterUnplug: null, tripCountAfterUnplug: 0 },
    alerts: { openDeviceUnplugAlert: false, openDeviceReconnectAlert: false },
    persistedOpenEpisode: true,
    ...overrides,
  };
}

describe('device-connection-episode-reconciliation-historical', () => {
  it('builds incident timeline with separate observedAt and receivedAt', () => {
    const vehicle = baseVehicle();
    const window = deriveEpisodeWindows(vehicle)[0]!;
    const sources: ReconciliationVehicleHistoricalSources = {
      pollLogs: [],
      telemetryObservations: [
        {
          providerObservedAt: new Date('2026-07-08T17:21:41.000Z'),
          receivedAt: new Date('2026-07-08T17:21:41.313Z'),
          hasOperationalSignal: true,
          connectionStatusActive: true,
          providerBindingId: 'bind-1',
          snapshotReferenceId: 'vls:incident:1',
        },
        {
          providerObservedAt: new Date('2026-07-08T17:27:41.000Z'),
          receivedAt: new Date('2026-07-08T17:27:41.500Z'),
          hasOperationalSignal: true,
          connectionStatusActive: true,
          providerBindingId: 'bind-1',
          snapshotReferenceId: 'vls:incident:2',
        },
      ],
      resolutionAudits: [],
      clickhouseSnapshots: [],
      latestStateFallback: null,
    };

    const evidence = assembleEpisodeHistoricalEvidence({
      vehicle,
      window,
      sources,
      tripStarts: [new Date('2026-07-09T08:00:00.000Z')],
    });

    expect(evidence.unplugObservedAt).toBe('2026-07-08T17:21:19.000Z');
    expect(evidence.firstSnapshotAfterUnplug?.providerObservedAt).toBe('2026-07-08T17:21:41.000Z');
    expect(evidence.firstSnapshotAfterUnplug?.receivedAt).toBe('2026-07-08T17:21:41.313Z');
    expect(evidence.firstSnapshotAfterUnplug?.providerObservedAt).not.toBe(
      evidence.firstSnapshotAfterUnplug?.receivedAt,
    );
    expect(evidence.sustainedTelemetryFromHistory).toBe(true);
    expect(evidence.tripCountAfterUnplug).toBe(1);
  });

  it('rejects delayed old snapshot as backfill evidence', () => {
    const vehicle = baseVehicle();
    const window = deriveEpisodeWindows(vehicle)[0]!;
    const sources: ReconciliationVehicleHistoricalSources = {
      pollLogs: [],
      telemetryObservations: [],
      resolutionAudits: [
        {
          providerObservedAt: new Date('2026-07-08T17:22:00.000Z'),
          receivedAt: new Date('2026-07-10T00:00:00.000Z'),
          resolutionSnapshotId: 'stale',
          resolutionMethod: 'SNAPSHOT_PLUG_SIGNAL',
          metadata: { obdIsPluggedIn: true },
        },
      ],
      clickhouseSnapshots: [],
      latestStateFallback: null,
    };

    const evidence = assembleEpisodeHistoricalEvidence({ vehicle, window, sources, tripStarts: [] });
    expect(evidence.backfillIndicator).toBe(true);
    expect(evidence.delayedSnapshotCount).toBeGreaterThan(0);

    const support = historicalEvidenceSupportsSnapshotRecovery(evidence, 'bind-1');
    expect(support.eligible).toBe(false);
    expect(support.conflicts).toContain('DELAYED_BACKFILL_ONLY_EVIDENCE');
  });

  it('supports real snapshot series with plug signal after unplug', () => {
    const vehicle = baseVehicle();
    const window = deriveEpisodeWindows(vehicle)[0]!;
    const sources: ReconciliationVehicleHistoricalSources = {
      pollLogs: [
        {
          id: 'poll-1',
          startedAt: new Date('2026-07-08T17:22:00.000Z'),
          finishedAt: new Date('2026-07-08T17:22:02.000Z'),
          status: 'SUCCESS',
        },
      ],
      telemetryObservations: [],
      resolutionAudits: [
        {
          providerObservedAt: new Date('2026-07-08T17:22:00.000Z'),
          receivedAt: new Date('2026-07-08T17:22:05.000Z'),
          resolutionSnapshotId: 'snap-plug',
          resolutionMethod: 'SNAPSHOT_PLUG_SIGNAL',
          metadata: { obdIsPluggedIn: true },
        },
      ],
      clickhouseSnapshots: [
        { recordedAt: new Date('2026-07-08T17:22:00.000Z'), hasOperationalSignal: true },
      ],
      latestStateFallback: null,
    };

    const evidence = assembleEpisodeHistoricalEvidence({ vehicle, window, sources, tripStarts: [] });
    expect(evidence.samplesAfterUnplug).toBeGreaterThanOrEqual(2);
    expect(evidence.sourcesPresent).toEqual(
      expect.arrayContaining(['resolution_audit', 'dimo_poll_log', 'clickhouse_telemetry_mirror']),
    );

    const support = historicalEvidenceSupportsSnapshotRecovery(evidence, 'bind-1');
    expect(support.eligible).toBe(true);
    expect(evidence.applyEvidence?.kind).toBe('snapshot_signal');
  });

  it('marks latest-state-only evidence as insufficient for historical apply', () => {
    const vehicle = baseVehicle();
    const window = deriveEpisodeWindows(vehicle)[0]!;
    const sources: ReconciliationVehicleHistoricalSources = {
      pollLogs: [],
      telemetryObservations: [],
      resolutionAudits: [],
      clickhouseSnapshots: [],
      latestStateFallback: {
        providerObservedAt: new Date('2026-07-18T09:00:00.000Z'),
        receivedAt: new Date('2026-07-18T09:00:05.000Z'),
        processedAt: new Date('2026-07-18T09:00:05.000Z'),
        sourceTimestamp: new Date('2026-07-18T09:00:00.000Z'),
        providerFetchedAt: new Date('2026-07-18T09:00:05.000Z'),
        providerBindingId: 'bind-1',
        sourceSubtype: null,
        obdIsPluggedIn: true,
        dimoTokenId: 1001,
      },
    };

    const evidence = assembleEpisodeHistoricalEvidence({ vehicle, window, sources, tripStarts: [] });
    expect(evidence.latestStateOnlyEvidence).toBe(true);
    expect(evidence.sourcesPresent).toContain('vehicle_latest_state_only');

    const support = historicalEvidenceSupportsSnapshotRecovery(evidence, 'bind-1');
    expect(support.eligible).toBe(false);
    expect(support.conflicts).toContain('LATEST_STATE_ONLY_INSUFFICIENT_FOR_HISTORICAL_APPLY');
  });

  it('fixture OEM path remains NOT_ENOUGH_DATA without OBD closure', () => {
    const vehicle = RECONCILIATION_FIXTURE_VEHICLES.find(
      (v) => v.anonymizedVehicleId === FIXTURE_VEHICLE_ALIASES.OEM_TELEMETRY,
    )!;
    const enriched = enrichFixtureVehicle(vehicle);
    const evidence = enriched.historicalEvidenceByUnplugEventId?.['oem-unplug'];
    expect(evidence?.sustainedTelemetryFromHistory).toBe(true);
    expect(historicalEvidenceSupportsTelemetryRecovery(evidence!).eligible).toBe(true);
  });

  it('detects binding change in historical window', () => {
    const vehicle = RECONCILIATION_FIXTURE_VEHICLES.find(
      (v) => v.anonymizedVehicleId === FIXTURE_VEHICLE_ALIASES.BINDING_CHANGE,
    )!;
    const evidence = enrichFixtureVehicle(vehicle).historicalEvidenceByUnplugEventId?.['bind-unplug'];
    expect(evidence?.bindingChangedInWindow).toBe(true);
  });

  it('returns NOT_ENOUGH_DATA conflicts when history is missing', () => {
    const vehicle = baseVehicle();
    const window = deriveEpisodeWindows(vehicle)[0]!;
    const evidence = assembleEpisodeHistoricalEvidence({
      vehicle,
      window,
      sources: {
        pollLogs: [],
        telemetryObservations: [],
        resolutionAudits: [],
        clickhouseSnapshots: [],
        latestStateFallback: null,
      },
      tripStarts: [],
    });

    expect(evidence.sampleCount).toBe(0);
    expect(historicalEvidenceSupportsTelemetryRecovery(evidence).conflicts).toContain(
      'TELEMETRY_NOT_SUSTAINED',
    );
  });

  it('flags provider lag via backfill indicators', () => {
    const vehicle = baseVehicle();
    const window = deriveEpisodeWindows(vehicle)[0]!;
    const sources: ReconciliationVehicleHistoricalSources = {
      pollLogs: [],
      telemetryObservations: [
        {
          providerObservedAt: new Date('2026-07-08T17:22:00.000Z'),
          receivedAt: new Date('2026-07-08T18:00:00.000Z'),
          hasOperationalSignal: true,
          connectionStatusActive: true,
          providerBindingId: 'bind-1',
          snapshotReferenceId: 'lag-1',
        },
      ],
      resolutionAudits: [],
      clickhouseSnapshots: [],
      latestStateFallback: null,
    };

    const evidence = assembleEpisodeHistoricalEvidence({ vehicle, window, sources, tripStarts: [] });
    expect(evidence.backfillIndicator).toBe(true);
    expect(evidence.firstSnapshotAfterUnplug?.receivedAt).not.toBe(
      evidence.firstSnapshotAfterUnplug?.providerObservedAt,
    );
  });
});
