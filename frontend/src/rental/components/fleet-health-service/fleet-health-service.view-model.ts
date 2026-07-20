import type { StatusTone } from '../../../components/patterns';
import type {
  ApiTask,
  ApiTaskSummary,
  RentalHealthState,
  VehicleHealthResponse,
  Vendor,
} from '../../../lib/api';
import type { VehicleData } from '../../data/vehicles';
import { fhsModuleLabelDe, FHS_HEALTH_BADGE_DE } from './fleet-health-service-labels';
import {
  buildFleetHealthDisplay,
  computeFleetHealthKpis,
  operatorGroupForVehicle,
  type FleetHealthKpis,
  type RentalHealthModuleKey,
} from '../../lib/fleet-health-control-center';
import {
  findDuplicateHealthTask,
  type HealthActionModule,
} from '../../lib/health-task-bridge.utils';
import { deriveTaskIsOverdue } from '../../lib/task-display.utils';
import {
  isActiveTask,
  isDueSoonTask,
  selectRecentlyCompleted,
  selectUpcomingTasks,
} from '../service-center/service-center.utils';

import {
  buildFleetHealthServiceFreshness,
  type FleetHealthServiceFreshness,
} from './fleet-health-service-freshness';

export type FleetHealthServiceRecommendedAction =
  | 'open_task'
  | 'create_task'
  | 'review_vehicle'
  | 'no_action';

export interface FleetHealthServiceUiItem {
  vehicleId: string;
  plate: string;
  makeModelYear: string;
  healthState: RentalHealthState | 'unknown';
  primaryReason: string | null;
  rentalBlocked: boolean;
  sourceModule: RentalHealthModuleKey | null;
  existingTaskId: string | null;
  recommendedAction: FleetHealthServiceRecommendedAction;
}

export interface FleetHealthServiceHealthGroups {
  vehiclesNeedingAction: FleetHealthServiceUiItem[];
  vehiclesNeedingReview: FleetHealthServiceUiItem[];
  limitedDataVehicles: FleetHealthServiceUiItem[];
  healthyVehicles: FleetHealthServiceUiItem[];
  blockedVehicles: FleetHealthServiceUiItem[];
  warningVehicles: FleetHealthServiceUiItem[];
  criticalVehicles: FleetHealthServiceUiItem[];
}

export interface FleetHealthServiceExecutionGroups {
  openServiceTasks: ApiTask[];
  overdueServiceTasks: ApiTask[];
  inProgressServiceTasks: ApiTask[];
  vendorWaitingTasks: ApiTask[];
  upcomingServiceItems: ApiTask[];
  completedServiceItems: ApiTask[];
  activeVendors: Vendor[];
}

export interface FleetHealthServiceOverviewCounts {
  /** Distinct vehicles in health triage bands (action + review). */
  healthTriageVehicles: number;
  /** Active service tasks (execution layer). */
  activeServiceTasks: number;
  /** Health signals without a confident matching open task. */
  vehiclesAwaitingTaskCreation: number;
  /** Health signals linked to an existing open task. */
  vehiclesWithLinkedHealthTask: number;
  /**
   * Overdue tasks on vehicles that are NOT already covered by a linked health task.
   * Avoids counting the same vehicle twice as health action + overdue execution.
   */
  overdueExecutionOnlyTasks: number;
  /** Vendor-waiting tasks (execution). */
  vendorWaitingTasks: number;
}

export type FleetHealthServiceOverviewRowKind = 'health' | 'task';

export interface FleetHealthServiceOverviewRow {
  id: string;
  kind: FleetHealthServiceOverviewRowKind;
  vehicleId: string;
  plate: string;
  makeModelYear: string;
  statusLabel: string;
  statusTone: StatusTone;
  primaryReason: string;
  sourceLabel: string;
  recommendedAction: FleetHealthServiceRecommendedAction;
  existingTaskId: string | null;
  taskId?: string;
  sortRank: number;
}

export interface FleetHealthServiceViewModel {
  loading: boolean;
  healthLoading: boolean;
  serviceLoading: boolean;
  serviceError: string | null;
  freshness: FleetHealthServiceFreshness;
  healthKpis: FleetHealthKpis;
  healthGroups: FleetHealthServiceHealthGroups;
  executionGroups: FleetHealthServiceExecutionGroups;
  uiItems: FleetHealthServiceUiItem[];
  byVehicleId: Map<string, FleetHealthServiceUiItem>;
  overviewCounts: FleetHealthServiceOverviewCounts;
  prioritizedOverviewRows: FleetHealthServiceOverviewRow[];
}

