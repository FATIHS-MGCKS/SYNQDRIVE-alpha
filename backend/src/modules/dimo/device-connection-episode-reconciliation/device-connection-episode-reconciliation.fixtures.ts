import { DimoConnectionStatus, DimoDeviceConnectionEventType } from '@prisma/client';
import { FIXTURE_VEHICLE_ALIASES } from './device-connection-episode-reconciliation.anonymize';
import {
  buildReconciliationReport,
  deriveEpisodeWindows,
  reconcileVehicleEpisodes,
} from './device-connection-episode-reconciliation.engine';
import { assembleEpisodeHistoricalEvidence } from './device-connection-episode-reconciliation-historical.assembler';
import type { ReconciliationVehicleHistoricalSources } from './device-connection-episode-reconciliation-historical.types';
import type { ReconciliationVehicleInput } from './device-connection-episode-reconciliation.types';

function event(
  id: string,
  type: DimoDeviceConnectionEventType,
  observedAt: string,
  tokenId = 1001,
  opts?: { receivedAt?: string; dedupBucket?: bigint; providerEventIdPresent?: boolean },
) {
  const observed = new Date(observedAt);
  return {
    id,
    eventType: type,
    observedAt: observed,
    receivedAt: new Date(opts?.receivedAt ?? observedAt),
    tokenId,
    dedupBucket: opts?.dedupBucket ?? BigInt(Math.floor(observed.getTime() / 30_000)),
    providerEventIdPresent: opts?.providerEventIdPresent ?? true,
    providerEventIdConflict: false,
  };
}

function baseInput(
  alias: string,
  hardwareType: string,
  overrides: Partial<ReconciliationVehicleInput>,
): ReconciliationVehicleInput {
  return {
    vehicleId: `fixture-${alias}`,
    anonymizedVehicleId: alias,
    provider: 'DIMO',
    hardwareType,
    dimoConnectionStatus: DimoConnectionStatus.CONNECTED,
    bindings: [
      {
        id: 'binding-fixture-1',
        provider: 'DIMO',
        sourceType: 'DIMO',
        sourceSubtype: null,
        isActive: true,
        activatedAt: new Date('2026-01-01T00:00:00.000Z'),
        deactivatedAt: null,
        sourceReferenceId: 'ref-fixture-1',
      },
    ],
    events: [],
    snapshot: {
      observedAt: null,
      receivedAt: null,
      source: 'dimo',
      obdIsPluggedIn: null,
      sameBindingAsEpisode: true,
    },
    telemetry: {
      firstAfterUnplugAt: null,
      lastSeenAt: null,
      sustainedAfterUnplug: false,
    },
    trips: {
      firstTripStartAfterUnplug: null,
      tripCountAfterUnplug: 0,
    },
    alerts: {
      openDeviceUnplugAlert: false,
      openDeviceReconnectAlert: false,
    },
    persistedOpenEpisode: false,
    ...overrides,
  };
}

