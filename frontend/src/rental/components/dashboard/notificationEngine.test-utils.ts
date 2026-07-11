/**
 * Analysis helpers for notification-engine characterization tests.
 */
import { buildUnifiedActionQueue } from './actionQueueBuilder';
import {
  computeActionQueueTabCounts,
  dedupeActionQueueItems,
  prepareActionQueueRenderModel,
  visibleSemanticKeys,
} from './actionQueueGrouping';
import { buildDashboardNotificationsFromInsights } from './dashboardNotificationAdapter';
import type { BuildActionQueueInput } from './actionQueueBuilder';
import type { ActionQueueFilterTab, ActionQueueItem } from './dashboardTypes';
import type { DashboardInsight } from '../../DashboardInsightsContext';
import type { DashboardNotificationItem } from './dashboardNotificationTypes';
import {
  DRIVING_ASSESSMENT_SEMANTIC_KEY,
  NOTIFICATION_TEST_INSIGHTS_GENERATED_AT,
  NOTIFICATION_TEST_NOW_MS,
  WOB_VEHICLE_ID,
  type DrivingAssessmentPath,
} from './notificationEngine.fixtures';

export interface ActionQueueAnalysis {
  items: ActionQueueItem[];
  deduped: ActionQueueItem[];
  atomicCount: number;
  visibleKeys: string[];
  tabCounts: Record<ActionQueueFilterTab, number>;
  drivingAssessmentPaths: DrivingAssessmentPath[];
  drivingAssessmentDuplicateCount: number;
  itemsForVehicle: ActionQueueItem[];
}

export function buildQueueWithNotifications(
  input: BuildActionQueueInput,
  options?: { generatedAt?: string | null; intlLocale?: string },
): ActionQueueItem[] {
  const generatedAt = options?.generatedAt ?? NOTIFICATION_TEST_INSIGHTS_GENERATED_AT;
  const intlLocale = options?.intlLocale ?? (input.locale === 'de' ? 'de-DE' : 'en-US');
  const synth = buildDashboardNotificationsFromInsights(input.insights, {
    generatedAt,
    intlLocale,
  });
  return buildUnifiedActionQueue({
    ...input,
    notifications: input.notifications?.length ? input.notifications : synth,
  });
}

export function classifyDrivingAssessmentPath(item: ActionQueueItem): DrivingAssessmentPath | null {
  if (item.semanticKey === DRIVING_ASSESSMENT_SEMANTIC_KEY) return 'normalized-issue';
  if (item.id.startsWith('insight-') && item.title.includes('Fahrbewertung')) return 'legacy-insight';
  if (item.id.startsWith('notif-') && item.title.includes('Fahrbewertung')) return 'synthetic-notification';
  if (item.semanticKey?.includes('review_required') && item.title.includes('technische Beobachtung')) {
    return 'health-alert-complaints';
  }
  if (item.semanticKey?.includes('damage:suspicion') && item.title.includes('technische Beobachtung')) {
    return 'runtime-complaints';
  }
  if (item.title.includes('Fahrbewertung') && item.source === 'dashboard-insights') return 'legacy-insight';
  if (item.title.includes('Fahrbewertung') && item.semanticKey?.includes('driving_assessment')) {
    return 'normalized-issue';
  }
  if (item.title === 'Health prüfen' || item.title === 'Health pruefen') return 'generic-health-review';
  return null;
}

export function analyzeActionQueue(
  input: BuildActionQueueInput,
  options?: { generatedAt?: string | null; intlLocale?: string },
): ActionQueueAnalysis {
  const items = buildQueueWithNotifications(input, options);
  const deduped = dedupeActionQueueItems(items);
  const model = prepareActionQueueRenderModel({
    items,
    locale: input.locale,
    tab: 'all',
  });
  const tabCounts = computeActionQueueTabCounts(items, input.locale);

  const itemsForVehicle = items.filter((i) => i.vehicleId === WOB_VEHICLE_ID);
  const paths = new Set<DrivingAssessmentPath>();
  for (const item of items) {
    const path = classifyDrivingAssessmentPath(item);
    if (path) paths.add(path);
  }

  const drivingTitles = items.filter((i) => i.title.includes('Fahrbewertung'));
  const drivingAssessmentDuplicateCount = drivingTitles.length;

  return {
    items,
    deduped,
    atomicCount: model.atomicCount,
    visibleKeys: visibleSemanticKeys(model.pinnedItems, model.filteredEntries),
    tabCounts,
    drivingAssessmentPaths: [...paths],
    drivingAssessmentDuplicateCount,
    itemsForVehicle,
  };
}

export function countItemsMatching(
  items: ActionQueueItem[],
  predicate: (item: ActionQueueItem) => boolean,
): number {
  return items.filter(predicate).length;
}

export function findItemsByTitleFragment(items: ActionQueueItem[], fragment: string): ActionQueueItem[] {
  return items.filter((i) => i.title.includes(fragment));
}

/** Items whose timeSortMs equals render-time now (within 1s slack) — indicates render-based timestamps. */
export function itemsWithRenderBasedTimeSort(items: ActionQueueItem[], renderNowMs: number): ActionQueueItem[] {
  return items.filter((i) => Math.abs(i.timeSortMs - renderNowMs) < 1000);
}

export function syntheticNotificationFromInsight(
  insight: DashboardInsight,
  intlLocale = 'de-DE',
): DashboardNotificationItem {
  const [first] = buildDashboardNotificationsFromInsights([insight], {
    generatedAt: NOTIFICATION_TEST_INSIGHTS_GENERATED_AT,
    intlLocale,
  });
  return first!;
}

export { NOTIFICATION_TEST_NOW_MS };