export interface BuildFleetHealthServiceViewModelInput {
  vehicles: VehicleData[];
  healthMap: Map<string, VehicleHealthResponse>;
  healthLoading: boolean;
  healthFetchedAt: string | null;
  taskSummary: ApiTaskSummary | null;
  taskList: ApiTask[];
  vendors: Vendor[];
  tasksFetchedAt: string | null;
  vendorsFetchedAt: string | null;
  serviceCasesFetchedAt: string | null;
  serviceLoading: boolean;
  serviceError: string | null;
  serviceLoaded: boolean;
}

const OPEN_STATUSES = new Set(['OPEN', 'IN_PROGRESS', 'WAITING']);

function formatMakeModelYear(vehicle: VehicleData): string {
  return [vehicle.make, vehicle.model, vehicle.year].filter(Boolean).join(' ');
}

function resolveSourceModule(
  health: VehicleHealthResponse | null | undefined,
): RentalHealthModuleKey | null {
  const display = buildFleetHealthDisplay(health);
  return display.primaryModuleKey;
}

/**
 * Conservative task match — reuses health-task-bridge rules.
 * No aggressive title/category heuristics beyond existing bridge logic.
 */
export function matchOpenTaskForHealthSignal(
  openTasks: ApiTask[],
  vehicleId: string,
  health: VehicleHealthResponse | null | undefined,
): ApiTask | null {
  const moduleKey = resolveSourceModule(health);
  if (moduleKey) {
    const matched = findDuplicateHealthTask(
      openTasks,
      vehicleId,
      moduleKey as HealthActionModule,
      'VEHICLE_SERVICE',
    );
    if (matched) return matched;
  }

  if (health?.rental_blocked !== true) return null;

  for (const task of openTasks) {
    if (task.vehicleId !== vehicleId) continue;
    if (!OPEN_STATUSES.has(task.status)) continue;
    if (task.blocksVehicleAvailability) return task;
    const meta =
      task.metadata && typeof task.metadata === 'object'
        ? (task.metadata as Record<string, unknown>)
        : null;
    if (task.sourceType === 'HEALTH' && meta?.healthModule) return task;
  }

  return null;
}

export function deriveRecommendedAction(
  health: VehicleHealthResponse | null | undefined,
  existingTask: ApiTask | null,
): FleetHealthServiceRecommendedAction {
  const display = buildFleetHealthDisplay(health);
  if (display.band === 'good') return 'no_action';
  if (display.band === 'unevaluable' || display.band === 'limited') return 'review_vehicle';
  if (existingTask) return 'open_task';
  if (display.band === 'blocked' || display.band === 'critical' || display.band === 'review') {
    return 'create_task';
  }
  return 'no_action';
}

export function buildFleetHealthServiceUiItem(
  vehicle: VehicleData,
  health: VehicleHealthResponse | null | undefined,
  openTasks: ApiTask[],
): FleetHealthServiceUiItem {
  const display = buildFleetHealthDisplay(health);
  const existingTask = matchOpenTaskForHealthSignal(openTasks, vehicle.id, health);

  return {
    vehicleId: vehicle.id,
    plate: vehicle.license,
    makeModelYear: formatMakeModelYear(vehicle),
    healthState: health?.overall_state ?? 'unknown',
    primaryReason: display.primaryIssue,
    rentalBlocked: display.rentalBlocked,
    sourceModule: display.primaryModuleKey,
    existingTaskId: existingTask?.id ?? null,
    recommendedAction: deriveRecommendedAction(health, existingTask),
  };
}

function buildHealthGroups(
  uiItems: FleetHealthServiceUiItem[],
  healthMap: Map<string, VehicleHealthResponse>,
): FleetHealthServiceHealthGroups {
  const vehiclesNeedingAction: FleetHealthServiceUiItem[] = [];
  const vehiclesNeedingReview: FleetHealthServiceUiItem[] = [];
  const limitedDataVehicles: FleetHealthServiceUiItem[] = [];
  const healthyVehicles: FleetHealthServiceUiItem[] = [];
  const blockedVehicles: FleetHealthServiceUiItem[] = [];
  const warningVehicles: FleetHealthServiceUiItem[] = [];
  const criticalVehicles: FleetHealthServiceUiItem[] = [];

  for (const item of uiItems) {
    const health = healthMap.get(item.vehicleId);
    const group = operatorGroupForVehicle(health);

    if (group === 'action_required') vehiclesNeedingAction.push(item);
    else if (group === 'needs_review') vehiclesNeedingReview.push(item);
    else if (group === 'limited_data') limitedDataVehicles.push(item);
    else healthyVehicles.push(item);

    if (health?.rental_blocked === true) blockedVehicles.push(item);
    if (health && health.availability === 'ready') {
      if (health.overall_state === 'warning') warningVehicles.push(item);
      if (health.overall_state === 'critical') criticalVehicles.push(item);
    }
  }

  return {
    vehiclesNeedingAction,
    vehiclesNeedingReview,
    limitedDataVehicles,
    healthyVehicles,
    blockedVehicles,
    warningVehicles,
    criticalVehicles,
  };
}

