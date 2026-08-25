import {
  DeviceConnectionWebhookService,
  DEVICE_CONNECTION_DEDUP_WINDOW_MS,
  inferObdPlugStateFromLastEvent,
  shouldPersistObdPlugStateChange,
} from './device-connection-webhook.service';
import { DimoDeviceConnectionEventType } from '@prisma/client';
import { CONNECTIVITY_LIFECYCLE_DEV_RECONCILE_AFTER_ISO } from '@config/device-connection-webhook-inbox.config';
import { evaluateOrphanReconciliationEligibility } from './connectivity/connectivity-lifecycle-runtime.policy';

const DEFAULT_CUTOVER = new Date(CONNECTIVITY_LIFECYCLE_DEV_RECONCILE_AFTER_ISO);

function mockLifecyclePolicy(
  enabled = true,
  cutover: Date | null = DEFAULT_CUTOVER,
) {
  return {
    automaticLifecycleReconciliationEnabled: enabled,
    lifecycleReconcileAfter: enabled ? cutover : null,
    evaluateOrphanReconciliationEligibility: ({
      receivedAt,
      processedAt,
    }: {
      receivedAt: Date;
      processedAt: Date | null;
    }) =>
      evaluateOrphanReconciliationEligibility({
        receivedAt,
        processedAt,
        lifecycleReconcileAfter: enabled ? cutover : null,
        automaticLifecycleReconciliationEnabled: enabled,
      }),
    isInboxEligibleForAutomaticRuntimeReplay: jest.fn(),
  };
}

function buildWebhookService(
  prisma: ReturnType<typeof mockPrisma>,
  episodeService = mockEpisodeService(),
  lifecyclePolicy = mockLifecyclePolicy(),
) {
  return new DeviceConnectionWebhookService(
    {
      dimoDeviceConnectionEvent: {
        upsert: prisma.upsert,
        update: prisma.update,
        findFirst: prisma.findFirst,
        findUnique: prisma.findUnique,
      },
      vehicle: prisma.vehicle,
    } as never,
    episodeService as never,
    lifecyclePolicy as never,
  );
}

