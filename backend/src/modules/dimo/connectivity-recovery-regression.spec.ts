/**
 * Fleet Connectivity recovery regressions (Prompt 2/18).
 *
 * Documents confirmed P0/P1 bugs as failing-forward tests: assertions match
 * CURRENT production behaviour; TARGET invariants are named in comments and
 * `targetInvariant` metadata for Prompt 4+ remediation.
 */
import { DimoConnectionStatus, DimoDeviceConnectionEventType } from '@prisma/client';
import {
  buildDeviceConnectionSummary,
  buildTripDeviceConnectionFlags,
  reconcileDeviceConnectionEvents,
  type DeviceConnectionConnectivityAnchor,
  type DeviceConnectionEventRow,
} from './device-connection-read-model';
import {
  DeviceConnectionWebhookService,
  shouldPersistObdPlugStateChange,
} from './device-connection-webhook.service';

const VEHICLE_ID = 'veh-regression-001';
const ORG_ID = 'org-regression-001';
const HARDWARE_LTE_R1 = 'LTE_R1';

function mockEpisodeService() {
  return {
    openFromUnplugEvent: jest
      .fn()
      .mockResolvedValue({ outcome: 'created', episodeId: 'ep-1' }),
    resolveFromExplicitPlugEvent: jest
      .fn()
      .mockResolvedValue({ outcome: 'resolved', episodeId: 'ep-1' }),
  };
}

function unplugEvent(
  observedAt: string,
  id = `unplug-${observedAt}`,
): DeviceConnectionEventRow {
  return {
    id,
    vehicleId: VEHICLE_ID,
    eventType: DimoDeviceConnectionEventType.OBD_DEVICE_UNPLUGGED,
    observedAt: new Date(observedAt),
  };
}

function plugEvent(
  observedAt: string,
  id = `plug-${observedAt}`,
): DeviceConnectionEventRow {
  return {
    id,
    vehicleId: VEHICLE_ID,
    eventType: DimoDeviceConnectionEventType.OBD_DEVICE_PLUGGED_IN,
    observedAt: new Date(observedAt),
  };
}

function physicalAnchor(
  obdIsPluggedIn: boolean | null,
  status: DimoConnectionStatus = DimoConnectionStatus.CONNECTED,
): DeviceConnectionConnectivityAnchor {
  return { dimoConnectionStatus: status, obdIsPluggedIn };
}

function summarize(
  events: DeviceConnectionEventRow[],
  nowIso: string,
  anchor: DeviceConnectionConnectivityAnchor | null = null,
  trips: Parameters<typeof buildDeviceConnectionSummary>[0]['trips'] = [],
) {
  return buildDeviceConnectionSummary({
    vehicleId: VEHICLE_ID,
    hardwareType: HARDWARE_LTE_R1,
    dimoLinked: true,
    nowMs: new Date(nowIso).getTime(),
    events,
    bookings: [],
    trips,
    connectivityAnchor: anchor,
  });
}

