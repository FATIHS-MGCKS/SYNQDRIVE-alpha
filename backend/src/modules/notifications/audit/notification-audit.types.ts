import type {
  NotificationAuditActorType,
  NotificationAuditEventType,
  NotificationSeverity,
  NotificationStatus,
} from '@prisma/client';

export interface NotificationAuditStateSnapshot {
  status?: NotificationStatus | string;
  severity?: NotificationSeverity | string;
  lifecycleGeneration?: number;
  reopenCount?: number;
  eventType?: string;
  domain?: string;
  channel?: string;
  deliveryId?: string;
  scope?: 'personal' | 'org_wide';
}

export interface NotificationAuditClientMeta {
  route?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface RecordNotificationAuditInput {
  organizationId: string;
  notificationId?: string | null;
  eventType: NotificationAuditEventType;
  actorType: NotificationAuditActorType;
  actorUserId?: string | null;
  previousState?: NotificationAuditStateSnapshot | null;
  nextState?: NotificationAuditStateSnapshot | null;
  reasonCode?: string | null;
  correlationId?: string | null;
  clientMeta?: NotificationAuditClientMeta | null;
  legalHold?: boolean;
}

export interface ListNotificationAuditInput {
  organizationId: string;
  notificationId?: string;
  eventType?: NotificationAuditEventType;
  limit?: number;
  cursor?: string;
}
