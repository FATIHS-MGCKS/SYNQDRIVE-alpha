import type { TranslationKey } from '../../../i18n/translations/en';
import type { ActionQueueItem } from '../dashboardTypes';
import { createNotificationTranslator } from '../notificationQueueEnricher';

const ISSUE_HEADLINE_KEYS: Record<string, TranslationKey> = {
  ACTIVE_DTC: 'notification.issue.activeDtc',
  BATTERY_CRITICAL: 'notification.issue.batteryCritical',
  TIRE_CRITICAL: 'notification.issue.tireCritical',
  BRAKE_CRITICAL: 'notification.issue.brakeCritical',
  SERVICE_OVERDUE: 'notification.issue.serviceOverdue',
  LOW_UTILIZATION: 'notification.issue.lowUtilization',
  STATION_SHORTAGE: 'notification.issue.stationShortage',
  DRIVING_ASSESSMENT_DEVICE_QUALITY: 'notification.issue.drivingAssessment',
  TECHNICAL_OBSERVATION_ACTIVE: 'notification.issue.technicalObservation',
  HM_SERVICE_NO_TRACKING: 'notification.issue.hmServiceNoTracking',
};

function entityLabel(item: ActionQueueItem): string | undefined {
  const params = item.entityContextParams;
  const candidates = [params?.plate, item.entityLabel, params?.entityLine];
  for (const value of candidates) {
    if (!value?.trim()) continue;
    return value.trim();
  }
  return undefined;
}

/** Remove trailing " — Kennzeichen/Station" from interpolated notification titles. */
export function stripEntityLabelFromTitle(title: string, label?: string): string {
  const trimmed = title.trim();
  if (!label?.trim()) return trimmed;

  const suffixes = [` — ${label}`, ` - ${label}`, ` – ${label}`];
  for (const suffix of suffixes) {
    if (trimmed.endsWith(suffix)) {
      return trimmed.slice(0, -suffix.length).trim();
    }
  }
  return trimmed;
}

function templateParamRecord(item: ActionQueueItem): Record<string, string | number> {
  const params = item.entityContextParams ?? {};
  const out: Record<string, string | number> = {};
  if (params.code) out.code = params.code;
  if (params.reason) out.reason = params.reason;
  if (params.idleDays != null) out.idleDays = params.idleDays;
  if (params.lostRevenueEur != null) out.lostRevenueEur = params.lostRevenueEur;
  if (params.available != null) out.available = params.available;
  if (params.totalVehicles != null) out.totalVehicles = params.totalVehicles;
  if (params.bookedOut != null) out.bookedOut = params.bookedOut;
  return out;
}

function issueHeadline(item: ActionQueueItem, locale: string): string {
  const eventType = (item.issueType ?? item.queue?.conditionCode ?? '').toUpperCase();
  const t = createNotificationTranslator(locale);
  const params = templateParamRecord(item);
  const label = entityLabel(item);

  if (eventType === 'STATION_SHORTAGE' && params.available === 0) {
    return t('notification.issue.stationShortageCritical');
  }

  const issueKey = ISSUE_HEADLINE_KEYS[eventType];
  if (issueKey) {
    const localized = t(issueKey, params);
    if (localized !== issueKey) return localized;
  }

  const stripped = stripEntityLabelFromTitle(item.title, label);
  if (stripped && stripped !== label) return stripped;
  if (eventType === 'ACTIVE_DTC' && params.code) {
    return locale === 'de' ? `Fehlercode ${params.code}` : `Fault code ${params.code}`;
  }
  return stripped || item.title;
}

function issueDetail(item: ActionQueueItem, locale: string): string {
  const params = item.entityContextParams;
  const reason = item.reason?.trim() || params?.reason?.trim() || '';
  if (reason) return reason;

  const eventType = (item.issueType ?? '').toUpperCase();
  if (eventType === 'ACTIVE_DTC' && params?.code) {
    return locale === 'de'
      ? `Aktive Fehlermeldung (${params.code})`
      : `Active fault (${params.code})`;
  }

  return '';
}

export interface NotificationIssueCopy {
  headline: string;
  detail: string;
}

export function resolveNotificationIssueCopy(
  item: ActionQueueItem,
  locale: string,
): NotificationIssueCopy {
  return {
    headline: issueHeadline(item, locale),
    detail: issueDetail(item, locale),
  };
}
