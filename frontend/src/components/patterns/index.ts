/* ════════════════════════════════════════════════════════════════════
   SynqDrive pattern library — the shared, token-based, icon-agnostic
   building blocks for every page. Import from here instead of
   hand-rolling cards / chips / tables / headers per view.

     import { PageHeader, MetricCard, StatusChip, DataTable } from '@/components/patterns';
   ════════════════════════════════════════════════════════════════════ */

export { StatusChip, StatusDot, HealthStatusChip, PriorityBadge } from './status';
export type {
  StatusChipProps,
  StatusDotProps,
  HealthStatusChipProps,
  PriorityBadgeProps,
} from './status';

export {
  chipClassForTone,
  dotClassForTone,
  healthTone,
  normalizeHealthState,
  normalizePriority,
  toneForStatus,
} from './status-utils';
export type { StatusTone, HealthState, TaskPriority } from './status-utils';

export { PageHeader, SectionHeader } from './page-header';
export type { PageHeaderProps, SectionHeaderProps } from './page-header';

export { DataCard, MetricCard } from './data-card';
export type { DataCardProps, MetricCardProps, MetricTrend } from './data-card';

export { EmptyState, ErrorState, SkeletonRows, SkeletonMetricGrid, SkeletonCard } from './states';
export type { EmptyStateProps, ErrorStateProps, SkeletonRowsProps, SkeletonGridProps } from './states';

export { DataTable } from './data-table';
export type { DataTableProps, DataTableColumn } from './data-table';

export { DetailDrawer } from './detail-drawer';
export type { DetailDrawerProps } from './detail-drawer';

export { Timeline } from './timeline';
export type { TimelineProps, TimelineItem } from './timeline';

export { VehicleMiniCard } from './vehicle-mini-card';
export type { VehicleMiniCardProps } from './vehicle-mini-card';