function buildExecutionGroups(
  taskList: ApiTask[],
  vendors: Vendor[],
): FleetHealthServiceExecutionGroups {
  const openServiceTasks = taskList.filter(isActiveTask);
  const overdueServiceTasks = openServiceTasks.filter((t) => deriveTaskIsOverdue(t));
  const inProgressServiceTasks = openServiceTasks.filter((t) => t.status === 'IN_PROGRESS');
  const vendorWaitingTasks = openServiceTasks.filter(
    (t) => t.status === 'WAITING' && Boolean(t.vendorId),
  );
  const historyTasks = taskList.filter((t) => t.status === 'DONE' || t.status === 'CANCELLED');

  return {
    openServiceTasks,
    overdueServiceTasks,
    inProgressServiceTasks,
    vendorWaitingTasks,
    upcomingServiceItems: selectUpcomingTasks(openServiceTasks),
    completedServiceItems: selectRecentlyCompleted(historyTasks),
    activeVendors: vendors,
  };
}

function healthStatusForItem(item: FleetHealthServiceUiItem): { label: string; tone: StatusTone } {
  if (item.rentalBlocked) return FHS_HEALTH_BADGE_DE.blocked;
  if (item.recommendedAction === 'create_task' || item.recommendedAction === 'open_task') {
    return FHS_HEALTH_BADGE_DE.action;
  }
  if (item.recommendedAction === 'review_vehicle') return FHS_HEALTH_BADGE_DE.limited;
  return FHS_HEALTH_BADGE_DE.review;
}

function healthSortRank(item: FleetHealthServiceUiItem): number {
  if (item.rentalBlocked) return 10;
  if (item.recommendedAction === 'open_task' || item.recommendedAction === 'create_task') return 20;
  if (item.recommendedAction === 'review_vehicle') return 70;
  return 50;
}

function taskSortRank(task: ApiTask): number {
  if (deriveTaskIsOverdue(task)) return 30;
  if (task.status === 'IN_PROGRESS') return 50;
  if (task.status === 'WAITING' && task.vendorId) return 60;
  return 80;
}

function taskStatusLabel(task: ApiTask): { label: string; tone: StatusTone } {
  if (deriveTaskIsOverdue(task)) return FHS_HEALTH_BADGE_DE.overdue;
  if (task.status === 'IN_PROGRESS') return FHS_HEALTH_BADGE_DE.in_progress;
  if (task.status === 'WAITING' && task.vendorId) return FHS_HEALTH_BADGE_DE.vendor_waiting;
  return { label: 'Offen', tone: 'neutral' };
}

/**
 * Deduped triage list for Übersicht — one row per vehicle/problem band.
 * Health rows first; execution-only tasks only when the vehicle is not already covered.
 */
export function buildPrioritizedOverviewRows(
  uiItems: FleetHealthServiceUiItem[],
  executionGroups: FleetHealthServiceExecutionGroups,
  byVehicleId: Map<string, FleetHealthServiceUiItem>,
): FleetHealthServiceOverviewRow[] {
  const rows: FleetHealthServiceOverviewRow[] = [];
  const coveredVehicleIds = new Set<string>();

  const healthCandidates = uiItems
    .filter((item) => item.recommendedAction !== 'no_action')
    .sort((a, b) => healthSortRank(a) - healthSortRank(b));

  for (const item of healthCandidates) {
    coveredVehicleIds.add(item.vehicleId);
    const status = healthStatusForItem(item);
    rows.push({
      id: `health-${item.vehicleId}`,
      kind: 'health',
      vehicleId: item.vehicleId,
      plate: item.plate,
      makeModelYear: item.makeModelYear,
      statusLabel: status.label,
      statusTone: status.tone,
      primaryReason: item.primaryReason ?? 'Zustand prüfen',
      sourceLabel: fhsModuleLabelDe(item.sourceModule),
      recommendedAction: item.recommendedAction,
      existingTaskId: item.existingTaskId,
      sortRank: healthSortRank(item),
    });
  }

  const linkedVehicleIds = new Set(
    uiItems.filter((i) => i.recommendedAction === 'open_task').map((i) => i.vehicleId),
  );

  const executionCandidates = [
    ...executionGroups.overdueServiceTasks,
    ...executionGroups.inProgressServiceTasks,
    ...executionGroups.vendorWaitingTasks,
  ].filter((task) => {
    if (!task.vehicleId) return true;
    if (linkedVehicleIds.has(task.vehicleId)) return false;
    if (coveredVehicleIds.has(task.vehicleId)) return false;
    return true;
  });

  const seenTaskIds = new Set<string>();
  for (const task of executionCandidates.sort((a, b) => taskSortRank(a) - taskSortRank(b))) {
    if (seenTaskIds.has(task.id)) continue;
    seenTaskIds.add(task.id);
    const vehicleItem = task.vehicleId ? byVehicleId.get(task.vehicleId) : undefined;
    const status = taskStatusLabel(task);
    rows.push({
      id: `task-${task.id}`,
      kind: 'task',
      vehicleId: task.vehicleId ?? '',
      plate: vehicleItem?.plate ?? '—',
      makeModelYear: vehicleItem?.makeModelYear ?? '',
      statusLabel: status.label,
      statusTone: status.tone,
      primaryReason: task.title,
      sourceLabel: 'Aufgabe',
      recommendedAction: 'open_task',
      existingTaskId: task.id,
      taskId: task.id,
      sortRank: taskSortRank(task),
    });
  }

  return rows.sort((a, b) => a.sortRank - b.sortRank || a.plate.localeCompare(b.plate, 'de'));
}

