import {
  DeviceConnectionWebhookProcessingStatus,
  DeviceConnectionWebhookVehicleMappingStatus,
  DimoDeviceConnectionEventType,
} from '@prisma/client';
import { DeviceConnectionWebhookInboxService } from './device-connection-webhook-inbox.service';
import { DeviceConnectionWebhookService } from './device-connection-webhook.service';
import { computeProviderEventId } from './device-connection-webhook-inbox.types';

const ORG_A = 'org-a';
const ORG_B = 'org-b';
const VEH_A = 'veh-a';
const VEH_B = 'veh-b';
const TOKEN_A = 1001;
const TOKEN_B = 2002;
const OBSERVED_AT = new Date('2026-06-28T12:00:00.000Z');

function mockInboxStore() {
  const rows = new Map<string, Record<string, unknown>>();
  let idCounter = 0;

  const findUnique = jest.fn(async ({ where }: { where: { provider_providerEventId?: { provider: string; providerEventId: string }; id?: string } }) => {
    if (where.id) {
      for (const row of rows.values()) {
        if (row.id === where.id) return row;
      }
      return null;
    }
    const key = `${where.provider_providerEventId!.provider}:${where.provider_providerEventId!.providerEventId}`;
    for (const row of rows.values()) {
      if (`${row.provider}:${row.providerEventId}` === key) return row;
    }
    return null;
  });

  const findUniqueOrThrow = jest.fn(async (args: { where: { id: string } }) => {
    const row = await findUnique(args);
    if (!row) throw new Error('not found');
    return row;
  });

  const create = jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
    const id = `inbox-${++idCounter}`;
    const row = {
      id,
      processingAttempts: 0,
      domainEventId: null,
      policyIgnoreReason: null,
      lastErrorCode: null,
      ...data,
    };
    rows.set(id, row);
    return row;
  });

  const update = jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
    const row = rows.get(where.id);
    if (!row) throw new Error('not found');
    Object.assign(row, data);
    return row;
  });

  return { rows, findUnique, findUniqueOrThrow, create, update };
}

function mockPrismaForInbox(
  inbox: ReturnType<typeof mockInboxStore>,
  vehicleFindFirst = jest.fn(),
) {
  return {
    deviceConnectionWebhookInbox: {
      findUnique: inbox.findUnique,
      findUniqueOrThrow: inbox.findUniqueOrThrow,
      create: inbox.create,
      update: inbox.update,
    },
    vehicle: { findFirst: vehicleFindFirst },
  };
}

function mockDeviceConnection(
  impl: Partial<DeviceConnectionWebhookService> = {},
) {
  return {
    processValidatedWebhookEvent: jest.fn().mockResolvedValue({
      outcome: 'created',
      eventId: 'evt-1',
      eventType: DimoDeviceConnectionEventType.OBD_DEVICE_UNPLUGGED,
    }),
    ...impl,
  };
}

