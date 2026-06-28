import { DimoDeviceConnectionEventType } from '@prisma/client';
import {
  buildDeviceConnectionSummary,
  buildFleetDeviceConnectionFields,
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
});
