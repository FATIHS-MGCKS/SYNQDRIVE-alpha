import type {
  ActionQueueChildAction,
  ActionQueueChildSeverity,
  ActionQueueGroupItem,
  ActionQueueItem,
  ActionQueueLeafItem,
  ActionQueueSeverity,
} from '../../components/dashboard/dashboardTypes';
import { toChildSeverity } from '../../components/dashboard/actionQueueGrouping';

export const FLEET_READINESS_AGGREGATE_EVENT_TYPES = new Set([
  'VEHICLE_NOT_READY',
  'VEHICLE_READINESS_UNEVALUABLE',
]);

export interface FleetReadinessVehicleGroup {
  vehicleId: string;
  label: string;
  /**
   * Header aggregate for the vehicle card.
   * When both aggregates coexist, UNEVALUABLE reflects current evaluability (P2.4);
   * preserved NOT_READY is represented separately.
   */
  primaryAggregate?: ActionQueueItem;
  /** Preserved NOT_READY when coexisting with UNEVALUABLE (P2.4 fail-safe). */
  preservedNotReadyAggregate?: ActionQueueItem;
  causes: ActionQueueItem[];
  severity: ActionQueueSeverity;
}

function resolveVehicleId(item: ActionQueueItem): string | null {
  if (item.vehicleId) return item.vehicleId;
  if (item.queue?.entityType === 'vehicle' && item.queue.entityId) return item.queue.entityId;
  return null;
}

function resolveVehicleLabel(item: ActionQueueItem, vehicleId: string): string {
  return item.entityContextParams?.plate ?? item.title?.split(' — ')[0]?.trim() ?? vehicleId;
}

function severityRank(severity: ActionQueueSeverity): number {
  if (severity === 'critical') return 4;
  if (severity === 'warning') return 3;
  if (severity === 'attention') return 2;
  return 1;
}

function highestSeverity(items: ActionQueueItem[]): ActionQueueSeverity {
  return items.reduce<ActionQueueSeverity>(
    (worst, item) => (severityRank(item.severity) > severityRank(worst) ? item.severity : worst),
    'info',
  );
}

function childFromItem(item: ActionQueueItem): ActionQueueChildAction {
  return {
    id: item.id,
    itemId: item.id,
    title: item.title,
    detail: item.detail,
    severity: toChildSeverity(item),
    category: item.category,
    module: item.module,
    cta: item.cta,
    ctaLabel: item.ctaLabel,
    vehicleId: item.vehicleId,
    bookingId: item.bookingId,
    timeLabel: item.timeLabel,
    timeSortMs: item.timeSortMs,
    priority: item.priority,
    isOverdue: item.isOverdue,
  };
}

function resolveAggregates(vehicleItems: ActionQueueItem[]) {
  const aggregateItems = vehicleItems.filter((item) =>
    FLEET_READINESS_AGGREGATE_EVENT_TYPES.has(item.issueType ?? ''),
  );
  const notReady = aggregateItems.find((item) => item.issueType === 'VEHICLE_NOT_READY');
  const unevaluable = aggregateItems.find((item) => item.issueType === 'VEHICLE_READINESS_UNEVALUABLE');
  const primaryAggregate = unevaluable ?? notReady;
  const preservedNotReadyAggregate = notReady && unevaluable ? notReady : undefined;
  return { notReady, unevaluable, primaryAggregate, preservedNotReadyAggregate };
}

/**
 * Aggregate rows rendered under the same vehicle card (presentation only).
 * - Coexisting aggregates: preserved NOT_READY is always a child row.
 * - When both aggregates exist without concrete causes, UNEVALUABLE is also a child
 *   so both canonical notifications remain reachable for CTA/detail expansion.
 * - When both aggregates exist with causes, UNEVALUABLE remains header context only.
 */
function buildPresentationAggregateRows(group: FleetReadinessVehicleGroup): ActionQueueItem[] {
  const rows: ActionQueueItem[] = [];
  if (group.preservedNotReadyAggregate) {
    rows.push(group.preservedNotReadyAggregate);
  }
  if (
    group.preservedNotReadyAggregate
    && group.primaryAggregate?.issueType === 'VEHICLE_READINESS_UNEVALUABLE'
    && group.causes.length === 0
  ) {
    rows.push(group.primaryAggregate);
  }
  return rows;
}

export function resolveFleetReadinessGroupPriority(
  group: FleetReadinessVehicleGroup,
  childActions: ActionQueueChildAction[],
): number {
  if (group.primaryAggregate?.priority != null) {
    return group.primaryAggregate.priority;
  }
  const hasCriticalChild = childActions.some((child) => child.severity === 'critical');
  const hasCriticalCause = group.causes.some((cause) => cause.severity === 'critical');
  return hasCriticalChild || hasCriticalCause ? 100 : 50;
}

