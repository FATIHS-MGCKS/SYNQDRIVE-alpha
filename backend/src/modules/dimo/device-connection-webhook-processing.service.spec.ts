import {
  DeviceConnectionWebhookProcessingStatus,
  DimoDeviceConnectionEventType,
} from '@prisma/client';
import deviceConnectionWebhookInboxConfig from '@config/device-connection-webhook-inbox.config';
import { DeviceConnectionWebhookProcessingService } from './device-connection-webhook-processing.service';
import { DeviceConnectionWebhookService } from './device-connection-webhook.service';

const config = deviceConnectionWebhookInboxConfig();

function baseRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'inbox-1',
    provider: 'DIMO',
    eventType: DimoDeviceConnectionEventType.OBD_DEVICE_UNPLUGGED,
    tokenId: 1001,
    observedAt: new Date('2026-06-28T12:00:00.000Z'),
    rawPayloadJson: { value: false },
    processingAttempts: 0,
    processingStatus: DeviceConnectionWebhookProcessingStatus.RECEIVED,
    ...overrides,
  };
}

function mockRepo() {
  return {
    findById: jest.fn(),
    claimForProcessing: jest.fn(),
    findVehicleByTokenId: jest.fn(),
    markValidated: jest.fn().mockResolvedValue({}),
    markProcessed: jest.fn().mockResolvedValue({}),
    markIgnoredByPolicy: jest.fn().mockResolvedValue({}),
    markPermanentlyFailed: jest.fn().mockResolvedValue({}),
    markRetryableFailed: jest.fn().mockResolvedValue({}),
    markDeadLetter: jest.fn().mockResolvedValue({}),
  };
}

