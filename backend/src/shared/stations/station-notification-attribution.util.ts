import {
  NotificationDomain,
  NotificationEntityType,
  NotificationSeverity,
  NotificationStatus,
  Prisma,
} from '@prisma/client';

export const STATION_ACTIVE_NOTIFICATION_STATUSES: NotificationStatus[] = [
  NotificationStatus.OPEN,
  NotificationStatus.ACKNOWLEDGED,
  NotificationStatus.SNOOZED,
];

/** Event types that remain visible regardless of station scope — excluded from station summaries. */
const ORG_WIDE_EVENT_TYPES = new Set(['INTEGRATION_DISCONNECTED', 'WEBHOOK_FAILURE']);

export interface StationNotificationAttributionRow {
  id: string;
  eventType: string;
  domain: string;
  severity: NotificationSeverity;
  entityType: string;
  entityId: string;
  actionTarget: unknown;
}

export function isOrgWideNotificationForStationSummary(
  row: Pick<StationNotificationAttributionRow, 'eventType' | 'domain' | 'severity' | 'entityType'>,
): boolean {
  if (ORG_WIDE_EVENT_TYPES.has(row.eventType)) {
    return true;
  }
  if (row.entityType === NotificationEntityType.ORGANIZATION) {
    return true;
  }
  if (row.domain === NotificationDomain.SECURITY && row.severity === NotificationSeverity.CRITICAL) {
    return true;
  }
  return false;
}

export function buildOrgWideExclusionClause(): Prisma.NotificationWhereInput {
  return {
    OR: [
      { eventType: { in: [...ORG_WIDE_EVENT_TYPES] } },
      { entityType: NotificationEntityType.ORGANIZATION },
      {
        AND: [
          { domain: NotificationDomain.SECURITY },
          { severity: NotificationSeverity.CRITICAL },
        ],
      },
    ],
  };
}

export function buildStationAttributableNotificationsWhere(
  organizationId: string,
  stationId: string,
  onSiteVehicleIds: string[],
  stationBookingIds: string[],
  activeTransferIds: string[],
): Prisma.NotificationWhereInput {
  const attributableOr: Prisma.NotificationWhereInput[] = [
    { entityType: NotificationEntityType.STATION, entityId: stationId },
    { actionTarget: { path: ['stationId'], equals: stationId } },
  ];

  if (onSiteVehicleIds.length > 0) {
    attributableOr.push({
      entityType: NotificationEntityType.VEHICLE,
      entityId: { in: onSiteVehicleIds },
    });
    for (const vehicleId of onSiteVehicleIds) {
      attributableOr.push({
        actionTarget: { path: ['vehicleId'], equals: vehicleId },
      });
    }
  }

  if (stationBookingIds.length > 0) {
    attributableOr.push({
      entityType: NotificationEntityType.BOOKING,
      entityId: { in: stationBookingIds },
    });
    for (const bookingId of stationBookingIds) {
      attributableOr.push({
        actionTarget: { path: ['bookingId'], equals: bookingId },
      });
    }
  }

  for (const transferId of activeTransferIds) {
    attributableOr.push({
      actionTarget: { path: ['transferId'], equals: transferId },
    });
  }

  return {
    organizationId,
    status: { in: STATION_ACTIVE_NOTIFICATION_STATUSES },
    AND: [
      { OR: attributableOr },
      { NOT: buildOrgWideExclusionClause() },
    ],
  };
}

export function isStationAttributableNotification(
  row: StationNotificationAttributionRow,
  stationId: string,
  onSiteVehicleIds: ReadonlySet<string>,
  stationBookingIds: ReadonlySet<string>,
  activeTransferIds: ReadonlySet<string>,
): boolean {
  if (isOrgWideNotificationForStationSummary(row)) {
    return false;
  }

  const target = (row.actionTarget ?? {}) as Record<string, string | undefined>;
  const targetStationId =
    row.entityType === NotificationEntityType.STATION ? row.entityId : target.stationId;
  if (targetStationId === stationId) {
    return true;
  }

  const transferId = target.transferId;
  if (transferId && activeTransferIds.has(transferId)) {
    return true;
  }

  const vehicleId =
    row.entityType === NotificationEntityType.VEHICLE ? row.entityId : target.vehicleId;
  if (vehicleId && onSiteVehicleIds.has(vehicleId)) {
    return true;
  }

  const bookingId =
    row.entityType === NotificationEntityType.BOOKING ? row.entityId : target.bookingId;
  if (bookingId && stationBookingIds.has(bookingId)) {
    return true;
  }

  return false;
}
