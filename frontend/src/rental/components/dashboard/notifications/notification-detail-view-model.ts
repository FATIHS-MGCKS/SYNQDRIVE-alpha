import type { ActionQueueItem } from '../dashboardTypes';
import type { ApiNotificationAvailableAction } from '../../../lib/notifications/notification-api.types';
import type { NotificationAffectedVehicle } from './notification-affected-vehicles';
import type { NotificationDetailField } from './notification-handover-copy';

export interface NotificationDetailViewModel {
  issueTitle: string;
  issueDescription: string;
  detailFields?: NotificationDetailField[];
  ctaPrimaryLabel: string;
  ctaSecondaryLabel?: string;
  showContactCustomer?: boolean;
  showCreateTask: boolean;
  createTaskLabel: string;
  availableActions?: ApiNotificationAvailableAction[];
  affectedVehicles?: NotificationAffectedVehicle[];
  affectedVehiclesLabel?: string;
}

export type { ActionQueueItem };