describe('DeviceConnectionWebhookProcessingService', () => {
  it('processes first attempt successfully', async () => {
    const repo = mockRepo();
    const row = baseRow();
    repo.findById.mockResolvedValue(row);
    repo.claimForProcessing.mockResolvedValue({ ...row, processingAttempts: 1 });
    repo.findVehicleByTokenId.mockResolvedValue({ id: 'veh-1', organizationId: 'org-1' });

    const deviceConnection = {
      processValidatedWebhookEvent: jest.fn().mockResolvedValue({
        outcome: 'created',
        eventId: 'evt-1',
        eventType: DimoDeviceConnectionEventType.OBD_DEVICE_UNPLUGGED,
      }),
    };
    const observability = { log: jest.fn(), logWarn: jest.fn() };

    const service = new DeviceConnectionWebhookProcessingService(
      config as never,
      repo as never,
      deviceConnection as never,
      observability as never,
    );

    const outcome = await service.processInboxId('inbox-1');
    expect(outcome).toBe('processed');
    expect(repo.markProcessed).toHaveBeenCalledWith('inbox-1', { domainEventId: 'evt-1' });
  });

  it('schedules retry on transient failure', async () => {
    const repo = mockRepo();
    const row = baseRow();
    repo.findById.mockResolvedValue(row);
    repo.claimForProcessing.mockResolvedValue({ ...row, processingAttempts: 1 });
    repo.findVehicleByTokenId.mockResolvedValue({ id: 'veh-1', organizationId: 'org-1' });

    const deviceConnection = {
      processValidatedWebhookEvent: jest.fn().mockRejectedValue(new Error('db timeout')),
    };

    const service = new DeviceConnectionWebhookProcessingService(
      config as never,
      repo as never,
      deviceConnection as never,
    );

    await expect(service.processInboxId('inbox-1')).rejects.toThrow('db timeout');
    expect(repo.markRetryableFailed).toHaveBeenCalledWith(
      'inbox-1',
      expect.objectContaining({ errorCode: 'Error' }),
    );
    expect(repo.markDeadLetter).not.toHaveBeenCalled();
  });

  it('succeeds on retry after transient failure', async () => {
    const repo = mockRepo();
    const row = baseRow({
      processingStatus: DeviceConnectionWebhookProcessingStatus.RETRYABLE_FAILED,
      processingAttempts: 2,
    });
    repo.findById.mockResolvedValue(row);
    repo.claimForProcessing.mockResolvedValue({ ...row, processingAttempts: 3 });
    repo.findVehicleByTokenId.mockResolvedValue({ id: 'veh-1', organizationId: 'org-1' });

    const deviceConnection = {
      processValidatedWebhookEvent: jest.fn().mockResolvedValue({
        outcome: 'created',
        eventId: 'evt-1',
      }),
    };

    const service = new DeviceConnectionWebhookProcessingService(
      config as never,
      repo as never,
      deviceConnection as never,
    );

    expect(await service.processInboxId('inbox-1')).toBe('processed');
  });

  it('marks permanent mapping failures without retry', async () => {
    const repo = mockRepo();
    const row = baseRow();
    repo.findById.mockResolvedValue(row);
    repo.claimForProcessing.mockResolvedValue({ ...row, processingAttempts: 1 });
    repo.findVehicleByTokenId.mockResolvedValue(null);

    const service = new DeviceConnectionWebhookProcessingService(
      config as never,
      repo as never,
      { processValidatedWebhookEvent: jest.fn() } as never,
    );

    expect(await service.processInboxId('inbox-1')).toBe('permanently_failed');
    expect(repo.markPermanentlyFailed).toHaveBeenCalledWith('inbox-1', {
      errorCode: 'unknown_vehicle',
    });
  });

  it('moves to dead letter after max attempts', async () => {
    const repo = mockRepo();
    const row = baseRow({ processingAttempts: 4 });
    repo.findById.mockResolvedValue(row);
    repo.claimForProcessing.mockResolvedValue({ ...row, processingAttempts: 5 });
    repo.findVehicleByTokenId.mockResolvedValue({ id: 'veh-1', organizationId: 'org-1' });

    const deviceConnection = {
      processValidatedWebhookEvent: jest.fn().mockRejectedValue(new Error('episode failed')),
    };
    const observability = { logWarn: jest.fn() };

    const service = new DeviceConnectionWebhookProcessingService(
      { ...config, maxAttempts: 5 } as never,
      repo as never,
      deviceConnection as never,
      observability as never,
    );

    expect(await service.processInboxId('inbox-1')).toBe('dead_letter');
    expect(repo.markDeadLetter).toHaveBeenCalled();
    expect(observability.logWarn).toHaveBeenCalledWith(
      'webhook_processing',
      expect.objectContaining({ outcome: 'dead_letter' }),
    );
  });

  it('skips already processed events without duplicate domain writes', async () => {
    const repo = mockRepo();
    repo.findById.mockResolvedValue(
      baseRow({
        processingStatus: DeviceConnectionWebhookProcessingStatus.PROCESSED,
        domainEventId: 'evt-1',
      }),
    );
    const deviceConnection = { processValidatedWebhookEvent: jest.fn() };

    const service = new DeviceConnectionWebhookProcessingService(
      config as never,
      repo as never,
      deviceConnection as never,
    );

    expect(await service.processInboxId('inbox-1')).toBe('skipped');
    expect(repo.claimForProcessing).not.toHaveBeenCalled();
    expect(deviceConnection.processValidatedWebhookEvent).not.toHaveBeenCalled();
  });

  it('skips when parallel worker already claimed row', async () => {
    const repo = mockRepo();
    repo.findById.mockResolvedValue(baseRow());
    repo.claimForProcessing.mockResolvedValue(null);
    const deviceConnection = { processValidatedWebhookEvent: jest.fn() };

    const service = new DeviceConnectionWebhookProcessingService(
      config as never,
      repo as never,
      deviceConnection as never,
    );

    expect(await service.processInboxId('inbox-1')).toBe('skipped');
    expect(deviceConnection.processValidatedWebhookEvent).not.toHaveBeenCalled();
  });

  it('records domain duplicate as processed without second episode', async () => {
    const repo = mockRepo();
    const row = baseRow();
    repo.findById.mockResolvedValue(row);
    repo.claimForProcessing.mockResolvedValue({ ...row, processingAttempts: 1 });
    repo.findVehicleByTokenId.mockResolvedValue({ id: 'veh-1', organizationId: 'org-1' });

    const deviceConnection = {
      processValidatedWebhookEvent: jest.fn().mockResolvedValue({
        outcome: 'duplicate',
        eventId: 'evt-dup',
      }),
    };

    const service = new DeviceConnectionWebhookProcessingService(
      config as never,
      repo as never,
      deviceConnection as never,
    );

    expect(await service.processInboxId('inbox-1')).toBe('duplicate');
    expect(deviceConnection.processValidatedWebhookEvent).toHaveBeenCalledTimes(1);
  });

  it('allows replay after requeue resets status to RECEIVED', async () => {
    const repo = mockRepo();
    const row = baseRow({
      processingStatus: DeviceConnectionWebhookProcessingStatus.RECEIVED,
      processingAttempts: 5,
    });
    repo.findById.mockResolvedValue(row);
    repo.claimForProcessing.mockResolvedValue({ ...row, processingAttempts: 6 });
    repo.findVehicleByTokenId.mockResolvedValue({ id: 'veh-1', organizationId: 'org-1' });

    const deviceConnection = {
      processValidatedWebhookEvent: jest.fn().mockResolvedValue({
        outcome: 'created',
        eventId: 'evt-1',
      }),
    };

    const service = new DeviceConnectionWebhookProcessingService(
      config as never,
      repo as never,
      deviceConnection as never,
    );

    expect(await service.processInboxId('inbox-1', true)).toBe('processed');
  });
});