export const RECONCILIATION_FIXTURE_VEHICLES: ReconciliationVehicleInput[] = [
  baseInput(FIXTURE_VEHICLE_ALIASES.INCIDENT, 'LTE_R1', {
    events: [
      event('inc-unplug', DimoDeviceConnectionEventType.OBD_DEVICE_UNPLUGGED, '2026-07-08T17:21:19.000Z'),
    ],
    snapshot: {
      observedAt: new Date('2026-07-18T09:00:00.000Z'),
      receivedAt: new Date('2026-07-18T09:00:05.000Z'),
      source: 'dimo',
      obdIsPluggedIn: null,
      sameBindingAsEpisode: true,
    },
    telemetry: {
      firstAfterUnplugAt: new Date('2026-07-08T17:21:41.000Z'),
      lastSeenAt: new Date('2026-07-18T09:00:00.000Z'),
      sustainedAfterUnplug: true,
    },
    trips: {
      firstTripStartAfterUnplug: new Date('2026-07-09T08:00:00.000Z'),
      tripCountAfterUnplug: 3,
    },
    persistedOpenEpisode: true,
    alerts: { openDeviceUnplugAlert: true, openDeviceReconnectAlert: false },
  }),
  baseInput(FIXTURE_VEHICLE_ALIASES.EXPLICIT_PLUG, 'LTE_R1', {
    events: [
      event('exp-unplug', DimoDeviceConnectionEventType.OBD_DEVICE_UNPLUGGED, '2026-07-11T18:39:45.000Z'),
      event('exp-plug', DimoDeviceConnectionEventType.OBD_DEVICE_PLUGGED_IN, '2026-07-11T19:05:00.000Z'),
    ],
    snapshot: {
      observedAt: new Date('2026-07-11T19:10:00.000Z'),
      receivedAt: new Date('2026-07-11T19:10:02.000Z'),
      source: 'dimo',
      obdIsPluggedIn: true,
      sameBindingAsEpisode: true,
    },
  }),
  baseInput(FIXTURE_VEHICLE_ALIASES.STALE_SNAPSHOT, 'LTE_R1', {
    events: [
      event('stale-unplug', DimoDeviceConnectionEventType.OBD_DEVICE_UNPLUGGED, '2026-07-10T12:00:00.000Z'),
    ],
    snapshot: {
      observedAt: new Date('2026-07-10T11:00:00.000Z'),
      receivedAt: new Date('2026-07-10T11:00:01.000Z'),
      source: 'dimo',
      obdIsPluggedIn: true,
      sameBindingAsEpisode: true,
    },
    telemetry: {
      firstAfterUnplugAt: new Date('2026-07-10T12:30:00.000Z'),
      lastSeenAt: new Date('2026-07-10T12:30:00.000Z'),
      sustainedAfterUnplug: false,
    },
  }),
  baseInput(FIXTURE_VEHICLE_ALIASES.OEM_TELEMETRY, 'OEM_API', {
    events: [
      event('oem-unplug', DimoDeviceConnectionEventType.OBD_DEVICE_UNPLUGGED, '2026-07-12T08:00:00.000Z'),
    ],
    snapshot: {
      observedAt: new Date('2026-07-12T10:00:00.000Z'),
      receivedAt: new Date('2026-07-12T10:00:00.000Z'),
      source: 'dimo',
      obdIsPluggedIn: null,
      sameBindingAsEpisode: true,
    },
    telemetry: {
      firstAfterUnplugAt: new Date('2026-07-12T09:00:00.000Z'),
      lastSeenAt: new Date('2026-07-12T10:00:00.000Z'),
      sustainedAfterUnplug: true,
    },
    trips: { firstTripStartAfterUnplug: new Date('2026-07-12T09:30:00.000Z'), tripCountAfterUnplug: 1 },
  }),
  baseInput(FIXTURE_VEHICLE_ALIASES.BINDING_CHANGE, 'LTE_R1', {
    bindings: [
      {
        id: 'binding-old',
        provider: 'DIMO',
        sourceType: 'DIMO',
        sourceSubtype: null,
        isActive: false,
        activatedAt: new Date('2026-01-01T00:00:00.000Z'),
        deactivatedAt: new Date('2026-07-05T00:00:00.000Z'),
        sourceReferenceId: 'ref-old',
      },
      {
        id: 'binding-new',
        provider: 'DIMO',
        sourceType: 'DIMO',
        sourceSubtype: null,
        isActive: true,
        activatedAt: new Date('2026-07-05T00:00:00.000Z'),
        deactivatedAt: null,
        sourceReferenceId: 'ref-new',
      },
    ],
    events: [
      event('bind-unplug', DimoDeviceConnectionEventType.OBD_DEVICE_UNPLUGGED, '2026-06-01T10:00:00.000Z', 2001),
    ],
    snapshot: {
      observedAt: new Date('2026-07-18T12:00:00.000Z'),
      receivedAt: new Date('2026-07-18T12:00:01.000Z'),
      source: 'dimo',
      obdIsPluggedIn: true,
      sameBindingAsEpisode: false,
    },
    telemetry: {
      firstAfterUnplugAt: new Date('2026-07-06T08:00:00.000Z'),
      lastSeenAt: new Date('2026-07-18T12:00:00.000Z'),
      sustainedAfterUnplug: true,
    },
    persistedOpenEpisode: true,
  }),
  baseInput(FIXTURE_VEHICLE_ALIASES.DUPLICATE, 'LTE_R1', {
    events: [
      event('dup-unplug-1', DimoDeviceConnectionEventType.OBD_DEVICE_UNPLUGGED, '2026-07-14T10:00:00.000Z'),
      event(
        'dup-unplug-2',
        DimoDeviceConnectionEventType.OBD_DEVICE_UNPLUGGED,
        '2026-07-14T10:00:15.000Z',
        1001,
        { dedupBucket: BigInt(Math.floor(new Date('2026-07-14T10:00:00.000Z').getTime() / 30_000)) },
      ),
    ],
  }),
  baseInput(FIXTURE_VEHICLE_ALIASES.OUT_OF_ORDER, 'LTE_R1', {
    events: [
      event('oo-unplug', DimoDeviceConnectionEventType.OBD_DEVICE_UNPLUGGED, '2026-07-15T12:00:00.000Z'),
      event(
        'oo-plug',
        DimoDeviceConnectionEventType.OBD_DEVICE_PLUGGED_IN,
        '2026-07-15T11:00:00.000Z',
        1001,
        { receivedAt: '2026-07-15T12:05:00.000Z' },
      ),
    ],
  }),
  baseInput(FIXTURE_VEHICLE_ALIASES.UNRESOLVED, 'LTE_R1', {
    events: [
      event('unres-unplug', DimoDeviceConnectionEventType.OBD_DEVICE_UNPLUGGED, '2026-07-16T14:00:00.000Z'),
    ],
    snapshot: {
      observedAt: new Date('2026-07-16T14:05:00.000Z'),
      receivedAt: new Date('2026-07-16T14:05:01.000Z'),
      source: 'dimo',
      obdIsPluggedIn: false,
      sameBindingAsEpisode: true,
    },
    telemetry: {
      firstAfterUnplugAt: null,
      lastSeenAt: new Date('2026-07-16T14:05:00.000Z'),
      sustainedAfterUnplug: false,
    },
    persistedOpenEpisode: true,
    alerts: { openDeviceUnplugAlert: true, openDeviceReconnectAlert: false },
  }),
];

