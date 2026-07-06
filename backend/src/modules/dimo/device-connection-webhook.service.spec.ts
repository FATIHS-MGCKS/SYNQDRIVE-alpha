import {
  DeviceConnectionWebhookService,
  DEVICE_CONNECTION_DEDUP_WINDOW_MS,
  inferObdPlugStateFromLastEvent,
  shouldPersistObdPlugStateChange,
} from './device-connection-webhook.service';
import { DimoDeviceConnectionEventType } from '@prisma/client';

function mockPrisma(
  findFirst = jest.fn().mockResolvedValue(null),
  vehicleFindUnique = jest.fn().mockResolvedValue({
    dimoVehicle: { connectionStatus: 'DISCONNECTED' },
    latestState: { rawPayloadJson: null },
  }),
) {
  const upsert = jest.fn();
  return { upsert, findFirst, vehicle: { findUnique: vehicleFindUnique } };
}

describe('DeviceConnectionWebhookService — static helpers', () => {
  it('detects obdIsPluggedIn signal name case-insensitively', () => {
    expect(DeviceConnectionWebhookService.isObdPluggedSignal('obdIsPluggedIn')).toBe(true);
    expect(DeviceConnectionWebhookService.isObdPluggedSignal('OBDISPLUGGEDIN')).toBe(true);
    expect(DeviceConnectionWebhookService.isObdPluggedSignal('speed')).toBe(false);
    expect(DeviceConnectionWebhookService.isObdPluggedSignal(undefined)).toBe(false);
  });

  it('parses boolean plug values', () => {
    expect(DeviceConnectionWebhookService.parsePluggedValue(true)).toBe(true);
    expect(DeviceConnectionWebhookService.parsePluggedValue(false)).toBe(false);
    expect(DeviceConnectionWebhookService.parsePluggedValue('true')).toBe(true);
    expect(DeviceConnectionWebhookService.parsePluggedValue('0')).toBe(false);
    expect(DeviceConnectionWebhookService.parsePluggedValue('abc')).toBeNull();
  });

  it('maps plug state to event type', () => {
    expect(DeviceConnectionWebhookService.eventTypeForPlugState(false)).toBe(
      DimoDeviceConnectionEventType.OBD_DEVICE_UNPLUGGED,
    );
    expect(DeviceConnectionWebhookService.eventTypeForPlugState(true)).toBe(
      DimoDeviceConnectionEventType.OBD_DEVICE_PLUGGED_IN,
    );
  });

  it('dedup buckets collapse nearby timestamps', () => {
    const a = DeviceConnectionWebhookService.dedupBucket(new Date(0));
    const b = DeviceConnectionWebhookService.dedupBucket(
      new Date(DEVICE_CONNECTION_DEDUP_WINDOW_MS - 1),
    );
    const c = DeviceConnectionWebhookService.dedupBucket(
      new Date(DEVICE_CONNECTION_DEDUP_WINDOW_MS),
    );
    expect(a).toBe(b);
    expect(c).not.toBe(a);
  });
});

describe('shouldPersistObdPlugStateChange', () => {
  it('ignores first plugged=true as baseline', () => {
    expect(shouldPersistObdPlugStateChange(true, null)).toEqual({
      persist: false,
      reason: 'baseline_already_plugged',
    });
  });

  it('persists first unplug as real event', () => {
    expect(shouldPersistObdPlugStateChange(false, null)).toEqual({ persist: true });
  });

  it('ignores repeated plugged while already plugged', () => {
    expect(
      shouldPersistObdPlugStateChange(
        true,
        DimoDeviceConnectionEventType.OBD_DEVICE_PLUGGED_IN,
      ),
    ).toEqual({ persist: false, reason: 'no_state_change' });
  });

  it('ignores repeated unplug while already unplugged', () => {
    expect(
      shouldPersistObdPlugStateChange(
        false,
        DimoDeviceConnectionEventType.OBD_DEVICE_UNPLUGGED,
      ),
    ).toEqual({ persist: false, reason: 'no_state_change' });
  });

  it('persists plug after unplug', () => {
    expect(
      shouldPersistObdPlugStateChange(
        true,
        DimoDeviceConnectionEventType.OBD_DEVICE_UNPLUGGED,
      ),
    ).toEqual({ persist: true });
  });

  it('persists unplug after plug', () => {
    expect(
      shouldPersistObdPlugStateChange(
        false,
        DimoDeviceConnectionEventType.OBD_DEVICE_PLUGGED_IN,
      ),
    ).toEqual({ persist: true });
  });
});

