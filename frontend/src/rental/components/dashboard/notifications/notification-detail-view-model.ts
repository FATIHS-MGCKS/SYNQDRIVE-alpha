import type { ActionQueueItem } from '../dashboardTypes';
import type { ApiNotificationAvailableAction } from '../../../lib/notifications/notification-api.types';

export interface NotificationDetailViewModel {
  issueTitle: string;
  issueDescription: string;
  ctaPrimaryLabel: string;
  showCreateTask: boolean;
  createTaskLabel: string;
  availableActions?: ApiNotificationAvailableAction[];
}

export type { ActionQueueItem };