function fixtureHistoricalSources(vehicle: ReconciliationVehicleInput): ReconciliationVehicleHistoricalSources {
  const unplug = vehicle.events.find(
    (e) => e.eventType === DimoDeviceConnectionEventType.OBD_DEVICE_UNPLUGGED,
  );
  const unplugAt = unplug?.observedAt;

  const telemetryObservations: ReconciliationVehicleHistoricalSources['telemetryObservations'] = [];
  if (unplugAt && vehicle.telemetry.firstAfterUnplugAt) {
    telemetryObservations.push({
      providerObservedAt: vehicle.telemetry.firstAfterUnplugAt,
      receivedAt: new Date(vehicle.telemetry.firstAfterUnplugAt.getTime() + 5_000),
      hasOperationalSignal: true,
      connectionStatusActive: true,
      providerBindingId: vehicle.bindings[0]?.id ?? null,
      snapshotReferenceId: 'fixture:tel:1',
    });
    if (vehicle.telemetry.sustainedAfterUnplug) {
      telemetryObservations.push({
        providerObservedAt: new Date(vehicle.telemetry.firstAfterUnplugAt.getTime() + 6 * 60_000),
        receivedAt: new Date(vehicle.telemetry.firstAfterUnplugAt.getTime() + 6 * 60_000 + 5_000),
        hasOperationalSignal: true,
        connectionStatusActive: true,
        providerBindingId: vehicle.bindings[0]?.id ?? null,
        snapshotReferenceId: 'fixture:tel:2',
      });
    }
  }

  const resolutionAudits: ReconciliationVehicleHistoricalSources['resolutionAudits'] = [];
  if (unplugAt && vehicle.snapshot.observedAt && vehicle.snapshot.receivedAt) {
    if (
      vehicle.snapshot.obdIsPluggedIn === true &&
      vehicle.snapshot.observedAt.getTime() > unplugAt.getTime()
    ) {
      resolutionAudits.push({
        providerObservedAt: vehicle.snapshot.observedAt,
        receivedAt: vehicle.snapshot.receivedAt,
        resolutionSnapshotId: 'fixture:snapshot:plug',
        resolutionMethod: 'SNAPSHOT_PLUG_SIGNAL',
        metadata: { obdIsPluggedIn: true },
      });
    } else if (
      vehicle.snapshot.obdIsPluggedIn === false &&
      vehicle.snapshot.observedAt.getTime() > unplugAt.getTime()
    ) {
      resolutionAudits.push({
        providerObservedAt: vehicle.snapshot.observedAt,
        receivedAt: vehicle.snapshot.receivedAt,
        resolutionSnapshotId: 'fixture:snapshot:not-plugged',
        resolutionMethod: 'SNAPSHOT_PLUG_SIGNAL',
        metadata: { obdIsPluggedIn: false },
      });
    } else if (vehicle.snapshot.observedAt.getTime() <= unplugAt.getTime()) {
      resolutionAudits.push({
        providerObservedAt: vehicle.snapshot.observedAt,
        receivedAt: vehicle.snapshot.receivedAt,
        resolutionSnapshotId: 'fixture:snapshot:stale',
        resolutionMethod: 'SNAPSHOT_PLUG_SIGNAL',
        metadata: { obdIsPluggedIn: true },
      });
    }
  }

  const pollLogs: ReconciliationVehicleHistoricalSources['pollLogs'] = [];
  if (unplugAt && vehicle.telemetry.firstAfterUnplugAt) {
    pollLogs.push({
      id: 'poll-fixture-1',
      startedAt: vehicle.telemetry.firstAfterUnplugAt,
      finishedAt: new Date(vehicle.telemetry.firstAfterUnplugAt.getTime() + 2_000),
      status: 'SUCCESS',
    });
  }

  return {
    pollLogs,
    telemetryObservations,
    resolutionAudits,
    clickhouseSnapshots: vehicle.telemetry.sustainedAfterUnplug
      ? [
          {
            recordedAt: vehicle.telemetry.firstAfterUnplugAt!,
            hasOperationalSignal: true,
          },
          {
            recordedAt: new Date(vehicle.telemetry.firstAfterUnplugAt!.getTime() + 6 * 60_000),
            hasOperationalSignal: true,
          },
        ]
      : [],
    latestStateFallback:
      vehicle.snapshot.observedAt &&
      vehicle.snapshot.receivedAt &&
      telemetryObservations.length === 0 &&
      resolutionAudits.length === 0
        ? {
            providerObservedAt: vehicle.snapshot.observedAt,
            receivedAt: vehicle.snapshot.receivedAt,
            processedAt: vehicle.snapshot.receivedAt,
            sourceTimestamp: vehicle.snapshot.observedAt,
            providerFetchedAt: vehicle.snapshot.receivedAt,
            providerBindingId: vehicle.bindings[0]?.id ?? null,
            sourceSubtype: vehicle.bindings[0]?.sourceSubtype ?? null,
            obdIsPluggedIn: vehicle.snapshot.obdIsPluggedIn,
            dimoTokenId: null,
          }
        : null,
  };
}

