import {
  NotificationActionType,
  NotificationDomain,
  NotificationEntityType,
  NotificationEventKind,
  NotificationSeverity,
  NotificationSourceType,
} from '@modules/notifications/notification.enums';
import type { WorkflowInAppNotificationTemplateKey, WorkflowRecipientRole } from './workflow-action-adapter.types';

export interface WorkflowNotificationTemplateDef {
  eventType: string;
  conditionCode: string;
  titleKey: string;
  bodyKey: string;
  domain: NotificationDomain;
  defaultEntityType: NotificationEntityType;
  actionType: NotificationActionType;
  defaultSeverity: NotificationSeverity;
  supportedRoles: WorkflowRecipientRole[];
}

export const WORKFLOW_IN_APP_TEMPLATES: Record<
  WorkflowInAppNotificationTemplateKey,
  WorkflowNotificationTemplateDef
> = {
  booking_attention: {
    eventType: 'WORKFLOW_BOOKING_ATTENTION',
    conditionCode: 'workflow_booking_attention',
    titleKey: 'notification.title.workflowBookingAttention',
    bodyKey: 'notification.body.workflowBookingAttention',
    domain: NotificationDomain.BOOKINGS,
    defaultEntityType: NotificationEntityType.BOOKING,
    actionType: NotificationActionType.OPEN_BOOKING,
    defaultSeverity: NotificationSeverity.WARNING,
    supportedRoles: ['ORG_ADMIN', 'SUB_ADMIN', 'OPERATIONS'],
  },
  vehicle_attention: {
    eventType: 'WORKFLOW_VEHICLE_ATTENTION',
    conditionCode: 'workflow_vehicle_attention',
    titleKey: 'notification.title.workflowVehicleAttention',
    bodyKey: 'notification.body.workflowVehicleAttention',
    domain: NotificationDomain.VEHICLE_HEALTH,
    defaultEntityType: NotificationEntityType.VEHICLE,
    actionType: NotificationActionType.OPEN_VEHICLE,
    defaultSeverity: NotificationSeverity.WARNING,
    supportedRoles: ['ORG_ADMIN', 'FLEET_MANAGER', 'OPERATIONS'],
  },
  workflow_alert: {
    eventType: 'WORKFLOW_GENERIC_ALERT',
    conditionCode: 'workflow_generic_alert',
    titleKey: 'notification.title.workflowGenericAlert',
    bodyKey: 'notification.body.workflowGenericAlert',
    domain: NotificationDomain.OPERATIONS,
    defaultEntityType: NotificationEntityType.ORGANIZATION,
    actionType: NotificationActionType.OPEN_RENTAL,
    defaultSeverity: NotificationSeverity.INFO,
    supportedRoles: ['ORG_ADMIN', 'SUB_ADMIN'],
  },
};

export const WORKFLOW_NOTIFICATION_EVENT_KIND = NotificationEventKind.EVENT;
export const WORKFLOW_NOTIFICATION_SOURCE = NotificationSourceType.WORKFLOW;
