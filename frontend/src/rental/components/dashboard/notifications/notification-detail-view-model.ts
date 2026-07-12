import type { ActionQueueItem } from '../dashboardTypes';
import type { ApiNotificationAvailableAction } from '../../../lib/notifications/notification-api.types';
import type { NotificationAffectedVehicle } from './notification-affected-vehicles';

export interface NotificationDetailViewModel {
  issueTitle: string;
  issueDescription: string;
  ctaPrimaryLabel: string;
  showCreateTask: boolean;
  createTaskLabel: string;
  availableActions?: ApiNotificationAvailableAction[];
  affectedVehicles?: NotificationAffectedVehicle[];
  affectedVehiclesLabel?: string;
}

export type { ActionQueueItem };