describe('inferObdPlugStateFromLastEvent', () => {
  it('returns unknown without history', () => {
    expect(inferObdPlugStateFromLastEvent(null)).toBe('unknown');
  });
});

describe('DeviceConnectionWebhookService.ingestObdPlugStateChange', () => {
  it('creates a new unplug event when no prior state', async () => {
    const { upsert, findFirst } = mockPrisma();
    const observedAt = new Date('2026-06-28T12:00:00Z');
    upsert.mockResolvedValue({
      id: 'evt-1',
      createdAt: observedAt,
      updatedAt: observedAt,
    });

    const service = new DeviceConnectionWebhookService({
      dimoDeviceConnectionEvent: { upsert, findFirst },
      vehicle: { findUnique: jest.fn().mockResolvedValue(null) },
    } as never);
    const result = await service.ingestObdPlugStateChange({
      vehicle: { id: 'v1', organizationId: 'o1' },
      tokenId: 42,
      pluggedIn: false,
      observedAt,
      rawPayload: { signal: 'obdIsPluggedIn', value: false },
    });

    expect(result.outcome).toBe('created');
    expect(result.eventType).toBe(DimoDeviceConnectionEventType.OBD_DEVICE_UNPLUGGED);
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it('ignores repeated plugged=true when already plugged', async () => {
    const { upsert, findFirst } = mockPrisma(
      jest.fn().mockResolvedValue({
        eventType: DimoDeviceConnectionEventType.OBD_DEVICE_PLUGGED_IN,
      }),
    );

    const service = new DeviceConnectionWebhookService({
      dimoDeviceConnectionEvent: { upsert, findFirst },
      vehicle: { findUnique: jest.fn().mockResolvedValue(null) },
    } as never);
    const result = await service.ingestObdPlugStateChange({
      vehicle: { id: 'v1', organizationId: 'o1' },
      tokenId: 42,
      pluggedIn: true,
      observedAt: new Date('2026-06-28T12:00:26Z'),
      rawPayload: { signal: 'obdIsPluggedIn', value: true },
    });

    expect(result.outcome).toBe('ignored');
    expect(upsert).not.toHaveBeenCalled();
  });

  it('ignores baseline plugged=true when no prior events', async () => {
    const { upsert, findFirst } = mockPrisma();

    const service = new DeviceConnectionWebhookService({
      dimoDeviceConnectionEvent: { upsert, findFirst },
      vehicle: { findUnique: jest.fn().mockResolvedValue(null) },
    } as never);
    const result = await service.ingestObdPlugStateChange({
      vehicle: { id: 'v1', organizationId: 'o1' },
      tokenId: 42,
      pluggedIn: true,
      observedAt: new Date('2026-06-28T12:00:00Z'),
      rawPayload: { signal: 'obdIsPluggedIn', value: true },
    });

    expect(result.outcome).toBe('ignored');
    expect(upsert).not.toHaveBeenCalled();
  });

  it('creates plug-in after prior unplug when DIMO confirms connected', async () => {
    const { upsert, findFirst, vehicle } = mockPrisma(
      jest.fn().mockResolvedValue({
        eventType: DimoDeviceConnectionEventType.OBD_DEVICE_UNPLUGGED,
        observedAt: new Date('2026-06-28T12:00:00Z'),
      }),
      jest.fn().mockResolvedValue({
        dimoVehicle: { connectionStatus: 'CONNECTED' },
        latestState: { rawPayloadJson: { obdIsPluggedIn: { value: true } } },
      }),
    );
    const observedAt = new Date('2026-06-28T12:05:00Z');
    upsert.mockResolvedValue({
      id: 'evt-plug',
      createdAt: observedAt,
      updatedAt: observedAt,
    });

    const service = new DeviceConnectionWebhookService({
      dimoDeviceConnectionEvent: { upsert, findFirst },
      vehicle,
    } as never);
    const result = await service.ingestObdPlugStateChange({
      vehicle: { id: 'v1', organizationId: 'o1' },
      tokenId: 42,
      pluggedIn: true,
      observedAt,
      rawPayload: { signal: 'obdIsPluggedIn', value: true },
    });

    expect(result.outcome).toBe('created');
    expect(result.eventType).toBe(DimoDeviceConnectionEventType.OBD_DEVICE_PLUGGED_IN);
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it('ignores short plug impulse after unplug when DIMO still disconnected', async () => {
    const { upsert, findFirst, vehicle } = mockPrisma(
      jest.fn().mockResolvedValue({
        eventType: DimoDeviceConnectionEventType.OBD_DEVICE_UNPLUGGED,
        observedAt: new Date('2026-07-06T13:13:34.000Z'),
      }),
      jest.fn().mockResolvedValue({
        dimoVehicle: { connectionStatus: 'DISCONNECTED' },
        latestState: { rawPayloadJson: null },
      }),
    );

    const service = new DeviceConnectionWebhookService({
      dimoDeviceConnectionEvent: { upsert, findFirst },
      vehicle,
    } as never);
    const result = await service.ingestObdPlugStateChange({
      vehicle: { id: 'v1', organizationId: 'o1' },
      tokenId: 189118,
      pluggedIn: true,
      observedAt: new Date('2026-07-06T13:13:48.000Z'),
      rawPayload: { signal: 'obdIsPluggedIn', value: 1 },
    });

    expect(result.outcome).toBe('ignored');
    expect(upsert).not.toHaveBeenCalled();
  });

  it('creates plug-in after prior unplug when outside impulse window', async () => {
    const { upsert, findFirst, vehicle } = mockPrisma(
      jest.fn().mockResolvedValue({
        eventType: DimoDeviceConnectionEventType.OBD_DEVICE_UNPLUGGED,
        observedAt: new Date('2026-06-28T11:00:00Z'),
      }),
      jest.fn().mockResolvedValue({
        dimoVehicle: { connectionStatus: 'DISCONNECTED' },
        latestState: { rawPayloadJson: null },
      }),
    );
    const observedAt = new Date('2026-06-28T12:05:00Z');
    upsert.mockResolvedValue({
      id: 'evt-plug',
      createdAt: observedAt,
      updatedAt: observedAt,
    });

    const service = new DeviceConnectionWebhookService({
      dimoDeviceConnectionEvent: { upsert, findFirst },
      vehicle,
    } as never);
    const result = await service.ingestObdPlugStateChange({
      vehicle: { id: 'v1', organizationId: 'o1' },
      tokenId: 42,
      pluggedIn: true,
      observedAt,
      rawPayload: { signal: 'obdIsPluggedIn', value: true },
    });

    expect(result.outcome).toBe('created');
    expect(result.eventType).toBe(DimoDeviceConnectionEventType.OBD_DEVICE_PLUGGED_IN);
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it('returns duplicate when upsert hits existing bucket', async () => {
    const { upsert, findFirst, vehicle } = mockPrisma(
      jest.fn().mockResolvedValue({
        eventType: DimoDeviceConnectionEventType.OBD_DEVICE_UNPLUGGED,
        observedAt: new Date('2026-06-28T11:00:00Z'),
      }),
      jest.fn().mockResolvedValue({
        dimoVehicle: { connectionStatus: 'CONNECTED' },
        latestState: { rawPayloadJson: { obdIsPluggedIn: { value: true } } },
      }),
    );
    const created = new Date('2026-06-28T12:05:00Z');
    const updated = new Date('2026-06-28T12:05:05Z');
    upsert.mockResolvedValue({ id: 'evt-2', createdAt: created, updatedAt: updated });

    const service = new DeviceConnectionWebhookService({
      dimoDeviceConnectionEvent: { upsert, findFirst },
      vehicle,
    } as never);
    const result = await service.ingestObdPlugStateChange({
      vehicle: { id: 'v1', organizationId: 'o1' },
      tokenId: 42,
      pluggedIn: true,
      observedAt: created,
      rawPayload: { signal: 'obdIsPluggedIn', value: true },
    });
    expect(result.outcome).toBe('duplicate');
    expect(result.eventType).toBe(DimoDeviceConnectionEventType.OBD_DEVICE_PLUGGED_IN);
  });
});
