import type { MembershipRole, NotificationSeverity, UserNotificationPreference } from '@prisma/client';

export type PlatformRole = 'MASTER_ADMIN' | string | undefined;

export interface NotificationAccessContext {
  userId: string;
  organizationId: string;
  membershipRole: MembershipRole;
  platformRole?: PlatformRole;
  stationScope: string | null;
  /** Stations V2 / legacy — all allowed station IDs for scoped roles. */
  scopedStationIds: string[];
  /** Legacy single-station shortcut (first of scopedStationIds when length === 1). */
  scopedStationId?: string;
  scopedVehicleIds: string[];
  scopedBookingIds: string[];
  /** True when platform admin or org admin without station restriction. */
  bypassStationScope: boolean;
  preferences: UserNotificationPreference[];
}

export interface NotificationScopeRow {
  id: string;
  eventType: string;
  domain: string;
  severity: NotificationSeverity;
  entityType: string;
  entityId: string;
  actionTarget: unknown;
  status: string;
}

export interface PreferenceDeliveryDecision {
  inApp: boolean;
  email: boolean;
  push: boolean;
  sms: boolean;
  mandatory: boolean;
  suppressedByPreference: boolean;
}