function buildOverviewCounts(
  uiItems: FleetHealthServiceUiItem[],
  executionGroups: FleetHealthServiceExecutionGroups,
): FleetHealthServiceOverviewCounts {
  const linkedVehicleIds = new Set(
    uiItems
      .filter((i) => i.recommendedAction === 'open_task')
      .map((i) => i.vehicleId),
  );

  const overdueExecutionOnlyTasks = executionGroups.overdueServiceTasks.filter(
    (t) => !t.vehicleId || !linkedVehicleIds.has(t.vehicleId),
  ).length;

  return {
    healthTriageVehicles: uiItems.filter((i) => i.recommendedAction !== 'no_action').length,
    activeServiceTasks: executionGroups.openServiceTasks.length,
    vehiclesAwaitingTaskCreation: uiItems.filter((i) => i.recommendedAction === 'create_task')
      .length,
    vehiclesWithLinkedHealthTask: uiItems.filter((i) => i.recommendedAction === 'open_task')
      .length,
    overdueExecutionOnlyTasks,
    vendorWaitingTasks: executionGroups.vendorWaitingTasks.length,
  };
}

export function buildFleetHealthServiceViewModel(
  input: BuildFleetHealthServiceViewModelInput,
): FleetHealthServiceViewModel {
  const {
    vehicles,
    healthMap,
    healthLoading,
    healthFetchedAt,
    taskList,
    vendors,
    tasksFetchedAt,
    vendorsFetchedAt,
    serviceCasesFetchedAt,
    serviceLoading,
    serviceError,
  } = input;

  const openTasks = taskList.filter(isActiveTask);
  const vehicleIds = vehicles.map((v) => v.id);

  const uiItems = vehicles.map((vehicle) =>
    buildFleetHealthServiceUiItem(vehicle, healthMap.get(vehicle.id), openTasks),
  );

  const byVehicleId = new Map(uiItems.map((item) => [item.vehicleId, item]));
  const healthKpis = computeFleetHealthKpis(vehicleIds, healthMap);
  const healthGroups = buildHealthGroups(uiItems, healthMap);
  const executionGroups = buildExecutionGroups(taskList, vendors);
  const overviewCounts = buildOverviewCounts(uiItems, executionGroups);
  const prioritizedOverviewRows = buildPrioritizedOverviewRows(uiItems, executionGroups, byVehicleId);
  const freshness = buildFleetHealthServiceFreshness({
    healthFetchedAt,
    healthMap,
    vehicleIds,
    tasksFetchedAt,
    vendorsFetchedAt,
    serviceCasesFetchedAt,
  });

  return {
    loading: healthLoading || serviceLoading,
    healthLoading,
    serviceLoading,
    serviceError,
    freshness,
    healthKpis,
    healthGroups,
    executionGroups,
    uiItems,
    byVehicleId,
    overviewCounts,
    prioritizedOverviewRows,
  };
}

/** Exported for tests — overdue count from active tasks only. */
export function countOverdueServiceTasks(tasks: ApiTask[]): number {
  return tasks.filter(isActiveTask).filter((t) => deriveTaskIsOverdue(t)).length;
}

/** Exported for tests — vendor waiting count. */
export function countVendorWaitingTasks(tasks: ApiTask[]): number {
  return tasks
    .filter(isActiveTask)
    .filter((t) => t.status === 'WAITING' && Boolean(t.vendorId)).length;
}

/** Exported for tests — upcoming within default service-center window. */
export function countUpcomingServiceTasks(tasks: ApiTask[]): number {
  return tasks.filter(isActiveTask).filter((t) => isDueSoonTask(t)).length;
}
