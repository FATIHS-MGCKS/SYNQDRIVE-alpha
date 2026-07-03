import {
  HM_OEM_SERVICE_TRACKING_MISSING_ORG_KEY,
  collectHmOemServiceTrackingVehicleIds,
  formatHmOemServiceTrackingGroupedTitle,
  hmOemServiceTrackingDataNoteSubtitle,
  isHmOemServiceTrackingMissingIssue,
  isHmOemServiceTrackingMissingText,
  isOverdueIssueText,
  type OperationalIssue,
} from '../../lib/operational-issues';
import type { ActionQueueItem } from './dashboardTypes';

export function isGroupedHmOemServiceTrackingDataNote(
  item: Pick<ActionQueueItem, 'semanticKey'>,
): boolean {
  return item.semanticKey === HM_OEM_SERVICE_TRACKING_MISSING_ORG_KEY;
}

export function isIndividualHmOemServiceTrackingQueueItem(
  item: Pick<ActionQueueItem, 'semanticKey' | 'title' | 'reason'>,
): boolean {
  if (isGroupedHmOemServiceTrackingDataNote(item)) return false;
  if (item.semanticKey?.includes('hm_oem_service_tracking_missing')) return true;
  if (item.semanticKey?.includes('service_tracking_missing')) return true;
  const text = `${item.title ?? ''} ${item.reason ?? ''}`;
  return isHmOemServiceTrackingMissingText(text) && !isOverdueIssueText(text);
}

export function serviceOverdueVehicleIds(
  issues: Array<Pick<OperationalIssue, 'issueType' | 'vehicleId'>>,
): Set<string> {
  const ids = new Set<string>();
  for (const issue of issues) {
    if (issue.issueType !== 'service_overdue' || !issue.vehicleId) continue;
    ids.add(issue.vehicleId);
  }
  return ids;
}

export function buildHmOemServiceTrackingGroupedDataNote(
  hmOemIssues: OperationalIssue[],
  allIssues: OperationalIssue[],
  locale: string,
): ActionQueueItem | null {
  const overdueVehicleIds = serviceOverdueVehicleIds(allIssues);
  const vehicleIds = collectHmOemServiceTrackingVehicleIds(hmOemIssues, overdueVehicleIds);
  if (vehicleIds.length === 0) return null;

  const de = locale === 'de';
  return {
    id: 'data-note-hm-oem-service-tracking',
    semanticKey: HM_OEM_SERVICE_TRACKING_MISSING_ORG_KEY,
    source: 'derived-operations',
    severity: 'info',
    category: 'notification',
    title: formatHmOemServiceTrackingGroupedTitle(vehicleIds.length, locale),
    reason: hmOemServiceTrackingDataNoteSubtitle(locale),
    timeSortMs: Date.now(),
    priority: -250,
    tone: 'neutral',
    cta: 'open-rental',
    isOverdue: false,
    groupKey: 'data-availability:hm-oem-service-tracking',
    groupType: 'notification-thread',
    detail: de
      ? `${vehicleIds.length} Fahrzeug${vehicleIds.length === 1 ? '' : 'e'} ohne HM/OEM Next-Service-Daten`
      : `${vehicleIds.length} vehicle${vehicleIds.length === 1 ? '' : 's'} without HM/OEM next-service data`,
  };
}

export function partitionHmOemServiceTrackingIssues(
  issues: OperationalIssue[],
): {
  attentionIssues: OperationalIssue[];
  hmOemTrackingIssues: OperationalIssue[];
} {
  const hmOemTrackingIssues = issues.filter(isHmOemServiceTrackingMissingIssue);
  const attentionIssues = issues.filter((issue) => !isHmOemServiceTrackingMissingIssue(issue));
  return { attentionIssues, hmOemTrackingIssues };
}
