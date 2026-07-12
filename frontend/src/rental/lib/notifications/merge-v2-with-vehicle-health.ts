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

function v2HealthVehicleIds(v2Items: ActionQueueItem[]): Set<string> {
  const ids = new Set<string>();
  for (const item of v2Items) {
    if (isVehicleHealthQueueItem(item) && item.vehicleId) {
      ids.add(item.vehicleId);
    }
  }
  return ids;
}

function coveredHealthSemanticKeys(v2Items: ActionQueueItem[]): Set<string> {
  const keys = new Set<string>();
  for (const item of v2Items) {
    if (isVehicleHealthQueueItem(item) && item.semanticKey) {
      keys.add(item.semanticKey);
    }
  }
  return keys;
}

function shouldSkipSupplementalHealthItem(
  item: ActionQueueItem,
  coveredSemanticKeys: Set<string>,
  coveredVehicleIds: Set<string>,
): boolean {
  if (item.semanticKey && coveredSemanticKeys.has(item.semanticKey)) return true;
  if (item.vehicleId && coveredVehicleIds.has(item.vehicleId)) return true;
  return false;
}

function coveredQueueIds(v2Items: ActionQueueItem[]): Set<string> {
  return new Set(v2Items.map((item) => item.id));
}

function coveredQueueSemanticKeys(v2Items: ActionQueueItem[]): Set<string> {
  const keys = new Set<string>();
  for (const item of v2Items) {
    if (item.semanticKey) keys.add(item.semanticKey);
  }
  return keys;
}

function shouldSkipGenericSupplementalItem(
  item: ActionQueueItem,
  coveredIds: Set<string>,
  coveredSemanticKeys: Set<string>,
): boolean {
  if (coveredIds.has(item.id)) return true;
  if (item.semanticKey && coveredSemanticKeys.has(item.semanticKey)) return true;
  return false;
}

/**
 * Client-side derived insights (fleet-level operational signals) are not yet
 * materialized in Notification V2 — bridge them like rental-health warnings.
 */
export function supplementalQueueItems(
  v2Items: ActionQueueItem[],
  supplemental: ActionQueueItem[],
): ActionQueueItem[] {
  const coveredIds = coveredQueueIds(v2Items);
  const coveredSemanticKeys = coveredQueueSemanticKeys(v2Items);
  return supplemental.filter(
    (item) => !shouldSkipGenericSupplementalItem(item, coveredIds, coveredSemanticKeys),
  );
}

export function mergeV2WithSupplemental(
  v2Items: ActionQueueItem[],
  supplemental: ActionQueueItem[],
): ActionQueueItem[] {
  const extra = supplementalQueueItems(v2Items, supplemental);
  if (!extra.length) {
    return [...v2Items].sort((a, b) => b.timeSortMs - a.timeSortMs);
  }
  return [...v2Items, ...extra].sort((a, b) => b.timeSortMs - a.timeSortMs);
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
  const coveredSemanticKeys = coveredHealthSemanticKeys(v2Items);
  const coveredVehicleIds = v2HealthVehicleIds(v2Items);
  const supplemental = healthItems.filter(
    (item) => !shouldSkipSupplementalHealthItem(item, coveredSemanticKeys, coveredVehicleIds),
  );
  if (!supplemental.length) {
    return [...v2Items].sort((a, b) => b.timeSortMs - a.timeSortMs);
  }
  return [...v2Items, ...supplemental].sort((a, b) => b.timeSortMs - a.timeSortMs);
}

export function supplementalHealthItems(
  v2Items: ActionQueueItem[],
  healthItems: ActionQueueItem[],
): ActionQueueItem[] {
  const coveredSemanticKeys = coveredHealthSemanticKeys(v2Items);
  const coveredVehicleIds = v2HealthVehicleIds(v2Items);
  return healthItems.filter(
    (item) => !shouldSkipSupplementalHealthItem(item, coveredSemanticKeys, coveredVehicleIds),
  );
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
