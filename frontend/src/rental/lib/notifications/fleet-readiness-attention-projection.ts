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
  aggregateEventType?: 'VEHICLE_NOT_READY' | 'VEHICLE_READINESS_UNEVALUABLE';
  aggregateItem?: ActionQueueItem;
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

/**
 * Presentation-only projection: groups FLEET_READINESS vehicle notifications by vehicle,
 * separating aggregate readiness state from specific causes.
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
    const aggregateItems = vehicleItems.filter((item) =>
      FLEET_READINESS_AGGREGATE_EVENT_TYPES.has(item.issueType ?? ''),
    );
    const causes = vehicleItems.filter(
      (item) => !FLEET_READINESS_AGGREGATE_EVENT_TYPES.has(item.issueType ?? ''),
    );

    const notReady = aggregateItems.find((item) => item.issueType === 'VEHICLE_NOT_READY');
    const unevaluable = aggregateItems.find((item) => item.issueType === 'VEHICLE_READINESS_UNEVALUABLE');
    const aggregateItem = notReady ?? unevaluable;
    const aggregateEventType = aggregateItem?.issueType as
      | 'VEHICLE_NOT_READY'
      | 'VEHICLE_READINESS_UNEVALUABLE'
      | undefined;

    const labelSource = aggregateItem ?? causes[0] ?? vehicleItems[0];
    if (!labelSource) continue;

    groups.push({
      vehicleId,
      label: resolveVehicleLabel(labelSource, vehicleId),
      aggregateEventType,
      aggregateItem,
      causes,
      severity: highestSeverity(causes.length > 0 ? causes : vehicleItems),
    });
  }

  return groups.sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
}

export function fleetReadinessGroupToActionQueueGroup(
  group: FleetReadinessVehicleGroup,
): ActionQueueGroupItem | ActionQueueLeafItem {
  const children = group.causes.map(childFromItem);

  if (children.length === 0 && group.aggregateItem) {
    return { ...group.aggregateItem, kind: 'leaf' };
  }

  const childSeverity = children.reduce<ActionQueueChildSeverity>(
    (worst, child) => (severityRank(child.severity as ActionQueueSeverity) > severityRank(worst as ActionQueueSeverity) ? child.severity : worst),
    'info',
  );

  return {
    kind: 'group',
    id: `fleet-readiness:${group.vehicleId}`,
    groupKey: `vehicle:${group.vehicleId}`,
    groupType: 'vehicle-health',
    title: group.aggregateItem?.title ?? group.label,
    subtitle: children.length > 0 ? String(children.length) : '',
    severity: childSeverity,
    category: group.aggregateItem?.category ?? 'health',
    vehicleId: group.vehicleId,
    entityLabel: group.label,
    children,
    priority: group.aggregateItem?.priority ?? children[0]?.severity === 'critical' ? 100 : 50,
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
