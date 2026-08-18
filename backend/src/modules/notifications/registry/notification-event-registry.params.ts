import type { NotificationEventTypeDefinition } from './notification-event-registry.types';

/** Optional params allowed when a required param implies additional context. */
const OPTIONAL_BY_REQUIRED: Readonly<Record<string, readonly string[]>> = {
  label: ['plate', 'reason', 'code'],
  stationName: ['stationId', 'bookedOut'],
  bookingRef: ['label'],
  documentType: ['categoryTitle', 'versionLabel', 'expectedLanguage', 'expectedJurisdiction'],
  categoryTitle: ['documentType', 'versionLabel'],
  invoiceRef: ['label'],
  integrationName: [],
  webhookName: [],
};

const DOMAIN_OPTIONAL: Readonly<Record<string, readonly string[]>> = {
  LOW_UTILIZATION: ['idleDays', 'lostRevenueEur', 'plate'],
  STATION_SHORTAGE: ['stationId', 'bookedOut'],
  COMPLIANCE_EXPIRED: ['complianceType'],
  TUV_OVERDUE: ['complianceType'],
  BOKRAFT_OVERDUE: ['complianceType'],
  ACTIVE_DTC: ['code', 'reason'],
  TIRE_CRITICAL: ['reason'],
  BRAKE_CRITICAL: ['reason'],
  BATTERY_CRITICAL: ['reason'],
  DEVICE_RECONNECTED: ['recoveryMethod'],
};

export function inferAllowedTemplateParams(
  def: Pick<NotificationEventTypeDefinition, 'eventType' | 'requiredTemplateParams'>,
): readonly string[] {
  const allowed = new Set<string>(def.requiredTemplateParams);

  for (const required of def.requiredTemplateParams) {
    for (const optional of OPTIONAL_BY_REQUIRED[required] ?? []) {
      allowed.add(optional);
    }
  }

  for (const optional of DOMAIN_OPTIONAL[def.eventType] ?? []) {
    allowed.add(optional);
  }

  return Object.freeze([...allowed]);
}

export function enrichEventTypeDefinition(
  def: NotificationEventTypeDefinition,
): NotificationEventTypeDefinition {
  return {
    ...def,
    allowedTemplateParams: def.allowedTemplateParams ?? inferAllowedTemplateParams(def),
  };
}