describe('DeviceConnectionWebhookInboxService', () => {
  it('persists a valid unplug event as PROCESSED', async () => {
    const inbox = mockInboxStore();
    const deviceConnection = mockDeviceConnection();
    const service = new DeviceConnectionWebhookInboxService(
      mockPrismaForInbox(
        inbox,
        jest.fn().mockResolvedValue({ id: VEH_A, organizationId: ORG_A }),
      ) as never,
      deviceConnection as never,
    );

    const result = await service.intakeDeviceConnectionWebhook({
      tokenId: TOKEN_A,
      pluggedIn: false,
      observedAt: OBSERVED_AT,
      rawPayload: { signal: 'obdIsPluggedIn', value: false },
    });

    expect(result.outcome).toBe('created');
    expect(result.processingStatus).toBe(DeviceConnectionWebhookProcessingStatus.PROCESSED);
    expect(result.eventId).toBe('evt-1');
    expect(inbox.create).toHaveBeenCalledTimes(1);
    expect(deviceConnection.processValidatedWebhookEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        vehicle: { id: VEH_A, organizationId: ORG_A },
        tokenId: TOKEN_A,
        pluggedIn: false,
      }),
    );
  });

  it('returns duplicate for terminal PROCESSED inbox row without reprocessing', async () => {
    const inbox = mockInboxStore();
    const providerEventId = computeProviderEventId({
      provider: 'DIMO',
      tokenId: TOKEN_A,
      eventType: DimoDeviceConnectionEventType.OBD_DEVICE_UNPLUGGED,
      observedAt: OBSERVED_AT,
    });
    await inbox.create({
      data: {
        providerEventId,
        provider: 'DIMO',
        eventType: DimoDeviceConnectionEventType.OBD_DEVICE_UNPLUGGED,
        observedAt: OBSERVED_AT,
        processingStatus: DeviceConnectionWebhookProcessingStatus.PROCESSED,
        domainEventId: 'evt-existing',
        tokenId: TOKEN_A,
        payloadHash: 'hash',
        rawPayloadJson: {},
      },
    });

    const deviceConnection = mockDeviceConnection();
    const service = new DeviceConnectionWebhookInboxService(
      mockPrismaForInbox(inbox) as never,
      deviceConnection as never,
    );

    const result = await service.intakeDeviceConnectionWebhook({
      tokenId: TOKEN_A,
      pluggedIn: false,
      observedAt: OBSERVED_AT,
      rawPayload: { signal: 'obdIsPluggedIn', value: false },
    });

    expect(result.outcome).toBe('already_processed');
    expect(result.eventId).toBe('evt-existing');
    expect(deviceConnection.processValidatedWebhookEvent).not.toHaveBeenCalled();
  });

  it('marks unknown vehicle mapping as PERMANENTLY_FAILED (not ignored)', async () => {
    const inbox = mockInboxStore();
    const deviceConnection = mockDeviceConnection();
    const service = new DeviceConnectionWebhookInboxService(
      mockPrismaForInbox(inbox, jest.fn().mockResolvedValue(null)) as never,
      deviceConnection as never,
    );

    const result = await service.intakeDeviceConnectionWebhook({
      tokenId: 9999,
      pluggedIn: false,
      observedAt: OBSERVED_AT,
      rawPayload: { signal: 'obdIsPluggedIn', value: false },
    });

    expect(result.outcome).toBe('permanently_failed');
    expect(result.processingStatus).toBe(DeviceConnectionWebhookProcessingStatus.PERMANENTLY_FAILED);
    expect(result.errorCode).toBe('unknown_vehicle');
    expect(deviceConnection.processValidatedWebhookEvent).not.toHaveBeenCalled();
    const stored = [...inbox.rows.values()][0];
    expect(stored.vehicleMappingStatus).toBe(
      DeviceConnectionWebhookVehicleMappingStatus.UNKNOWN_VEHICLE,
    );
  });

  it('marks processing errors as RETRYABLE_FAILED (never ignored)', async () => {
    const inbox = mockInboxStore();
    const deviceConnection = mockDeviceConnection({
      processValidatedWebhookEvent: jest
        .fn()
        .mockRejectedValue(new Error('episode sync failed')),
    });
    const service = new DeviceConnectionWebhookInboxService(
      mockPrismaForInbox(
        inbox,
        jest.fn().mockResolvedValue({ id: VEH_A, organizationId: ORG_A }),
      ) as never,
      deviceConnection as never,
    );

    const result = await service.intakeDeviceConnectionWebhook({
      tokenId: TOKEN_A,
      pluggedIn: false,
      observedAt: OBSERVED_AT,
      rawPayload: { signal: 'obdIsPluggedIn', value: false },
    });

    expect(result.outcome).toBe('retryable_failed');
    expect(result.processingStatus).toBe(DeviceConnectionWebhookProcessingStatus.RETRYABLE_FAILED);
    expect(result.errorCode).toBe('Error');
    const stored = [...inbox.rows.values()][0];
    expect(stored.processingStatus).toBe(DeviceConnectionWebhookProcessingStatus.RETRYABLE_FAILED);
    expect(stored.nextRetryAt).toBeTruthy();
  });

  it('retries RETRYABLE_FAILED inbox rows on duplicate delivery', async () => {
    const inbox = mockInboxStore();
    const providerEventId = computeProviderEventId({
      provider: 'DIMO',
      tokenId: TOKEN_A,
      eventType: DimoDeviceConnectionEventType.OBD_DEVICE_UNPLUGGED,
      observedAt: OBSERVED_AT,
    });
    const row = await inbox.create({
      data: {
        providerEventId,
        provider: 'DIMO',
        eventType: DimoDeviceConnectionEventType.OBD_DEVICE_UNPLUGGED,
        observedAt: OBSERVED_AT,
        processingStatus: DeviceConnectionWebhookProcessingStatus.RETRYABLE_FAILED,
        tokenId: TOKEN_A,
        payloadHash: 'hash',
        rawPayloadJson: {},
        organizationId: ORG_A,
        vehicleId: VEH_A,
        vehicleMappingStatus: DeviceConnectionWebhookVehicleMappingStatus.RESOLVED,
      },
    });
    inbox.create.mockClear();

    const deviceConnection = mockDeviceConnection();
    const service = new DeviceConnectionWebhookInboxService(
      mockPrismaForInbox(
        inbox,
        jest.fn().mockResolvedValue({ id: VEH_A, organizationId: ORG_A }),
      ) as never,
      deviceConnection as never,
    );

    const result = await service.intakeDeviceConnectionWebhook({
      tokenId: TOKEN_A,
      pluggedIn: false,
      observedAt: OBSERVED_AT,
      rawPayload: { signal: 'obdIsPluggedIn', value: false },
    });

    expect(result.outcome).toBe('created');
    expect(inbox.create).not.toHaveBeenCalled();
    expect(deviceConnection.processValidatedWebhookEvent).toHaveBeenCalled();
    const stored = [...inbox.rows.values()].find((r) => r.id === row.id) as Record<string, unknown>;
    expect(stored.processingStatus).toBe(DeviceConnectionWebhookProcessingStatus.PROCESSED);
  });

  it('stores policy-ignored events as IGNORED_BY_POLICY', async () => {
    const inbox = mockInboxStore();
    const deviceConnection = mockDeviceConnection({
      processValidatedWebhookEvent: jest.fn().mockResolvedValue({
        outcome: 'ignored_by_policy',
        eventType: DimoDeviceConnectionEventType.OBD_DEVICE_PLUGGED_IN,
        policyReason: 'no_state_change',
      }),
    });
    const service = new DeviceConnectionWebhookInboxService(
      mockPrismaForInbox(
        inbox,
        jest.fn().mockResolvedValue({ id: VEH_A, organizationId: ORG_A }),
      ) as never,
      deviceConnection as never,
    );

    const result = await service.intakeDeviceConnectionWebhook({
      tokenId: TOKEN_A,
      pluggedIn: true,
      observedAt: OBSERVED_AT,
      rawPayload: { signal: 'obdIsPluggedIn', value: true },
    });

    expect(result.outcome).toBe('ignored_by_policy');
    expect(result.processingStatus).toBe(DeviceConnectionWebhookProcessingStatus.IGNORED_BY_POLICY);
    expect(result.policyIgnoreReason).toBe('no_state_change');
    const stored = [...inbox.rows.values()][0];
    expect(stored.policyIgnoreReason).toBe('no_state_change');
  });

  it('records domain duplicate as PROCESSED without second episode call on redelivery', async () => {
    const inbox = mockInboxStore();
    const deviceConnection = mockDeviceConnection({
      processValidatedWebhookEvent: jest.fn().mockResolvedValue({
        outcome: 'duplicate',
        eventId: 'evt-dup',
        eventType: DimoDeviceConnectionEventType.OBD_DEVICE_UNPLUGGED,
      }),
    });
    const service = new DeviceConnectionWebhookInboxService(
      mockPrismaForInbox(
        inbox,
        jest.fn().mockResolvedValue({ id: VEH_A, organizationId: ORG_A }),
      ) as never,
      deviceConnection as never,
    );

    const result = await service.intakeDeviceConnectionWebhook({
      tokenId: TOKEN_A,
      pluggedIn: false,
      observedAt: OBSERVED_AT,
      rawPayload: { signal: 'obdIsPluggedIn', value: false },
    });

    expect(result.outcome).toBe('duplicate');
    expect(result.processingStatus).toBe(DeviceConnectionWebhookProcessingStatus.PROCESSED);
    expect(result.eventId).toBe('evt-dup');
  });

  it('isolates multi-tenant vehicle mapping by tokenId', async () => {
    const inbox = mockInboxStore();
    const deviceConnection = mockDeviceConnection();
    const vehicleFindFirst = jest
      .fn()
      .mockResolvedValueOnce({ id: VEH_A, organizationId: ORG_A })
      .mockResolvedValueOnce({ id: VEH_B, organizationId: ORG_B });

    const service = new DeviceConnectionWebhookInboxService(
      mockPrismaForInbox(inbox, vehicleFindFirst) as never,
      deviceConnection as never,
    );

    await service.intakeDeviceConnectionWebhook({
      tokenId: TOKEN_A,
      pluggedIn: false,
      observedAt: OBSERVED_AT,
      rawPayload: { a: 1 },
    });
    await service.intakeDeviceConnectionWebhook({
      tokenId: TOKEN_B,
      pluggedIn: false,
      observedAt: new Date('2026-06-28T12:01:00.000Z'),
      rawPayload: { b: 2 },
    });

    expect(vehicleFindFirst).toHaveBeenNthCalledWith(1, {
      where: { dimoVehicle: { tokenId: TOKEN_A } },
      select: { id: true, organizationId: true },
    });
    expect(vehicleFindFirst).toHaveBeenNthCalledWith(2, {
      where: { dimoVehicle: { tokenId: TOKEN_B } },
      select: { id: true, organizationId: true },
    });
    expect(deviceConnection.processValidatedWebhookEvent).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ vehicle: { id: VEH_A, organizationId: ORG_A } }),
    );
    expect(deviceConnection.processValidatedWebhookEvent).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ vehicle: { id: VEH_B, organizationId: ORG_B } }),
    );
  });

  it('propagates DB persistence errors from inbox create', async () => {
    const inbox = mockInboxStore();
    inbox.create.mockRejectedValueOnce(new Error('db write failed'));
    const service = new DeviceConnectionWebhookInboxService(
      mockPrismaForInbox(inbox) as never,
      mockDeviceConnection() as never,
    );

    await expect(
      service.intakeDeviceConnectionWebhook({
        tokenId: TOKEN_A,
        pluggedIn: false,
        observedAt: OBSERVED_AT,
        rawPayload: {},
      }),
    ).rejects.toThrow('db write failed');
  });
});

describe('DeviceConnectionWebhookInboxService — status transitions', () => {
  it('transitions RECEIVED → VALIDATED → PROCESSED on success', async () => {
    const inbox = mockInboxStore();
    const statuses: DeviceConnectionWebhookProcessingStatus[] = [];
    inbox.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
      if (data.processingStatus) {
        statuses.push(data.processingStatus as DeviceConnectionWebhookProcessingStatus);
      }
      return {};
    });

    const service = new DeviceConnectionWebhookInboxService(
      mockPrismaForInbox(
        inbox,
        jest.fn().mockResolvedValue({ id: VEH_A, organizationId: ORG_A }),
      ) as never,
      mockDeviceConnection() as never,
    );

    await service.intakeDeviceConnectionWebhook({
      tokenId: TOKEN_A,
      pluggedIn: false,
      observedAt: OBSERVED_AT,
      rawPayload: {},
    });

    expect(statuses).toEqual([
      DeviceConnectionWebhookProcessingStatus.VALIDATED,
      DeviceConnectionWebhookProcessingStatus.PROCESSED,
    ]);
  });
});
