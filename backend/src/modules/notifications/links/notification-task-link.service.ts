import { Injectable, Logger } from '@nestjs/common';
import { NotificationStatus } from '@prisma/client';
import { NotificationCoreService } from '../notification-core.service';
import { NotificationEngineConfig } from '../notification-engine.config';
import { NotificationRepository } from '../notification.repository';
import { canResolveNotificationOnTaskComplete } from './notification-task-link.registry';
import { readNotificationIdFromTaskMetadata } from './notification-task-link.util';

export interface TaskCompletionNotificationContext {
  id: string;
  organizationId: string;
  metadata: unknown;
}

@Injectable()
export class NotificationTaskLinkService {
  private readonly logger = new Logger(NotificationTaskLinkService.name);

  constructor(
    private readonly config: NotificationEngineConfig,
    private readonly repository: NotificationRepository,
    private readonly core: NotificationCoreService,
  ) {}

  isDecouplingEnabled(): boolean {
    return this.config.isActionQueueDecoupled();
  }

  /**
   * When a linked task is completed, resolve the notification only if the registry allows it.
   * Underlying producers may reopen the notification if the root cause persists.
   */
  async onTaskCompleted(task: TaskCompletionNotificationContext): Promise<void> {
    if (!this.isDecouplingEnabled()) return;

    const notificationId = readNotificationIdFromTaskMetadata(task.metadata);
    if (!notificationId) return;

    const notification = await this.repository.findById(notificationId, task.organizationId);
    if (!notification) return;
    if (notification.status === NotificationStatus.RESOLVED || notification.status === NotificationStatus.ARCHIVED) {
      return;
    }

    if (!canResolveNotificationOnTaskComplete(notification.eventType)) {
      this.logger.debug(
        `Task ${task.id} completed; notification ${notificationId} (${notification.eventType}) stays open per registry`,
      );
      return;
    }

    await this.core.resolveNotification(notificationId, task.organizationId, new Date(), {
      manual: false,
    });
  }
}
