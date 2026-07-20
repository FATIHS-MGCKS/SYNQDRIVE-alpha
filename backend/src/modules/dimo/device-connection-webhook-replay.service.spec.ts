import { BadRequestException } from '@nestjs/common';
import { DeviceConnectionWebhookProcessingStatus } from '@prisma/client';
import { DeviceConnectionWebhookReplayService } from './device-connection-webhook-replay.service';

describe('DeviceConnectionWebhookReplayService', () => {
  const orgId = 'org-1';
  const inboxId = 'inbox-1';
  const operatorUserId = 'user-1';

  function makeService(overrides?: {
    row?: Record<string, unknown> | null;
    requeue?: boolean;
  }) {
    const inboxRepo = {
      findByIdForOrganization: jest.fn().mockResolvedValue(
        overrides?.row ?? {
          id: inboxId,
          processingStatus: DeviceConnectionWebhookProcessingStatus.DEAD_LETTER,
          providerEventId: 'prov-1',
        },
      ),
      requeueForReplay: jest.fn().mockResolvedValue(overrides?.requeue ?? true),
    };
    const scheduler = { scheduleInboxIds: jest.fn().mockResolvedValue(undefined) };
    const audit = { record: jest.fn().mockResolvedValue('audit-1') };
    const service = new DeviceConnectionWebhookReplayService(
      inboxRepo as never,
      scheduler as never,
      audit as never,
    );
    return { service, inboxRepo, scheduler, audit };
  }

  it('requeues dead-letter rows with audit trail', async () => {
    const { service, scheduler, audit } = makeService();
    const result = await service.replayForOrganization({
      organizationId: orgId,
      inboxId,
      operatorUserId,
      reason: 'Operator verified transient DIMO outage',
    });

    expect(result).toEqual({
      inboxId,
      queued: true,
      processingStatus: DeviceConnectionWebhookProcessingStatus.RECEIVED,
    });
    expect(scheduler.scheduleInboxIds).toHaveBeenCalledWith([inboxId], true);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: operatorUserId,
        entityId: inboxId,
        changeSummary: 'Operator verified transient DIMO outage',
      }),
    );
  });

  it('rejects replay without sufficient reason', async () => {
    const { service } = makeService();
    await expect(
      service.replayForOrganization({
        organizationId: orgId,
        inboxId,
        operatorUserId,
        reason: 'short',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects replay for non-replayable status', async () => {
    const { service } = makeService({
      row: {
        id: inboxId,
        processingStatus: DeviceConnectionWebhookProcessingStatus.PROCESSED,
        providerEventId: 'prov-1',
      },
    });

    await expect(
      service.replayForOrganization({
        organizationId: orgId,
        inboxId,
        operatorUserId,
        reason: 'Should not replay processed rows',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
