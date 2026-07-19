import { UnauthorizedException } from '@nestjs/common';
import {
  DeviceConnectionWebhookInboxStatus,
  DeviceConnectionWebhookMappingStatus,
  DimoDeviceConnectionEventType,
} from '@prisma/client';
import { DeviceConnectionWebhookService } from '../device-connection-webhook.service';
import { DeviceConnectionWebhookIngestService } from './device-connection-webhook-ingest.service';
import { DeviceConnectionWebhookProcessingService } from './device-connection-webhook-processing.service';
import { DeviceConnectionWebhookInboxRepository } from './device-connection-webhook-inbox.repository';
import { DEVICE_CONNECTION_WEBHOOK_ERROR_CODES } from './device-connection-webhook-ingestion.constants';

function baseInbox(overrides: Record<string, unknown> = {}) {
  return {
    id: 'inbox-1',
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    tokenId: 42,
    provider: 'DIMO',
    providerEventId: 'evt-provider-1',
    eventType: DimoDeviceConnectionEventType.OBD_DEVICE_UNPLUGGED,
    rawPayloadHash: 'hash-abc',
    redactedPayloadJson: { type: 'dimo.trigger' },
    observedAt: new Date('2026-06-28T12:00:00Z'),
    receivedAt: new Date('2026-06-28T12:00:01Z'),
    processedAt: null,
    processingStatus: DeviceConnectionWebhookInboxStatus.VALIDATED,
    processingAttempts: 0,
    lastErrorCode: null,
    lastErrorMessage: null,
    nextRetryAt: null,
    vehicleMappingStatus: DeviceConnectionWebhookMappingStatus.MAPPED,
    bindingMappingStatus: DeviceConnectionWebhookMappingStatus.MAPPED,
    policyIgnoreReason: null,
    connectionEventId: null,
    dedupBucket: 0n,
    deviceBindingId: 'bind-1',
    providerDeviceIdHash: 'hash-dev',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('DeviceConnectionWebhookIngestService', () => {
  const queue = { enqueue: jest.fn().mockResolvedValue(undefined) };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function makeIngest(prismaOverrides: Record<string, unknown> = {}) {
    const inboxRepo = new DeviceConnectionWebhookInboxRepository({
      deviceConnectionWebhookInbox: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      vehicle: {
        findUnique: jest.fn().mockResolvedValue({
          hardwareType: 'LTE_R1',
          dataSourceLinks: [
            {
              id: 'link-1',
              sourceType: 'DIMO',
              sourceSubtype: 'OBD',
              sourceReferenceId: 'ref-1',
              activatedAt: new Date(),
              deactivatedAt: null,
            },
          ],
        }),
        ...((prismaOverrides.vehicle as object) ?? {}),
      },
      ...prismaOverrides,
    } as never);

    jest.spyOn(inboxRepo, 'persistOrGet').mockImplementation(async (input) => ({
      inbox: baseInbox({
        providerEventId: input.providerEventId,
        eventType: input.eventType,
      }),
      created: true,
    }));
    jest.spyOn(inboxRepo, 'markValidated').mockResolvedValue(baseInbox());
    jest.spyOn(inboxRepo, 'markPermanentlyFailed').mockResolvedValue(baseInbox());

    const service = new DeviceConnectionWebhookIngestService(
      inboxRepo,
      inboxRepo['prisma'] as never,
      queue as never,
    );
    return { service, inboxRepo, queue };
  }

  it('accepts valid webhook, validates mapping, and queues processing', async () => {
    const { service, queue } = makeIngest();
    const body = {
      id: 'cloud-evt-1',
      type: 'dimo.trigger',
      data: { signal: { name: 'obdIsPluggedIn', value: false } },
    };

    const result = await service.receiveObdPlugWebhook({
      rawBody: Buffer.from(JSON.stringify(body)),
      body,
      tokenId: 42,
      vehicle: { id: 'veh-1', organizationId: 'org-1' },
      pluggedIn: false,
      observedAt: new Date('2026-06-28T12:00:00Z'),
    });

    expect(result.accepted).toBe(true);
    expect(result.duplicate).toBe(false);
    expect(result.queued).toBe(true);
    expect(queue.enqueue).toHaveBeenCalledWith('inbox-1');
  });

  it('returns duplicate without re-queue when provider event id already exists', async () => {
    const inboxRepo = new DeviceConnectionWebhookInboxRepository({} as never);
    jest.spyOn(inboxRepo, 'persistOrGet').mockResolvedValue({
      inbox: baseInbox({ processingStatus: DeviceConnectionWebhookInboxStatus.PROCESSED }),
      created: false,
    });
    const service = new DeviceConnectionWebhookIngestService(
      inboxRepo,
      { vehicle: { findUnique: jest.fn() } } as never,
      queue as never,
    );

    const result = await service.receiveObdPlugWebhook({
      rawBody: Buffer.from('{}'),
      body: {},
      tokenId: 42,
      vehicle: { id: 'veh-1', organizationId: 'org-1' },
      pluggedIn: false,
      observedAt: new Date(),
    });

    expect(result.duplicate).toBe(true);
    expect(result.queued).toBe(false);
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it('marks PERMANENTLY_FAILED for unmapped vehicle — not policy ignored', async () => {
    const inboxRepo = new DeviceConnectionWebhookInboxRepository({} as never);
    const markFailed = jest.spyOn(inboxRepo, 'markPermanentlyFailed').mockResolvedValue(baseInbox());
    jest.spyOn(inboxRepo, 'persistOrGet').mockResolvedValue({ inbox: baseInbox(), created: true });
    jest.spyOn(inboxRepo, 'markValidated').mockResolvedValue(baseInbox());

    const service = new DeviceConnectionWebhookIngestService(
      inboxRepo,
      { vehicle: { findUnique: jest.fn() } } as never,
      queue as never,
    );

    const result = await service.receiveObdPlugWebhook({
      rawBody: Buffer.from('{}'),
      body: {},
      tokenId: 99,
      vehicle: null,
      pluggedIn: false,
      observedAt: new Date(),
    });

    expect(result.processingStatus).toBe('PERMANENTLY_FAILED');
    expect(markFailed).toHaveBeenCalledWith(
      'inbox-1',
      expect.objectContaining({ errorCode: DEVICE_CONNECTION_WEBHOOK_ERROR_CODES.VEHICLE_NOT_MAPPED }),
    );
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it('marks PERMANENTLY_FAILED for non-boolean plug state', async () => {
    const inboxRepo = new DeviceConnectionWebhookInboxRepository({} as never);
    const markFailed = jest.spyOn(inboxRepo, 'markPermanentlyFailed').mockResolvedValue(baseInbox());
    jest.spyOn(inboxRepo, 'persistOrGet').mockResolvedValue({ inbox: baseInbox(), created: true });

    const service = new DeviceConnectionWebhookIngestService(
      inboxRepo,
      { vehicle: { findUnique: jest.fn() } } as never,
      queue as never,
    );

    await service.receiveObdPlugWebhook({
      rawBody: Buffer.from('{}'),
      body: {},
      tokenId: 42,
      vehicle: { id: 'veh-1', organizationId: 'org-1' },
      pluggedIn: null,
      observedAt: new Date(),
    });

    expect(markFailed).toHaveBeenCalledWith(
      'inbox-1',
      expect.objectContaining({ errorCode: DEVICE_CONNECTION_WEBHOOK_ERROR_CODES.PARSE_FAILED }),
    );
  });
});

describe('DeviceConnectionWebhookProcessingService', () => {
  const webhook = {
    processInboxEntry: jest.fn(),
  };

  function makeProcessing(inboxRow: ReturnType<typeof baseInbox>) {
    const inboxRepo = new DeviceConnectionWebhookInboxRepository({} as never);
    jest.spyOn(inboxRepo, 'findById').mockResolvedValue(inboxRow);
    jest.spyOn(inboxRepo, 'incrementProcessingAttempt').mockResolvedValue(inboxRow);
    jest.spyOn(inboxRepo, 'markProcessed').mockResolvedValue(inboxRow);
    jest.spyOn(inboxRepo, 'markIgnoredByPolicy').mockResolvedValue(inboxRow);
    jest.spyOn(inboxRepo, 'markRetryableFailed').mockResolvedValue(inboxRow);
    jest.spyOn(inboxRepo, 'markDeadLetter').mockResolvedValue(inboxRow);
    jest.spyOn(inboxRepo, 'markPermanentlyFailed').mockResolvedValue(inboxRow);

    const service = new DeviceConnectionWebhookProcessingService(
      inboxRepo,
      webhook as unknown as DeviceConnectionWebhookService,
    );
    return { service, inboxRepo };
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('marks PROCESSED when domain service creates event', async () => {
    webhook.processInboxEntry.mockResolvedValue({
      outcome: 'created',
      eventId: 'conn-evt-1',
      eventType: DimoDeviceConnectionEventType.OBD_DEVICE_UNPLUGGED,
    });
    const { service, inboxRepo } = makeProcessing(baseInbox());

    await service.processInboxId('inbox-1');

    expect(inboxRepo.markProcessed).toHaveBeenCalledWith('inbox-1', 'conn-evt-1');
  });

  it('marks IGNORED_BY_POLICY for policy gate — not technical ignored', async () => {
    webhook.processInboxEntry.mockResolvedValue({
      outcome: 'ignored_by_policy',
      policyReason: 'no_state_change',
      eventType: DimoDeviceConnectionEventType.OBD_DEVICE_UNPLUGGED,
    });
    const { service, inboxRepo } = makeProcessing(baseInbox());

    await service.processInboxId('inbox-1');

    expect(inboxRepo.markIgnoredByPolicy).toHaveBeenCalledWith('inbox-1', 'no_state_change');
    expect(inboxRepo.markRetryableFailed).not.toHaveBeenCalled();
  });

  it('retries on episode sync failure', async () => {
    webhook.processInboxEntry.mockRejectedValue(new Error('EPISODE_SYNC_FAILED:db down'));
    const { service, inboxRepo } = makeProcessing(baseInbox());

    await expect(service.processInboxId('inbox-1')).rejects.toThrow('EPISODE_SYNC_FAILED');
    expect(inboxRepo.markRetryableFailed).toHaveBeenCalled();
    expect(inboxRepo.markDeadLetter).not.toHaveBeenCalled();
  });

  it('dead-letters after max attempts', async () => {
    webhook.processInboxEntry.mockRejectedValue(new Error('EPISODE_SYNC_FAILED:db down'));
    const { service, inboxRepo } = makeProcessing(
      baseInbox({ processingAttempts: 4 }),
    );

    await service.processInboxId('inbox-1');

    expect(inboxRepo.markDeadLetter).toHaveBeenCalled();
  });

  it('skips already processed inbox on worker restart', async () => {
    const { service, inboxRepo } = makeProcessing(
      baseInbox({ processingStatus: DeviceConnectionWebhookInboxStatus.PROCESSED }),
    );

    await service.processInboxId('inbox-1');

    expect(webhook.processInboxEntry).not.toHaveBeenCalled();
  });
});

describe('DimoWebhookController — signature rejection', () => {
  it('throws UnauthorizedException on invalid HMAC', async () => {
    const { DimoWebhookController } = await import('../dimo-webhook.controller');
    const originalSecret = process.env.DIMO_WEBHOOK_SECRET;
    const originalToken = process.env.DIMO_WEBHOOK_VERIFICATION_TOKEN;
    process.env.DIMO_WEBHOOK_VERIFICATION_TOKEN = 'token';
    process.env.DIMO_WEBHOOK_SECRET = 'secret';
    process.env.NODE_ENV = 'production';

    const controller = new DimoWebhookController(
      { webhookVerificationToken: 'token' } as never,
      { vehicle: { findFirst: jest.fn() } } as never,
      { upsertDtc: jest.fn() } as never,
      { receiveObdPlugWebhook: jest.fn() } as never,
      { ingestRpmThresholdEvent: jest.fn() } as never,
    );

    const body = { type: 'dimo.trigger', subject: 'did:erc721:137:0xabc:1', data: {} };
    await expect(
      controller.handleWebhook(
        { rawBody: Buffer.from(JSON.stringify(body)) } as never,
        body,
        'bad-signature',
        { type: jest.fn() } as never,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    process.env.DIMO_WEBHOOK_SECRET = originalSecret;
    process.env.DIMO_WEBHOOK_VERIFICATION_TOKEN = originalToken;
  });
});

describe('DeviceConnectionWebhookService — technical errors propagate', () => {
  it('throws on episode sync failure instead of returning ignored', async () => {
    const upsert = jest.fn().mockResolvedValue({
      id: 'evt-1',
      createdAt: new Date('2026-06-28T12:00:00Z'),
      updatedAt: new Date('2026-06-28T12:00:00Z'),
    });
    const update = jest.fn().mockResolvedValue({});
    const episodeService = {
      openFromUnplugEvent: jest.fn().mockRejectedValue(new Error('db timeout')),
      resolveFromExplicitPlugEvent: jest.fn(),
    };

    const service = new DeviceConnectionWebhookService(
      {
        dimoDeviceConnectionEvent: {
          upsert,
          update,
          findFirst: jest.fn().mockResolvedValue(null),
        },
        vehicle: { findUnique: jest.fn().mockResolvedValue(null) },
      } as never,
      episodeService as never,
    );

    await expect(
      service.ingestObdPlugStateChange({
        vehicle: { id: 'v1', organizationId: 'o1' },
        tokenId: 42,
        pluggedIn: false,
        observedAt: new Date('2026-06-28T12:00:00Z'),
        rawPayload: {},
      }),
    ).rejects.toThrow('EPISODE_SYNC_FAILED');
  });
});