function mockPrisma(
  findFirst = jest.fn().mockResolvedValue(null),
  vehicleFindUnique = jest.fn().mockResolvedValue({
    dimoVehicle: { connectionStatus: 'DISCONNECTED' },
    latestState: { rawPayloadJson: null },
  }),
) {
  const upsert = jest.fn();
  const update = jest.fn().mockResolvedValue({});
  const findUnique = jest.fn();
  return { upsert, update, findFirst, findUnique, vehicle: { findUnique: vehicleFindUnique } };
}

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
    const { upsert, update, findFirst } = mockPrisma();
    const observedAt = new Date('2026-06-28T12:00:00Z');
    upsert.mockResolvedValue({
      id: 'evt-1',
      createdAt: observedAt,
      updatedAt: observedAt,
    });

    const service = new DeviceConnectionWebhookService(
      {
        dimoDeviceConnectionEvent: { upsert, update, findFirst },
        vehicle: { findUnique: jest.fn().mockResolvedValue(null) },
      } as never,
      mockEpisodeService() as never,
      mockLifecyclePolicy() as never,
    );
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
    const { upsert, update, findFirst } = mockPrisma(
      jest.fn().mockResolvedValue({
        eventType: DimoDeviceConnectionEventType.OBD_DEVICE_PLUGGED_IN,
      }),
    );

    const service = new DeviceConnectionWebhookService(
      {
        dimoDeviceConnectionEvent: { upsert, update, findFirst },
        vehicle: { findUnique: jest.fn().mockResolvedValue(null) },
      } as never,
      mockEpisodeService() as never,
      mockLifecyclePolicy() as never,
    );
    const result = await service.ingestObdPlugStateChange({
      vehicle: { id: 'v1', organizationId: 'o1' },
      tokenId: 42,
      pluggedIn: true,
      observedAt: new Date('2026-06-28T12:00:26Z'),
      rawPayload: { signal: 'obdIsPluggedIn', value: true },
    });

    expect(result.outcome).toBe('ignored_by_policy');
    expect(upsert).not.toHaveBeenCalled();
  });

  it('ignores baseline plugged=true when no prior events', async () => {
    const { upsert, update, findFirst } = mockPrisma();

    const service = new DeviceConnectionWebhookService(
      {
        dimoDeviceConnectionEvent: { upsert, update, findFirst },
        vehicle: { findUnique: jest.fn().mockResolvedValue(null) },
      } as never,
      mockEpisodeService() as never,
      mockLifecyclePolicy() as never,
    );
    const result = await service.ingestObdPlugStateChange({
      vehicle: { id: 'v1', organizationId: 'o1' },
      tokenId: 42,
      pluggedIn: true,
      observedAt: new Date('2026-06-28T12:00:00Z'),
      rawPayload: { signal: 'obdIsPluggedIn', value: true },
    });

    expect(result.outcome).toBe('ignored_by_policy');
    expect(upsert).not.toHaveBeenCalled();
  });

  it('creates plug-in after prior unplug when DIMO confirms connected', async () => {
    const { upsert, update, findFirst, vehicle } = mockPrisma(
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

    const service = new DeviceConnectionWebhookService(
      {
        dimoDeviceConnectionEvent: { upsert, update, findFirst },
        vehicle,
      } as never,
      mockEpisodeService() as never,
      mockLifecyclePolicy() as never,
    );
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
    const { upsert, update, findFirst, vehicle } = mockPrisma(
      jest.fn().mockResolvedValue({
        eventType: DimoDeviceConnectionEventType.OBD_DEVICE_UNPLUGGED,
        observedAt: new Date('2026-07-06T13:13:34.000Z'),
      }),
      jest.fn().mockResolvedValue({
        dimoVehicle: { connectionStatus: 'DISCONNECTED' },
        latestState: { rawPayloadJson: null },
      }),
    );

    const service = new DeviceConnectionWebhookService(
      {
        dimoDeviceConnectionEvent: { upsert, update, findFirst },
        vehicle,
      } as never,
      mockEpisodeService() as never,
      mockLifecyclePolicy() as never,
    );
    const result = await service.ingestObdPlugStateChange({
      vehicle: { id: 'v1', organizationId: 'o1' },
      tokenId: 189118,
      pluggedIn: true,
      observedAt: new Date('2026-07-06T13:13:48.000Z'),
      rawPayload: { signal: 'obdIsPluggedIn', value: 1 },
    });

    expect(result.outcome).toBe('ignored_by_policy');
    expect(upsert).not.toHaveBeenCalled();
  });

  it('creates plug-in after prior unplug when outside impulse window', async () => {
    const { upsert, update, findFirst, vehicle } = mockPrisma(
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

    const service = new DeviceConnectionWebhookService(
      {
        dimoDeviceConnectionEvent: { upsert, update, findFirst },
        vehicle,
      } as never,
      mockEpisodeService() as never,
      mockLifecyclePolicy() as never,
    );
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
    const { upsert, update, findFirst, vehicle } = mockPrisma(
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
    upsert.mockResolvedValue({
      id: 'evt-2',
      createdAt: created,
      updatedAt: updated,
      processedAt: new Date('2026-06-28T12:05:06Z'),
      receivedAt: created,
    });

    const service = new DeviceConnectionWebhookService(
      {
        dimoDeviceConnectionEvent: { upsert, update, findFirst },
        vehicle,
      } as never,
      mockEpisodeService() as never,
      mockLifecyclePolicy() as never,
    );
    const result = await service.ingestObdPlugStateChange({
      vehicle: { id: 'v1', organizationId: 'o1' },
      tokenId: 42,
      pluggedIn: true,
      observedAt: created,
      rawPayload: { signal: 'obdIsPluggedIn', value: true },
    });
    expect(result.outcome).toBe('duplicate');
    expect(result.eventType).toBe(DimoDeviceConnectionEventType.OBD_DEVICE_PLUGGED_IN);
    expect(update).not.toHaveBeenCalled();
  });

  it('reconciles lifecycle when upsert hits existing unprocessed event', async () => {
    const { upsert, update, findFirst } = mockPrisma();
    const observedAt = new Date('2026-06-28T12:00:00Z');
    const created = observedAt;
    const updated = new Date('2026-06-28T12:00:05Z');
    upsert.mockResolvedValue({
      id: 'evt-partial',
      createdAt: created,
      updatedAt: updated,
      processedAt: null,
      receivedAt: new Date('2026-08-26T10:00:00.000Z'),
    });
    const episodeService = mockEpisodeService();

    const service = new DeviceConnectionWebhookService(
      {
        dimoDeviceConnectionEvent: { upsert, update, findFirst },
        vehicle: { findUnique: jest.fn().mockResolvedValue(null) },
      } as never,
      episodeService as never,
      mockLifecyclePolicy() as never,
    );

    const result = await service.processValidatedWebhookEvent({
      vehicle: { id: 'v1', organizationId: 'o1' },
      tokenId: 42,
      pluggedIn: false,
      observedAt,
      rawPayload: { signal: 'obdIsPluggedIn', value: false },
      inboxId: 'inbox-1',
    });

    expect(result.outcome).toBe('reconciled');
    expect(episodeService.openFromUnplugEvent).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({
      where: { id: 'evt-partial' },
      data: { processedAt: expect.any(Date) },
    });
  });

  it('N8: reconcilePersistedEventLifecycle blocks pre-cutover historical events', async () => {
    const findUnique = jest.fn().mockResolvedValue({
      id: 'evt-july20',
      organizationId: 'o1',
      vehicleId: 'v1',
      tokenId: 42,
      eventType: DimoDeviceConnectionEventType.OBD_DEVICE_UNPLUGGED,
      observedAt: new Date('2026-07-20T11:05:00Z'),
      receivedAt: new Date('2026-07-20T11:05:03.768Z'),
      processedAt: null,
    });
    const update = jest.fn();
    const episodeService = mockEpisodeService();
    const prisma = { upsert: jest.fn(), update, findFirst: jest.fn(), findUnique, vehicle: { findUnique: jest.fn() } };

    const service = buildWebhookService(prisma as never, episodeService);

    const result = await service.reconcilePersistedEventLifecycle('evt-july20');
    expect(result.outcome).toBe('historical_orphan');
    expect(episodeService.openFromUnplugEvent).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('N9: duplicate delivery after cutover hitting historical event stays orphan', async () => {
    const { upsert, update, findFirst } = mockPrisma();
    const observedAt = new Date('2026-07-20T11:05:00.000Z');
    const created = observedAt;
    const updated = new Date('2026-07-20T11:05:05.000Z');
    upsert.mockResolvedValue({
      id: 'evt-hist',
      createdAt: created,
      updatedAt: updated,
      processedAt: null,
      receivedAt: new Date('2026-07-20T11:05:03.768Z'),
    });
    const episodeService = mockEpisodeService();
    const service = buildWebhookService(
      { upsert, update, findFirst, findUnique: jest.fn(), vehicle: { findUnique: jest.fn().mockResolvedValue(null) } } as never,
      episodeService,
    );

    const result = await service.processValidatedWebhookEvent({
      vehicle: { id: 'v1', organizationId: 'o1' },
      tokenId: 42,
      pluggedIn: false,
      observedAt,
      rawPayload: { signal: 'obdIsPluggedIn', value: false },
      inboxId: 'inbox-new',
    });

    expect(result.outcome).toBe('historical_orphan');
    expect(episodeService.openFromUnplugEvent).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('N11: production fail-closed reconciliation does not block brand-new OBD_DEVICE_UNPLUGGED webhook', async () => {
    const { upsert, update, findFirst } = mockPrisma();
    const observedAt = new Date('2026-08-26T12:00:00.000Z');
    upsert.mockResolvedValue({
      id: 'evt-brand-new',
      createdAt: observedAt,
      updatedAt: observedAt,
      processedAt: null,
      receivedAt: new Date('2026-08-26T12:00:01.000Z'),
    });
    const episodeService = mockEpisodeService();
    const productionFailClosedPolicy = mockLifecyclePolicy(false, null);
    const service = buildWebhookService(
      { upsert, update, findFirst, findUnique: jest.fn(), vehicle: { findUnique: jest.fn().mockResolvedValue(null) } } as never,
      episodeService,
      productionFailClosedPolicy,
    );

    const result = await service.processValidatedWebhookEvent({
      vehicle: { id: 'v1', organizationId: 'o1' },
      tokenId: 42,
      pluggedIn: false,
      observedAt,
      rawPayload: { signal: 'obdIsPluggedIn', value: false },
      inboxId: 'inbox-brand-new',
    });

    expect(result.outcome).toBe('created');
    expect(result.eventType).toBe(DimoDeviceConnectionEventType.OBD_DEVICE_UNPLUGGED);
    expect(episodeService.openFromUnplugEvent).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({
      where: { id: 'evt-brand-new' },
      data: { processedAt: expect.any(Date) },
    });
    expect(result.outcome).not.toBe('historical_orphan');
    expect(result.outcome).not.toBe('reconciliation_disabled');
  });

  it('N10: reconcilePersistedEventLifecycle completes post-cutover orphan events', async () => {
    const findUnique = jest.fn().mockResolvedValue({
      id: 'evt-new-era',
      organizationId: 'o1',
      vehicleId: 'v1',
      tokenId: 42,
      eventType: DimoDeviceConnectionEventType.OBD_DEVICE_UNPLUGGED,
      observedAt: new Date('2026-08-26T09:00:00Z'),
      receivedAt: new Date('2026-08-26T09:00:05Z'),
      processedAt: null,
    });
    const update = jest.fn().mockResolvedValue({});
    const episodeService = mockEpisodeService();
    const prisma = { upsert: jest.fn(), update, findFirst: jest.fn(), findUnique, vehicle: { findUnique: jest.fn() } };

    const service = buildWebhookService(prisma as never, episodeService);

    const result = await service.reconcilePersistedEventLifecycle('evt-new-era');
    expect(result.outcome).toBe('reconciled');
    expect(episodeService.openFromUnplugEvent).toHaveBeenCalled();
    expect(update).toHaveBeenCalled();
  });

  it('reconcilePersistedEventLifecycle completes eligible orphan events', async () => {
    const findUnique = jest.fn().mockResolvedValue({
      id: 'evt-orphan',
      organizationId: 'o1',
      vehicleId: 'v1',
      tokenId: 42,
      eventType: DimoDeviceConnectionEventType.OBD_DEVICE_UNPLUGGED,
      observedAt: new Date('2026-08-26T10:00:00Z'),
      receivedAt: new Date('2026-08-26T10:00:05Z'),
      processedAt: null,
    });
    const update = jest.fn().mockResolvedValue({});
    const episodeService = mockEpisodeService();

    const service = new DeviceConnectionWebhookService(
      {
        dimoDeviceConnectionEvent: { findUnique, update },
        vehicle: { findUnique: jest.fn() },
      } as never,
      episodeService as never,
      mockLifecyclePolicy() as never,
    );

    const result = await service.reconcilePersistedEventLifecycle('evt-orphan');
    expect(result.outcome).toBe('reconciled');
    expect(episodeService.openFromUnplugEvent).toHaveBeenCalled();
    expect(update).toHaveBeenCalled();
  });

  it('propagates episode sync failures instead of swallowing as ignored', async () => {
    const { upsert, update, findFirst } = mockPrisma();
    const observedAt = new Date('2026-06-28T12:00:00Z');
    upsert.mockResolvedValue({
      id: 'evt-1',
      createdAt: observedAt,
      updatedAt: observedAt,
    });
    const episodeService = mockEpisodeService();
    episodeService.openFromUnplugEvent.mockRejectedValue(new Error('episode db error'));

    const service = new DeviceConnectionWebhookService(
      {
        dimoDeviceConnectionEvent: { upsert, update, findFirst },
        vehicle: { findUnique: jest.fn().mockResolvedValue(null) },
      } as never,
      episodeService as never,
      mockLifecyclePolicy() as never,
    );

    await expect(
      service.processValidatedWebhookEvent({
        vehicle: { id: 'v1', organizationId: 'o1' },
        tokenId: 42,
        pluggedIn: false,
        observedAt,
        rawPayload: { signal: 'obdIsPluggedIn', value: false },
      }),
    ).rejects.toThrow('episode db error');
  });
});