/**
 * Presentation-only projection: groups FLEET_READINESS vehicle notifications by vehicle,
 * separating aggregate readiness state from specific causes.
 *
 * Lifecycle-action note: grouped cards expose CTA/task actions on child rows via
 * NotificationGroupCard + itemsById. Header-only aggregates (single aggregate + causes)
 * remain title context only — same pattern as the legacy NotificationPanel grouping.
 * Coexisting aggregates render as child rows so both canonical notifications stay reachable.
 */
export function projectFleetReadinessVehicleGroups(
  items: ActionQueueItem[],
): FleetReadinessVehicleGroup[] {
  const byVehicle = new Map<string, ActionQueueItem[]>();

  for (const item of items) {
    const vehicleId = resolveVehicleId(item);
    if (!vehicleId) continue;
    const bucket = byVehicle.get(vehicleId) ?? [];
    bucket.push(item);
    byVehicle.set(vehicleId, bucket);
  }

  const groups: FleetReadinessVehicleGroup[] = [];

  for (const [vehicleId, vehicleItems] of byVehicle) {
    const causes = vehicleItems.filter(
      (item) => !FLEET_READINESS_AGGREGATE_EVENT_TYPES.has(item.issueType ?? ''),
    );
    const { primaryAggregate, preservedNotReadyAggregate } = resolveAggregates(vehicleItems);

    const labelSource = primaryAggregate ?? causes[0] ?? vehicleItems[0];
    if (!labelSource) continue;

    groups.push({
      vehicleId,
      label: resolveVehicleLabel(labelSource, vehicleId),
      primaryAggregate,
      preservedNotReadyAggregate,
      causes,
      severity: highestSeverity(causes.length > 0 ? causes : vehicleItems),
    });
  }

  return groups.sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
}

export function fleetReadinessGroupToActionQueueGroup(
  group: FleetReadinessVehicleGroup,
): ActionQueueGroupItem | ActionQueueLeafItem {
  const aggregateRows = buildPresentationAggregateRows(group);
  const causeChildren = group.causes.map(childFromItem);
  const children = [...aggregateRows.map(childFromItem), ...causeChildren];

  if (children.length === 0 && group.primaryAggregate) {
    return { ...group.primaryAggregate, kind: 'leaf' };
  }

  const childSeverity = children.reduce<ActionQueueChildSeverity>(
    (worst, child) =>
      severityRank(child.severity as ActionQueueSeverity) > severityRank(worst as ActionQueueSeverity)
        ? child.severity
        : worst,
    'info',
  );

  return {
    kind: 'group',
    id: `fleet-readiness:${group.vehicleId}`,
    groupKey: `vehicle:${group.vehicleId}`,
    groupType: 'vehicle-health',
    title: group.primaryAggregate?.title ?? group.label,
    subtitle: causeChildren.length > 0 ? String(causeChildren.length) : '',
    severity: childSeverity,
    category: group.primaryAggregate?.category ?? 'health',
    vehicleId: group.vehicleId,
    entityLabel: group.label,
    children,
    priority: resolveFleetReadinessGroupPriority(group, children),
  };
}

export function projectFleetReadinessPresentationItems(
  items: ActionQueueItem[],
): Array<ActionQueueGroupItem | ActionQueueLeafItem> {
  const groups = projectFleetReadinessVehicleGroups(items);
  const nonVehicle = items.filter((item) => !resolveVehicleId(item)).map(
    (item) => ({ ...item, kind: 'leaf' as const }),
  );
  const projected = groups.map((group) => fleetReadinessGroupToActionQueueGroup(group));
  return [...projected, ...nonVehicle];
}

/**
 * Returns notification ids explicitly represented in the Fleet Readiness presentation model.
 * Header-only aggregates (single aggregate + concrete causes) count as represented via title context.
 */
export function collectFleetReadinessRepresentedNotificationIds(
  items: ActionQueueItem[],
): Set<string> {
  const represented = new Set<string>();

  for (const item of items.filter((row) => !resolveVehicleId(row))) {
    represented.add(item.id);
  }

  for (const group of projectFleetReadinessVehicleGroups(items)) {
    const projected = fleetReadinessGroupToActionQueueGroup(group);
    if (projected.kind === 'leaf') {
      represented.add(projected.id);
      continue;
    }

    for (const child of projected.children) {
      represented.add(child.itemId);
    }

    if (
      group.primaryAggregate
      && group.causes.length > 0
      && !group.preservedNotReadyAggregate
    ) {
      represented.add(group.primaryAggregate.id);
    }

    if (
      group.primaryAggregate?.issueType === 'VEHICLE_READINESS_UNEVALUABLE'
      && group.preservedNotReadyAggregate
      && group.causes.length > 0
    ) {
      represented.add(group.primaryAggregate.id);
    }
  }

  return represented;
}
