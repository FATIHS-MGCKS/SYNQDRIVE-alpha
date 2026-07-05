import { DimoDeviceConnectionEventType } from '@prisma/client';
import {
  buildDeviceConnectionSummary,
  buildFleetDeviceConnectionFields,
  buildTripDeviceConnectionFlags,
  filterCanonicalDeviceConnectionEvents,
  severityForUnplugEvent,
} from './device-connection-read-model';

describe('device-connection-read-model', () => {
  const nowMs = new Date('2026-06-28T12:00:00.000Z').getTime();

  it('marks open unplugged episode when unplug is newer than last plug', () => {
    const summary = buildDeviceConnectionSummary({
      vehicleId: 'v-1',
      hardwareType: 'LTE_R1',
      dimoLinked: true,
      nowMs,
      events: [
        {
          id: 'e1',
          vehicleId: 'v-1',
          eventType: DimoDeviceConnectionEventType.OBD_DEVICE_UNPLUGGED,
          observedAt: new Date('2026-06-28T11:00:00.000Z'),
        },
        {
          id: 'e2',
          vehicleId: 'v-1',
          eventType: DimoDeviceConnectionEventType.OBD_DEVICE_PLUGGED_IN,
          observedAt: new Date('2026-06-28T10:00:00.000Z'),
        },
      ],
      bookings: [],
      trips: [],
    });

    expect(summary.openUnpluggedEpisode).toBe(true);
    expect(summary.currentDeviceConnectionStatus).toBe('unplugged');
    expect(summary.severity).toBe('warning');
  });

  it('uses critical severity when unplugged during active booking', () => {
    const summary = buildDeviceConnectionSummary({
      vehicleId: 'v-1',
      hardwareType: 'LTE_R1',
      dimoLinked: true,
      nowMs,
      events: [
        {
          id: 'e1',
          vehicleId: 'v-1',
          eventType: DimoDeviceConnectionEventType.OBD_DEVICE_UNPLUGGED,
          observedAt: new Date('2026-06-28T11:30:00.000Z'),
        },
      ],
      bookings: [
        {
          id: 'b-1',
          startDate: new Date('2026-06-28T10:00:00.000Z'),
          endDate: new Date('2026-06-28T14:00:00.000Z'),
          status: 'ACTIVE',
        },
      ],
      trips: [],
    });

    expect(summary.severity).toBe('critical');
    expect(summary.rentalRelevant).toBe(true);
    expect(summary.activeBookingId).toBe('b-1');
    expect(severityForUnplugEvent(true)).toBe('critical');
  });

  it('projects compact fleet fields with webhook source', () => {
    const summary = buildDeviceConnectionSummary({
      vehicleId: 'v-1',
      hardwareType: 'LTE_R1',
      dimoLinked: true,
      nowMs,
      events: [
        {
          id: 'e0',
          vehicleId: 'v-1',
          eventType: DimoDeviceConnectionEventType.OBD_DEVICE_UNPLUGGED,
          observedAt: new Date('2026-06-28T10:30:00.000Z'),
        },
        {
          id: 'e1',
          vehicleId: 'v-1',
          eventType: DimoDeviceConnectionEventType.OBD_DEVICE_PLUGGED_IN,
          observedAt: new Date('2026-06-28T11:00:00.000Z'),
        },
      ],
      bookings: [],
      trips: [],
    });

    const fleet = buildFleetDeviceConnectionFields(summary);
    expect(fleet.eventSource).toBe('dimo_webhook');
    expect(fleet.currentDeviceConnectionStatus).toBe('plugged');
    expect(fleet.severity).toBe('info');
  });

  it('builds per-trip flags for unplug and plug during trip window', () => {
    const trip = {
      id: 'trip-1',
      startTime: new Date('2026-06-28T10:00:00.000Z'),
      endTime: new Date('2026-06-28T11:00:00.000Z'),
      assignedBookingId: 'b-1',
    };
    const events = [
      {
        id: 'e1',
        vehicleId: 'v-1',
        eventType: DimoDeviceConnectionEventType.OBD_DEVICE_UNPLUGGED,
        observedAt: new Date('2026-06-28T10:15:00.000Z'),
      },
      {
        id: 'e2',
        vehicleId: 'v-1',
        eventType: DimoDeviceConnectionEventType.OBD_DEVICE_PLUGGED_IN,
        observedAt: new Date('2026-06-28T10:20:00.000Z'),
      },
    ];
    const bookings = [
      {
        id: 'b-1',
        startDate: new Date('2026-06-28T09:00:00.000Z'),
        endDate: new Date('2026-06-28T12:00:00.000Z'),
        status: 'ACTIVE',
      },
    ];

    const flags = buildTripDeviceConnectionFlags(trip, events, bookings, nowMs);
    expect(flags.hasDeviceConnectionEvent).toBe(true);
    expect(flags.deviceUnpluggedCount).toBe(1);
    expect(flags.devicePluggedInCount).toBe(1);
    expect(flags.hasOpenDeviceUnplug).toBe(false);
    expect(flags.deviceConnectionRentalRelevant).toBe(true);
    expect(flags.deviceConnectionSeverity).toBe('critical');
  });

  it('removes baseline and consecutive plug spam', () => {
    const canonical = filterCanonicalDeviceConnectionEvents([
      {
        id: 'e1',
        vehicleId: 'v-1',
        eventType: DimoDeviceConnectionEventType.OBD_DEVICE_PLUGGED_IN,
        observedAt: new Date('2026-06-28T20:50:11.000Z'),
      },
      {
        id: 'e2',
        vehicleId: 'v-1',
        eventType: DimoDeviceConnectionEventType.OBD_DEVICE_PLUGGED_IN,
        observedAt: new Date('2026-06-28T20:50:37.000Z'),
      },
      {
        id: 'e3',
        vehicleId: 'v-1',
        eventType: DimoDeviceConnectionEventType.OBD_DEVICE_PLUGGED_IN,
        observedAt: new Date('2026-06-28T20:51:03.000Z'),
      },
    ]);
    expect(canonical).toHaveLength(0);
  });

  it('keeps real unplug then plug transitions', () => {
    const canonical = filterCanonicalDeviceConnectionEvents([
      {
        id: 'e1',
        vehicleId: 'v-1',
        eventType: DimoDeviceConnectionEventType.OBD_DEVICE_UNPLUGGED,
        observedAt: new Date('2026-06-28T10:00:00.000Z'),
      },
      {
        id: 'e2',
        vehicleId: 'v-1',
        eventType: DimoDeviceConnectionEventType.OBD_DEVICE_PLUGGED_IN,
        observedAt: new Date('2026-06-28T10:05:00.000Z'),
      },
      {
        id: 'e3',
        vehicleId: 'v-1',
        eventType: DimoDeviceConnectionEventType.OBD_DEVICE_PLUGGED_IN,
        observedAt: new Date('2026-06-28T10:05:26.000Z'),
      },
    ]);
    expect(canonical.map((e) => e.id)).toEqual(['e1', 'e2']);
  });
});
