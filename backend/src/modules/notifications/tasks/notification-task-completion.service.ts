import { Injectable, Logger, Optional } from '@nestjs/common';
import { NotificationStatus } from '@prisma/client';
import { NotificationCoreService } from '../notification-core.service';
import { NotificationRepository } from '../notification.repository';
import { extractNotificationTaskLink } from './notification-task-materializer';
import { evaluateNotificationResolveOnTaskCompletion } from './notification-task-completion.policy';
import { NotificationAuditService } from '../audit/notification-audit.service';

@Injectable()
export class NotificationTaskCompletionService {
  private readonly logger = new Logger(NotificationTaskCompletionService.name);

  constructor(
    private readonly repository: NotificationRepository,
    @Optional() private readonly core?: NotificationCoreService,
    @Optional() private readonly notificationAudit?: NotificationAuditService,
  ) {}

  /**
   * Called after a linked task reaches DONE. Notification and task remain
   * separate objects — resolve only when registry policy permits.
   */
  async handleTaskCompleted(task: {
    id: string;
    organizationId: string;
    metadata: unknown;
    resolutionNote?: string | null;
    completionMode?: string | null;
  }): Promise<{ resolved: boolean; reason?: string }> {
    if (!this.core?.isEnabled()) {
      return { resolved: false, reason: 'NOTIFICATIONS_V2_DISABLED' };
    }

    const link = extractNotificationTaskLink(task.metadata);
    if (!link) {
      return { resolved: false, reason: 'NOT_LINKED' };
    }

    if (link.organizationId !== task.organizationId) {
      return { resolved: false, reason: 'ORG_MISMATCH' };
    }

    const notification = await this.repository.findById(
      link.notificationId,
      task.organizationId,
    );
    if (!notification) {
      return { resolved: false, reason: 'NOTIFICATION_NOT_FOUND' };
    }

    const conditionCleared = await this.isUnderlyingConditionCleared(notification);
    const decision = evaluateNotificationResolveOnTaskCompletion({
      notification: {
        id: notification.id,
        organizationId: notification.organizationId,
        eventType: notification.eventType,
        eventKind: notification.eventKind,
        status: notification.status,
        fingerprint: notification.fingerprint,
      },
      task: {
        resolutionNote: task.resolutionNote,
        completionMode: task.completionMode,
      },
      conditionCleared,
    });

    if (decision.action === 'skip') {
      this.logger.debug(
        `Skip notification resolve for task ${task.id} → ${link.notificationId}: ${decision.reason}`,
      );
      return { resolved: false, reason: decision.reason };
    }

    await this.core.resolveNotification(
      notification.id,
      notification.organizationId,
      new Date(),
      {
        manual: decision.mode === 'manual',
        eventKind: notification.eventKind,
      },
      {
        auditActorType: 'AUTOMATION',
        runId: `task:${task.id}`,
      },
    );

    this.logger.log({
      msg: 'notification.resolved_from_task',
      taskId: task.id,
      notificationId: notification.id,
      mode: decision.mode,
    });

    return { resolved: true };
  }

  /** Task cancellation/deletion must not resolve notifications. */
  async handleTaskCancelled(_task: { id: string; metadata: unknown }): Promise<void> {
    return;
  }

  private async isUnderlyingConditionCleared(notification: {
    organizationId: string;
    fingerprint: string;
    status: NotificationStatus;
  }): Promise<boolean> {
    if (notification.status === NotificationStatus.RESOLVED) {
      return true;
    }

    const active = await this.repository.findAnyActiveByFingerprint(
      notification.organizationId,
      notification.fingerprint,
    );

    return !active;
  }
}