export function enrichFixtureVehicle(vehicle: ReconciliationVehicleInput): ReconciliationVehicleInput {
  const windows = deriveEpisodeWindows(vehicle);
  const sources = fixtureHistoricalSources(vehicle);
  const tripStarts = vehicle.trips.firstTripStartAfterUnplug
    ? Array.from({ length: vehicle.trips.tripCountAfterUnplug }, (_, i) =>
        new Date(vehicle.trips.firstTripStartAfterUnplug!.getTime() + i * 3_600_000),
      )
    : [];

  const historicalEvidenceByUnplugEventId: Record<string, ReturnType<typeof assembleEpisodeHistoricalEvidence>> =
    {};
  for (const window of windows) {
    historicalEvidenceByUnplugEventId[window.unplugEvent.id] = assembleEpisodeHistoricalEvidence({
      vehicle,
      window,
      sources,
      tripStarts,
    });
  }

  return { ...vehicle, historicalEvidenceByUnplugEventId };
}

export function buildFixtureReconciliationReport() {
  const candidates = RECONCILIATION_FIXTURE_VEHICLES.map(enrichFixtureVehicle).flatMap(
    (vehicle) => reconcileVehicleEpisodes(vehicle),
  );
  return buildReconciliationReport({
    candidates,
    organizationScope: 'FIXTURE_SCOPE',
    vehicleScope: null,
    generatedAt: new Date('2026-07-19T12:00:00.000Z'),
  });
}
