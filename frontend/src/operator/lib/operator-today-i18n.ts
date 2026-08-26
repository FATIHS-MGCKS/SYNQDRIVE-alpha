/**
 * Operator Today tab chrome presentation adapter (P2.2.45).
 * Bucket labels, page chrome, and feed section copy — no task/bucket business semantics.
 */
import {
  DEFAULT_PRODUCT_LOCALE,
  isSupportedLocale,
  type SupportedLocale,
} from '../../i18n/locales';
import { translateKey } from '../../i18n/LanguageContext';
import type { TranslationKey } from '../../i18n/translations/en';
import type { OperatorTodayFeedBucket } from '../hooks/operatorTodayFeed.utils';

export type OperatorTodayAlertSeverity = 'CRITICAL' | 'WARNING' | 'INFO';

const BUCKET_TITLE_KEYS: Record<OperatorTodayFeedBucket, TranslationKey> = {
  NOW: 'operator.today.bucket.now.title',
  TODAY: 'common.today',
  UPCOMING: 'operator.today.bucket.upcoming.title',
  PLANNED: 'operator.today.bucket.planned.title',
  UNASSIGNED: 'operator.today.bucket.unassigned.title',
};

const BUCKET_SUBTITLE_KEYS: Record<OperatorTodayFeedBucket, TranslationKey> = {
  NOW: 'operator.today.bucket.now.subtitle',
  TODAY: 'operator.today.bucket.today.subtitle',
  UPCOMING: 'operator.today.bucket.upcoming.subtitle',
  PLANNED: 'operator.today.bucket.planned.subtitle',
  UNASSIGNED: 'operator.today.bucket.unassigned.subtitle',
};

export function resolveOperatorTodayLocale(
  locale: string | null | undefined,
): SupportedLocale {
  return isSupportedLocale(locale) ? locale : DEFAULT_PRODUCT_LOCALE;
}

export function otd(
  locale: string,
  key: TranslationKey,
  vars?: Record<string, string | number>,
): string {
  return translateKey(resolveOperatorTodayLocale(locale), key, vars).text;
}

export function operatorTodayBucketTitle(
  locale: string,
  bucket: OperatorTodayFeedBucket,
): string {
  return otd(locale, BUCKET_TITLE_KEYS[bucket]);
}

export function operatorTodayBucketSubtitle(
  locale: string,
  bucket: OperatorTodayFeedBucket,
): string {
  return otd(locale, BUCKET_SUBTITLE_KEYS[bucket]);
}

export function operatorTodayStaleOfflineTitle(locale: string): string {
  return otd(locale, 'operator.today.stale.offlineTitle');
}

export function operatorTodayStaleStaleTitle(locale: string): string {
  return otd(locale, 'operator.today.stale.staleTitle');
}

export function operatorTodayStaleOfflineBody(locale: string): string {
  return otd(locale, 'operator.today.stale.offlineBody');
}

export function operatorTodayStaleStaleBody(locale: string): string {
  return otd(locale, 'operator.today.stale.staleBody');
}

export function operatorTodayStaleRefreshLabel(locale: string): string {
  return otd(locale, 'operator.today.stale.refresh');
}

export function operatorTodayNoOrgTitle(locale: string): string {
  return otd(locale, 'operator.today.noOrg.title');
}

export function operatorTodayNoOrgDescription(locale: string): string {
  return otd(locale, 'operator.today.noOrg.description');
}

export function operatorTodayCreateBookingLabel(locale: string): string {
  return otd(locale, 'operator.today.createBooking');
}

export function operatorTodayFatalErrorTitle(locale: string): string {
  return otd(locale, 'operator.today.error.fatalTitle');
}

export function operatorTodayBookingsErrorTitle(locale: string): string {
  return otd(locale, 'operator.today.error.bookingsTitle');
}

export function operatorTodayEmptyTitle(locale: string): string {
  return otd(locale, 'operator.today.empty.title');
}

export function operatorTodayEmptyDescription(locale: string): string {
  return otd(locale, 'operator.today.empty.description');
}

export function operatorTodayEmptyAllOpenTasksLabel(
  locale: string,
  count: number,
): string {
  return otd(locale, 'operator.today.empty.allOpenTasks', { count });
}

export function operatorTodayHeaderTitle(locale: string): string {
  return otd(locale, 'operator.today.header.title');
}

export function operatorTodayHeaderSubtitle(locale: string): string {
  return otd(locale, 'operator.today.header.subtitle');
}

export function operatorTodayNavAllOpenWithCount(locale: string, count: number): string {
  return otd(locale, 'operator.today.nav.allOpenWithCount', { count });
}

export function operatorTodayNavAllTasksLabel(locale: string): string {
  return otd(locale, 'operator.today.nav.allTasks');
}

export function operatorTodayAlertsSectionTitle(locale: string): string {
  return otd(locale, 'operator.today.alerts.sectionTitle');
}

export function operatorTodayAlertSeverityLabel(
  locale: string,
  severity: OperatorTodayAlertSeverity,
): string {
  return severity === 'CRITICAL'
    ? otd(locale, 'operator.today.alert.severity.critical')
    : otd(locale, 'operator.today.alert.severity.warning');
}

export function operatorTodayBlockedSectionTitle(locale: string): string {
  return otd(locale, 'operator.today.blocked.sectionTitle');
}

export function operatorTodayBlockedBadgeLabel(locale: string): string {
  return otd(locale, 'operator.today.blocked.badge');
}

export function operatorTodayHandoverNowLabel(locale: string): string {
  return otd(locale, 'operator.today.handover.now');
}

export function operatorTodayHandoverTodayLabel(locale: string): string {
  return otd(locale, 'operator.today.handover.today');
}

export function operatorTodayTabletPlaceholder(locale: string): string {
  return otd(locale, 'operator.today.tablet.placeholder');
}

export function operatorTodayFeedBucketUnavailableTitle(
  locale: string,
  bucket: OperatorTodayFeedBucket,
): string {
  return otd(locale, 'operator.today.feed.bucketUnavailable', {
    bucketTitle: operatorTodayBucketTitle(locale, bucket),
  });
}

export function operatorTodayFeedRetryLabel(locale: string): string {
  return otd(locale, 'common.retry');
}
