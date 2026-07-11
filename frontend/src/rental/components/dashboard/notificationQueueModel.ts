import type { InsightDataSource } from './dashboardTypes';

/** Canonical display severity for notification queue items. */
export type NotificationSeverity = 'critical' | 'warning' | 'info' | 'success';

export type NotificationLifecycleStatus =
  | 'open'
  | 'acknowledged'
  | 'snoozed'
  | 'resolved'
  | 'archived';

export type NotificationReadStatus = 'unread' | 'read';

export type NotificationDomain =
  | 'operations'
  | 'vehicle-health'
  | 'driving-analysis'
  | 'bookings'
  | 'handovers'
  | 'documents'
  | 'billing'
  | 'security'
  | 'system';

export type NotificationEntityType =
  | 'vehicle'
  | 'booking'
  | 'station'
  | 'customer'
  | 'invoice'
  | 'trip'
  | 'fleet'
  | 'organization';

export type NotificationSourceKind =
  | 'operational-issue'
  | 'dashboard-insight'
  | 'predictive-insight'
  | 'derived-insight'
  | 'booking-tile'
  | 'health-alert'
  | 'runtime'
  | 'adapter';

export type NotificationActionType =
  | 'open-vehicle'
  | 'open-vehicle-module'
  | 'open-booking'
  | 'open-handover-pickup'
  | 'open-handover-return'
  | 'open-station'
  | 'open-billing'
  | 'open-rental';

export interface NotificationActionTarget {
  type: NotificationActionType;
  vehicleId?: string;
  bookingId?: string;
  stationId?: string;
  customerId?: string;
  invoiceId?: string;
  tripId?: string;
  module?: string;
}

/**
 * Structured intermediate model for Dashboard Notification Box items.
 * Populated by `enrichNotificationQueueItem` — not persisted backend-side (V2).
 */
export interface NotificationQueueModel {
  severity: NotificationSeverity;
  lifecycleStatus: NotificationLifecycleStatus;
  readStatus: NotificationReadStatus;
  domain: NotificationDomain;
  source: NotificationSourceKind;
  legacySource: InsightDataSource;
  occurredAt: string | null;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  resolvedAt: string | null;
  createdAt: string | null;
  entityType: NotificationEntityType;
  entityId: string | null;
  actionType: NotificationActionType;
  actionTarget: NotificationActionTarget;
  semanticKey: string;
  /** Stable sort key derived from structured timestamps — never Date.now(). */
  sortMs: number;
  issueType?: string;
  conditionCode?: string;
}

export function mapLegacyInsightSource(source: InsightDataSource): NotificationSourceKind {
  switch (source) {
    case 'dashboard-insights':
      return 'dashboard-insight';
    case 'predictive-operations':
      return 'predictive-insight';
    case 'derived-operations':
      return 'derived-insight';
    case 'booking':
      return 'booking-tile';
    case 'financial':
      return 'operational-issue';
    default:
      return 'operational-issue';
  }
}

export function notificationSeverityRank(severity: NotificationSeverity): number {
  switch (severity) {
    case 'critical':
      return 4;
    case 'warning':
      return 3;
    case 'info':
      return 2;
    case 'success':
      return 1;
    default:
      return 0;
  }
}
