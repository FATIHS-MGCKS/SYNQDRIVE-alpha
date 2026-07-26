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
import type { BuildActionQueueInput } from './actionQueueBuilder';
import type { ActionQueueFilterTab, ActionQueueItem } from './dashboardTypes';
import {
  DRIVING_ASSESSMENT_SEMANTIC_KEY,
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
): ActionQueueItem[] {
  return buildUnifiedActionQueue({
    ...input,
    referenceNowMs: input.referenceNowMs ?? NOTIFICATION_TEST_NOW_MS,
  });
}

export function classifyDrivingAssessmentPath(item: ActionQueueItem): DrivingAssessmentPath | null {
  if (item.semanticKey === DRIVING_ASSESSMENT_SEMANTIC_KEY) return 'normalized-issue';
  if (item.id.startsWith('insight-') && item.title.includes('Fahrbewertung')) return 'legacy-insight';
  if (item.semanticKey?.includes('technical_observation_active') && /technische Beobachtung/i.test(item.title)) {
    return 'health-alert-complaints';
  }
  if (item.semanticKey?.includes('damage:suspicion') && /technische Beobachtung/i.test(item.title)) {
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
): ActionQueueAnalysis {
  const items = buildQueueWithNotifications(input);
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

export { NOTIFICATION_TEST_NOW_MS };
