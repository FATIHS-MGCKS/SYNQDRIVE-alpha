import type { OperatorTodaySnapshot } from '../lib/operatorData';
import type {
  OperatorTodayBucketSlice,
  OperatorTodayFeedBucket,
  OperatorTodayFeedState,
} from '../hooks/operatorTodayFeed.utils';
import { OPERATOR_TODAY_FEED_BUCKETS } from '../hooks/operatorTodayFeed.utils';

export const OPERATOR_TODAY_BUCKET_PREVIEW_LIMITS: Record<OperatorTodayFeedBucket, number> = {
  NOW: 5,
  TODAY: 5,
  UPCOMING: 4,
  PLANNED: 3,
  UNASSIGNED: 4,
};

export type OperatorTodaySectionVariant = 'critical' | 'default' | 'team';

export interface OperatorTodayBucketSectionMeta {
  bucket: OperatorTodayFeedBucket;
  title: string;
  subtitle: string;
  variant: OperatorTodaySectionVariant;
  collapsible: boolean;
  defaultCollapsed: boolean;
  hideWhenEmpty: boolean;
}

export const OPERATOR_TODAY_BUCKET_SECTIONS: OperatorTodayBucketSectionMeta[] = [
  {
    bucket: 'NOW',
    title: 'Jetzt erforderlich',
    subtitle: 'Überfällige, kritische und unmittelbar blockierende Aufgaben',
    variant: 'critical',
    collapsible: false,
    defaultCollapsed: false,
    hideWhenEmpty: true,
  },
  {
    bucket: 'TODAY',
    title: 'Heute',
    subtitle: 'Heute fällige und aktivierte Aufgaben',
    variant: 'default',
    collapsible: false,
    defaultCollapsed: false,
    hideWhenEmpty: true,
  },
  {
    bucket: 'UPCOMING',
    title: 'Demnächst',
    subtitle: 'Aktiviert sich im definierten kommenden Zeitfenster',
    variant: 'default',
    collapsible: false,
    defaultCollapsed: false,
    hideWhenEmpty: true,
  },
  {
    bucket: 'PLANNED',
    title: 'Geplant',
    subtitle: 'Zukünftige Erinnerungen und Aufgaben',
    variant: 'default',
    collapsible: true,
    defaultCollapsed: true,
    hideWhenEmpty: true,
  },
  {
    bucket: 'UNASSIGNED',
    title: 'Unzugewiesen',
    subtitle: 'Team-Queue — Aufgaben ohne Bearbeiter',
    variant: 'team',
    collapsible: false,
    defaultCollapsed: false,
    hideWhenEmpty: true,
  },
];

export function getOperatorTodayBucketSections(
  canViewUnassigned: boolean,
): OperatorTodayBucketSectionMeta[] {
  return OPERATOR_TODAY_BUCKET_SECTIONS.filter(
    (section) => section.bucket !== 'UNASSIGNED' || canViewUnassigned,
  );
}

export function bucketSliceHasContent(slice: OperatorTodayBucketSlice | undefined): boolean {
  if (!slice) return false;
  return slice.loading || Boolean(slice.error) || slice.count > 0 || slice.entries.length > 0;
}

export function countVisibleTaskFeedEntries(input: {
  taskFeed: OperatorTodayFeedState;
  canViewUnassigned: boolean;
  plannedExpanded: boolean;
}): number {
  let total = 0;
  for (const bucket of OPERATOR_TODAY_FEED_BUCKETS) {
    if (bucket === 'UNASSIGNED' && !input.canViewUnassigned) continue;
    if (bucket === 'PLANNED' && !input.plannedExpanded) continue;
    const slice = input.taskFeed.buckets[bucket];
    if (!slice) continue;
    total += slice.entries.length;
  }
  return total;
}

export function hasAnyTaskBucketContent(
  taskFeed: OperatorTodayFeedState,
  canViewUnassigned: boolean,
): boolean {
  return getOperatorTodayBucketSections(canViewUnassigned).some((section) =>
    bucketSliceHasContent(taskFeed.buckets[section.bucket]),
  );
}

export function hasOperatorTodaySecondaryContent(snapshot: OperatorTodaySnapshot): boolean {
  return (
    snapshot.dueNow.length > 0 ||
    snapshot.pickupsToday.length > 0 ||
    snapshot.returnsToday.length > 0 ||
    snapshot.blockedVehicles.length > 0 ||
    snapshot.vehicleCheckTasks.length > 0
  );
}

export function isOperatorTodayFullyEmpty(snapshot: OperatorTodaySnapshot): boolean {
  return (
    !hasAnyTaskBucketContent(snapshot.taskFeed, snapshot.taskFeed.canViewUnassigned) &&
    !hasOperatorTodaySecondaryContent(snapshot)
  );
}

export function shouldShowAllOpenTasksNav(
  totalOpenTasksCount: number,
  visibleFeedEntries: number,
): boolean {
  return totalOpenTasksCount > 0 && visibleFeedEntries < totalOpenTasksCount;
}

export function shouldShowOperatorTodayStaleBanner(input: {
  offline: boolean;
  isStale: boolean;
  hasRenderableContent: boolean;
}): boolean {
  return (input.offline || input.isStale) && input.hasRenderableContent;
}

export function operatorTodayInitialLoading(input: {
  orgLoading: boolean;
  bookingsLoading: boolean;
  tasksLoading: boolean;
  hasSnapshotContent: boolean;
}): boolean {
  return (
    (input.orgLoading || input.bookingsLoading || input.tasksLoading) && !input.hasSnapshotContent
  );
}

export function operatorTodayFatalError(input: {
  error: string | null;
  hasRenderableContent: boolean;
}): boolean {
  return Boolean(input.error) && !input.hasRenderableContent;
}
