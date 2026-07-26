/** Mirrors backend Notification API DTO (V4.9.356+). */

export type ApiNotificationSeverity = 'CRITICAL' | 'WARNING' | 'INFO' | 'SUCCESS';
export type ApiNotificationStatus = 'OPEN' | 'ACKNOWLEDGED' | 'SNOOZED' | 'RESOLVED' | 'ARCHIVED';
export type ApiNotificationDomain =
  | 'OPERATIONS'
  | 'VEHICLE_HEALTH'
  | 'DRIVING_ANALYSIS'
  | 'BOOKINGS'
  | 'HANDOVERS'
  | 'DOCUMENTS'
  | 'BILLING'
  | 'SECURITY'
  | 'SYSTEM';

export type ApiNotificationEntityType =
  | 'VEHICLE'
  | 'BOOKING'
  | 'STATION'
  | 'CUSTOMER'
  | 'INVOICE'
  | 'TRIP'
  | 'FLEET'
  | 'ORGANIZATION';

export type ApiNotificationActionType =
  | 'OPEN_VEHICLE'
  | 'OPEN_VEHICLE_MODULE'
  | 'OPEN_BOOKING'
  | 'OPEN_HANDOVER_PICKUP'
  | 'OPEN_HANDOVER_RETURN'
  | 'OPEN_STATION'
  | 'OPEN_BILLING'
  | 'OPEN_RENTAL';

export type ApiNotificationAvailableAction =
  | 'read'
  | 'unread'
  | 'acknowledge'
  | 'snooze'
  | 'unsnooze'
  | 'resolve'
  | 'archive'
  | 'open_entity';

export interface ApiNotificationActionTarget {
  type?: ApiNotificationActionType;
  vehicleId?: string;
  bookingId?: string;
  stationId?: string;
  customerId?: string;
  invoiceId?: string;
  tripId?: string;
  module?: string;
}

export interface ApiNotificationResponse {
  id: string;
  eventType: string;
  domain: ApiNotificationDomain;
  severity: ApiNotificationSeverity;
  status: ApiNotificationStatus;
  entity: {
    type: ApiNotificationEntityType;
    id: string;
    displayLabel?: string;
  };
  titleKey: string;
  bodyKey: string;
  templateParams: Record<string, string | number | boolean | null>;
  action: {
    type: ApiNotificationActionType;
    target: ApiNotificationActionTarget;
  };
  source: {
    type: string;
    ref: string;
  };
  firstSeenAt: string;
  lastSeenAt: string;
  occurrenceCount: number;
  resolvedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  userReceipt: {
    readAt: string | null;
    acknowledgedAt: string | null;
    snoozedUntil: string | null;
    hiddenAt: string | null;
  };
  availableActions: ApiNotificationAvailableAction[];
}

export type ApiNotificationListMeta =
  | {
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    }
  | {
      limit: number;
      nextCursor: string | null;
    };

export interface ApiNotificationListResponse {
  data: ApiNotificationResponse[];
  meta: ApiNotificationListMeta;
}

export interface ApiNotificationCountsResponse {
  totalActive: number;
  unread: number;
  critical: number;
  warning: number;
  info: number;
  resolvedRecent: number;
  byDomain: Record<string, number>;
}

export interface ApiNotificationListParams {
  page?: number;
  limit?: number;
  cursor?: string;
  activeOnly?: boolean;
  unreadOnly?: boolean;
  resolvedOnly?: boolean;
  from?: string;
  to?: string;
  sortBy?: 'lastSeenAt' | 'createdAt' | 'severity';
  sortOrder?: 'asc' | 'desc';
  status?: ApiNotificationStatus | ApiNotificationStatus[];
  severity?: ApiNotificationSeverity | ApiNotificationSeverity[];
  domain?: ApiNotificationDomain;
  entityType?: ApiNotificationEntityType;
  entityId?: string;
  vehicleId?: string;
  stationId?: string;
  bookingId?: string;
  search?: string;
  readState?: 'unread' | 'read' | 'snoozed' | 'hidden';
  timeField?: 'lastSeenAt' | 'createdAt' | 'resolvedAt';
}

export type ApiNotificationCountsParams = ApiNotificationListParams;
