import { DimoConnectionStatus, DimoDeviceConnectionEventType } from '@prisma/client';
import { FIXTURE_VEHICLE_ALIASES } from './device-connection-episode-reconciliation.anonymize';
import {
  buildReconciliationReport,
  reconcileVehicleEpisodes,
} from './device-connection-episode-reconciliation.engine';
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

export function buildFixtureReconciliationReport() {
  const candidates = RECONCILIATION_FIXTURE_VEHICLES.flatMap((vehicle) =>
    reconcileVehicleEpisodes(vehicle),
  );
  return buildReconciliationReport({
    candidates,
    organizationScope: 'FIXTURE_SCOPE',
    vehicleScope: null,
    generatedAt: new Date('2026-07-19T12:00:00.000Z'),
  });
}
