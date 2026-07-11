import type {
  Notification,
  NotificationActionType,
  NotificationDomain,
  NotificationEntityType,
  NotificationEventKind,
  NotificationReceipt,
  NotificationSeverity,
  NotificationSourceType,
  NotificationStatus,
} from '@prisma/client';
import type { NotificationActionTarget } from '../notification.types';
import type { NotificationAvailableAction } from './notification-available-actions';
import type { MembershipRole } from '@prisma/client';
import { redactActionTargetForRole, redactTemplateParamsForRole } from '../access/notification-privacy.policy';

export interface NotificationEntityDto {
  type: NotificationEntityType;
  id: string;
  displayLabel?: string;
}

export interface NotificationActionDto {
  type: NotificationActionType;
  target: NotificationActionTarget;
}

export interface NotificationSourceSummaryDto {
  type: NotificationSourceType;
  ref: string;
}

export interface NotificationUserReceiptDto {
  readAt: string | null;
  acknowledgedAt: string | null;
  snoozedUntil: string | null;
  hiddenAt: string | null;
}

export interface NotificationResponseDto {
  id: string;
  eventType: string;
  domain: NotificationDomain;
  severity: NotificationSeverity;
  status: NotificationStatus;
  entity: NotificationEntityDto;
  titleKey: string;
  bodyKey: string;
  templateParams: Record<string, string | number | boolean | null>;
  action: NotificationActionDto;
  source: NotificationSourceSummaryDto;
  firstSeenAt: string;
  lastSeenAt: string;
  occurrenceCount: number;
  resolvedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  userReceipt: NotificationUserReceiptDto;
  availableActions: NotificationAvailableAction[];
}

export interface NotificationCountsResponseDto {
  totalActive: number;
  unread: number;
  critical: number;
  warning: number;
  info: number;
  resolvedRecent: number;
  byDomain: Record<string, number>;
}

export interface NotificationApiContext {
  membershipRole: import('@prisma/client').MembershipRole;
}

function iso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

function displayLabelFromParams(
  params: Record<string, string | number | boolean | null>,
): string | undefined {
  const label = params.label ?? params.plate ?? params.stationName ?? params.bookingRef;
  if (label == null || label === '') return undefined;
  return String(label);
}

export function mapNotificationToDto(
  row: Notification,
  receipt: NotificationReceipt | null,
  availableActions: NotificationAvailableAction[],
  membershipRole?: MembershipRole,
): NotificationResponseDto {
  const templateParamsRaw = (row.templateParams ?? {}) as Record<string, string | number | boolean | null>;
  const templateParams = membershipRole
    ? redactTemplateParamsForRole(templateParamsRaw, membershipRole, row.domain)
    : templateParamsRaw;
  const actionTargetRaw = (row.actionTarget ?? {}) as unknown as NotificationActionTarget;
  const actionTarget = membershipRole
    ? (redactActionTargetForRole(
        actionTargetRaw as unknown as Record<string, unknown>,
        membershipRole,
        row.domain,
      ) as unknown as NotificationActionTarget)
    : actionTargetRaw;

  return {
    id: row.id,
    eventType: row.eventType,
    domain: row.domain,
    severity: row.severity,
    status: row.status,
    entity: {
      type: row.entityType,
      id: row.entityId,
      displayLabel: displayLabelFromParams(templateParams),
    },
    titleKey: row.titleKey,
    bodyKey: row.bodyKey,
    templateParams,
    action: {
      type: row.actionType,
      target: actionTarget,
    },
    source: {
      type: row.sourceType,
      ref: row.primarySourceRef,
    },
    firstSeenAt: row.firstSeenAt.toISOString(),
    lastSeenAt: row.lastSeenAt.toISOString(),
    occurrenceCount: row.occurrenceCount,
    resolvedAt: iso(row.resolvedAt),
    expiresAt: iso(row.expiresAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    userReceipt: {
      readAt: iso(receipt?.readAt ?? null),
      acknowledgedAt: iso(receipt?.acknowledgedAt ?? null),
      snoozedUntil: iso(receipt?.snoozedUntil ?? null),
      hiddenAt: iso(receipt?.hiddenAt ?? null),
    },
    availableActions,
  };
}
