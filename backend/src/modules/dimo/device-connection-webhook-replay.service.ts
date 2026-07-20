import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DeviceConnectionWebhookProcessingStatus } from '@prisma/client';
import { AuditService } from '@modules/activity-log/audit.service';
import { DeviceConnectionWebhookInboxRepository } from './device-connection-webhook-inbox.repository';
import { DeviceConnectionWebhookInboxSchedulerService } from './device-connection-webhook-inbox-scheduler.service';

const REPLAYABLE_STATUSES = new Set<DeviceConnectionWebhookProcessingStatus>([
  DeviceConnectionWebhookProcessingStatus.RETRYABLE_FAILED,
  DeviceConnectionWebhookProcessingStatus.DEAD_LETTER,
]);

export interface ReplayDeviceConnectionWebhookInput {
  organizationId: string;
  inboxId: string;
  operatorUserId: string;
  reason: string;
}

@Injectable()
export class DeviceConnectionWebhookReplayService {
  constructor(
    private readonly inboxRepo: DeviceConnectionWebhookInboxRepository,
    private readonly scheduler: DeviceConnectionWebhookInboxSchedulerService,
    private readonly audit: AuditService,
  ) {}

  async replayForOrganization(
    input: ReplayDeviceConnectionWebhookInput,
  ): Promise<{ inboxId: string; queued: boolean; processingStatus: DeviceConnectionWebhookProcessingStatus }> {
    const reason = input.reason?.trim();
    if (!reason || reason.length < 8) {
      throw new BadRequestException('Replay reason must be at least 8 characters');
    }

    const row = await this.inboxRepo.findByIdForOrganization(input.inboxId, input.organizationId);
    if (!row) {
      throw new NotFoundException('Device connection webhook inbox row not found for organization');
    }

    if (!REPLAYABLE_STATUSES.has(row.processingStatus)) {
      throw new BadRequestException(
        `Inbox row status ${row.processingStatus} is not eligible for manual replay`,
      );
    }

    const requeued = await this.inboxRepo.requeueForReplay(input.inboxId, input.organizationId);
    if (!requeued) {
      throw new BadRequestException('Inbox row could not be requeued for replay');
    }

    await this.scheduler.scheduleInboxIds([input.inboxId], true);

    void this.audit.record({
      actorUserId: input.operatorUserId,
      actorOrganizationId: input.organizationId,
      action: 'SYNC',
      entity: 'INTEGRATION',
      entityId: input.inboxId,
      description: 'Manual replay of device connection webhook inbox row',
      changeSummary: reason,
      level: 'WARN',
      metaJson: {
        inboxId: input.inboxId,
        previousStatus: row.processingStatus,
        providerEventId: row.providerEventId,
        operatorUserId: input.operatorUserId,
        reason,
      },
    });

    return {
      inboxId: input.inboxId,
      queued: true,
      processingStatus: DeviceConnectionWebhookProcessingStatus.RECEIVED,
    };
  }
}