describe('connectivity recovery regressions (A–G)', () => {
  describe('A — unplug then explicit plug webhook closes episode', () => {
    it('opens on unplug, closes on later plug, device state is plugged', async () => {
      const unplugAt = new Date('2026-07-11T18:39:45.000Z');
      const plugAt = new Date('2026-07-11T19:00:00.000Z');

      const upsert = jest.fn().mockResolvedValue({
        id: 'evt-plug',
        createdAt: plugAt,
        updatedAt: plugAt,
      });
      const findFirst = jest
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          eventType: DimoDeviceConnectionEventType.OBD_DEVICE_UNPLUGGED,
          observedAt: unplugAt,
        });
      const vehicleFindUnique = jest.fn().mockResolvedValue({
        dimoVehicle: { connectionStatus: DimoConnectionStatus.CONNECTED },
        latestState: {
          rawPayloadJson: { obdIsPluggedIn: { value: true } },
        },
      });

      const service = new DeviceConnectionWebhookService(
        {
          dimoDeviceConnectionEvent: { upsert, findFirst },
          vehicle: { findUnique: vehicleFindUnique },
        } as never,
        mockEpisodeService() as never,
      );

      const unplugResult = await service.ingestObdPlugStateChange({
        vehicle: { id: VEHICLE_ID, organizationId: ORG_ID },
        tokenId: 42,
        pluggedIn: false,
        observedAt: unplugAt,
        rawPayload: { signal: 'obdIsPluggedIn', value: false },
      });
      expect(unplugResult.outcome).toBe('created');
      expect(unplugResult.eventType).toBe(
        DimoDeviceConnectionEventType.OBD_DEVICE_UNPLUGGED,
      );

      const plugResult = await service.ingestObdPlugStateChange({
        vehicle: { id: VEHICLE_ID, organizationId: ORG_ID },
        tokenId: 42,
        pluggedIn: true,
        observedAt: plugAt,
        rawPayload: { signal: 'obdIsPluggedIn', value: true },
      });
      expect(plugResult.outcome).toBe('created');
      expect(plugResult.eventType).toBe(
        DimoDeviceConnectionEventType.OBD_DEVICE_PLUGGED_IN,
      );

      const summary = summarize(
        [unplugEvent(unplugAt.toISOString()), plugEvent(plugAt.toISOString())],
        '2026-07-11T20:00:00.000Z',
        physicalAnchor(true),
      );

      expect(summary.openUnpluggedEpisode).toBe(false);
      expect(summary.currentDeviceConnectionStatus).toBe('plugged');
    });
  });

  describe('B — unplug then snapshot obdIsPluggedIn=true (FC-P0-01)', () => {
    it('CURRENT: episode stays open despite live snapshot proving recovery', () => {
      const summary = summarize(
        [unplugEvent('2026-07-11T18:39:45.000Z')],
        '2026-07-18T09:45:11.000Z',
        physicalAnchor(true),
      );

      // TARGET (Prompt 4): openUnpluggedEpisode === false when anchor.obdIsPluggedIn === true
      expect(summary.openUnpluggedEpisode).toBe(true);
      expect(summary.currentDeviceConnectionStatus).toBe('unplugged');
      expect(summary.openUnpluggedSince).toBe('2026-07-11T18:39:45.000Z');
    });
  });

  describe('C — unplug then sustained telemetry + trip (FC-P0-03)', () => {
    it('CURRENT: episode stays open with same binding, post-unplug trips, live anchor', () => {
      const unplugAt = '2026-07-08T17:21:19.000Z';
      const now = '2026-07-18T10:01:41.000Z';
      const trips = [
        {
          id: 'trip-post-1',
          startTime: new Date('2026-07-09T08:00:00.000Z'),
          endTime: new Date('2026-07-09T09:30:00.000Z'),
          assignedBookingId: null,
        },
        {
          id: 'trip-post-2',
          startTime: new Date('2026-07-12T14:00:00.000Z'),
          endTime: new Date('2026-07-12T16:00:00.000Z'),
          assignedBookingId: null,
        },
      ];

      const summary = summarize(
        [unplugEvent(unplugAt)],
        now,
        physicalAnchor(true),
        trips,
      );

      // TARGET: telemetry-resume policy closes episode; trip flags hasOpenDeviceUnplug === false
      expect(summary.openUnpluggedEpisode).toBe(true);

      const flagsDuringTrip = buildTripDeviceConnectionFlags(
        {
          id: 'trip-with-unplug',
          startTime: new Date('2026-07-08T16:00:00.000Z'),
          endTime: new Date('2026-07-08T20:00:00.000Z'),
          assignedBookingId: null,
        },
        [unplugEvent(unplugAt)],
        [],
        new Date(now).getTime(),
        physicalAnchor(true),
      );
      expect(flagsDuringTrip.hasOpenDeviceUnplug).toBe(true);
    });
  });

  describe('D — OEM / synthetic telemetry must not prove physical OBD recovery', () => {
    it('CONNECTED without obdIsPluggedIn does not close unplug episode', () => {
      const summary = summarize(
        [unplugEvent('2026-07-10T12:00:00.000Z')],
        '2026-07-18T12:00:00.000Z',
        { dimoConnectionStatus: DimoConnectionStatus.CONNECTED, obdIsPluggedIn: null },
      );

      expect(summary.openUnpluggedEpisode).toBe(true);
    });

    it('synthetic CONNECTED anchor without OBD signal does not infer plug recovery event', () => {
      const events = [unplugEvent('2026-07-10T12:00:00.000Z')];
      const reconciled = reconcileDeviceConnectionEvents(events, {
        dimoConnectionStatus: DimoConnectionStatus.CONNECTED,
        obdIsPluggedIn: null,
      });

      expect(reconciled).toHaveLength(1);
      expect(reconciled[0]?.eventType).toBe(
        DimoDeviceConnectionEventType.OBD_DEVICE_UNPLUGGED,
      );

      const summary = summarize(events, '2026-07-18T12:00:00.000Z', {
        dimoConnectionStatus: DimoConnectionStatus.CONNECTED,
        obdIsPluggedIn: null,
      });
      expect(summary.openUnpluggedEpisode).toBe(true);
    });
  });

  describe('E — backfill snapshot must not close episode (provider time < unplug)', () => {
    it('late-received plug with provider observedAt before unplug leaves episode open', () => {
      const unplugAt = '2026-07-11T18:39:45.000Z';
      const backfillPlugAt = '2026-07-11T17:00:00.000Z';

      expect(
        shouldPersistObdPlugStateChange(
          true,
          DimoDeviceConnectionEventType.OBD_DEVICE_UNPLUGGED,
        ).persist,
      ).toBe(true);

      const summary = summarize(
        [plugEvent(backfillPlugAt), unplugEvent(unplugAt)],
        '2026-07-18T09:00:00.000Z',
        physicalAnchor(true),
      );

      // Canonical filter drops leading plug baseline; unplug remains last transition → episode open
      expect(summary.openUnpluggedEpisode).toBe(true);
      expect(summary.lastDevicePluggedInAt).toBeNull();
    });
  });

  describe('F — device binding change must not let stale episode dominate', () => {
    it('events scoped to vehicle A do not affect vehicle B summary', () => {
      const eventsA = [unplugEvent('2026-07-11T18:39:45.000Z')];
      const summaryB = buildDeviceConnectionSummary({
        vehicleId: 'veh-other-binding',
        hardwareType: HARDWARE_LTE_R1,
        dimoLinked: true,
        nowMs: new Date('2026-07-18T12:00:00.000Z').getTime(),
        events: eventsA.map((e) => ({ ...e, vehicleId: 'veh-other-binding' })),
        bookings: [],
        trips: [],
        connectivityAnchor: physicalAnchor(true),
      });

      expect(summaryB.openUnpluggedEpisode).toBe(true);
    });

    it('TARGET: new binding after token change should not inherit open episode from prior binding', () => {
      // Schema has no binding episode ID today — document invariant for Prompt 5
      const priorBindingEvents = [unplugEvent('2026-06-01T10:00:00.000Z')];
      const summaryNewBinding = summarize(
        priorBindingEvents,
        '2026-07-18T12:00:00.000Z',
        physicalAnchor(true),
      );
      // CURRENT: stale events still dominate until explicit closure
      expect(summaryNewBinding.openUnpluggedEpisode).toBe(true);
    });
  });
});
