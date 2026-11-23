import type { TranslationKey } from '../../i18n/translations/en';
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

interface OperatorTodayBucketSectionDef {
  bucket: OperatorTodayFeedBucket;
  titleKey: TranslationKey;
  subtitleKey: TranslationKey;
  variant: OperatorTodaySectionVariant;
  collapsible: boolean;
  defaultCollapsed: boolean;
  hideWhenEmpty: boolean;
}

const OPERATOR_TODAY_BUCKET_SECTION_DEFS: OperatorTodayBucketSectionDef[] = [
  {
    bucket: 'NOW',
    titleKey: 'operator.today.bucket.now.title',
    subtitleKey: 'operator.today.bucket.now.subtitle',
    variant: 'critical',
    collapsible: false,
    defaultCollapsed: false,
    hideWhenEmpty: true,
  },
  {
    bucket: 'TODAY',
    titleKey: 'operator.today.bucket.today.title',
    subtitleKey: 'operator.today.bucket.today.subtitle',
    variant: 'default',
    collapsible: false,
    defaultCollapsed: false,
    hideWhenEmpty: true,
  },
  {
    bucket: 'UPCOMING',
    titleKey: 'operator.today.bucket.upcoming.title',
    subtitleKey: 'operator.today.bucket.upcoming.subtitle',
    variant: 'default',
    collapsible: false,
    defaultCollapsed: false,
    hideWhenEmpty: true,
  },
  {
    bucket: 'PLANNED',
    titleKey: 'operator.today.bucket.planned.title',
    subtitleKey: 'operator.today.bucket.planned.subtitle',
    variant: 'default',
    collapsible: true,
    defaultCollapsed: true,
    hideWhenEmpty: true,
  },
  {
    bucket: 'UNASSIGNED',
    titleKey: 'operator.today.bucket.unassigned.title',
    subtitleKey: 'operator.today.bucket.unassigned.subtitle',
    variant: 'team',
    collapsible: false,
    defaultCollapsed: false,
    hideWhenEmpty: true,
  },
];

export function getOperatorTodayBucketSections(
  canViewUnassigned: boolean,
  t?: (key: TranslationKey) => string,
): OperatorTodayBucketSectionMeta[] {
  return OPERATOR_TODAY_BUCKET_SECTION_DEFS.filter(
    (section) => section.bucket !== 'UNASSIGNED' || canViewUnassigned,
  ).map((section) => ({
    bucket: section.bucket,
    title: t ? t(section.titleKey) : section.titleKey,
    subtitle: t ? t(section.subtitleKey) : section.subtitleKey,
    variant: section.variant,
    collapsible: section.collapsible,
    defaultCollapsed: section.defaultCollapsed,
    hideWhenEmpty: section.hideWhenEmpty,
  }));
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
    snapshot.blockedVehicles.length > 0
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
