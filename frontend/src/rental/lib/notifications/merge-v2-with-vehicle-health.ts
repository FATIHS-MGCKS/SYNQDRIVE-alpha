import type { VehicleHealthAlert } from '../../DashboardInsightsContext';
import {
  mapOperationalIssueToActionQueueItem,
} from '../../components/dashboard/actionQueueBuilder';
import type { ActionQueueItem } from '../../components/dashboard/dashboardTypes';
import type { NotificationPrimaryTab } from '../../components/dashboard/notifications/notificationPanelTypes';
import { normalizeOperationalIssues } from '../operational-issues/normalizeOperationalIssues';
import { shouldShowInDashboardAttention } from '../operational-issues/operationalIssueTaxonomy';
import type { OperationalIssueVehicleLike } from '../operational-issues/operationalIssueTypes';

export function buildVehicleHealthQueueItems(
  vehicleHealthAlerts: VehicleHealthAlert[],
  locale: string,
  fleetById: Map<string, OperationalIssueVehicleLike>,
): ActionQueueItem[] {
  const issues = normalizeOperationalIssues({
    vehicleHealthAlerts,
    vehiclesById: fleetById,
  });

  return issues
    .filter(shouldShowInDashboardAttention)
    .map((issue) => mapOperationalIssueToActionQueueItem(issue, { locale }));
}

function isVehicleHealthQueueItem(item: ActionQueueItem): boolean {
  return item.category === 'health' || item.queue?.domain === 'vehicle-health';
}

/**
 * V2 notifications only include migrated DashboardInsights. Rental-Health-V1 module
 * warnings (DTC, tires, brakes, …) still live in vehicleHealthAlerts until producers
 * materialize them — bridge them into the Meldungen panel without duplicating V2 rows.
 */
export function mergeV2NotificationsWithVehicleHealth(
  v2Items: ActionQueueItem[],
  healthItems: ActionQueueItem[],
): ActionQueueItem[] {
  const coveredKeys = new Set(
    v2Items.filter(isVehicleHealthQueueItem).map((item) => item.semanticKey),
  );
  const supplemental = healthItems.filter((item) => !coveredKeys.has(item.semanticKey));
  if (!supplemental.length) {
    return [...v2Items].sort((a, b) => b.timeSortMs - a.timeSortMs);
  }
  return [...v2Items, ...supplemental].sort((a, b) => b.timeSortMs - a.timeSortMs);
}

export function supplementalHealthItems(
  v2Items: ActionQueueItem[],
  healthItems: ActionQueueItem[],
): ActionQueueItem[] {
  const coveredKeys = new Set(
    v2Items.filter(isVehicleHealthQueueItem).map((item) => item.semanticKey),
  );
  return healthItems.filter((item) => !coveredKeys.has(item.semanticKey));
}

export function augmentPrimaryTabCountsWithHealthItems(
  apiCounts: Record<NotificationPrimaryTab, number>,
  supplemental: ActionQueueItem[],
): Record<NotificationPrimaryTab, number> {
  if (!supplemental.length) return apiCounts;

  let critical = apiCounts.critical;
  let warning = apiCounts.warning;
  let all = apiCounts.all;

  for (const item of supplemental) {
    all += 1;
    const severity = item.queue?.severity ?? item.severity;
    if (severity === 'critical') critical += 1;
    else if (severity === 'warning') warning += 1;
  }

  return { ...apiCounts, all, critical, warning };
}
