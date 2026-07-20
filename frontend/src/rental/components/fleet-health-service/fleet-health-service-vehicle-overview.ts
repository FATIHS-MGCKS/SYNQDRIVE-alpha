import type { StatusTone } from '../../../components/patterns';
import type {
  ApiServiceCase,
  ApiServiceCaseStatus,
  ApiTask,
  VehicleHealthResponse,
} from '../../../lib/api';
import {
  buildFleetHealthDisplay,
  healthSeverityBand,
  listFleetHealthIssueChips,
  operatorGroupForVehicle,
  type HealthIssueChip,
} from '../../lib/fleet-health-control-center';
import { deriveTaskIsOverdue, formatTaskDueDate } from '../../lib/task-display.utils';
import { getScheduleBucket } from '../../lib/service-schedule.utils';
import {
  findDuplicateHealthTask,
  type HealthActionModule,
} from '../../lib/health-task-bridge.utils';
import {
  isActiveTask,
  isDueSoonTask,
} from '../service-center/service-center.utils';
import { FHS_HEALTH_BADGE_DE, fhsModuleLabelDe } from './fleet-health-service-labels';
import {
  deriveRecommendedAction,
  FLEET_HEALTH_SERVICE_PRIORITY_SECTION_ORDER,
  type FleetHealthServicePrioritySection,
  type FleetHealthServicePrioritySectionKey,
  type FleetHealthServiceUiItem,
  type FleetHealthServiceVehicleCaseItem,
  type FleetHealthServiceVehicleFinding,
  type FleetHealthServiceVehicleOverviewRow,
  type FleetHealthServiceVehicleTaskItem,
} from './fleet-health-service.view-model';

const OPEN_SERVICE_CASE_STATUSES = new Set<ApiServiceCaseStatus>([
  'OPEN',
  'SCHEDULED',
  'IN_PROGRESS',
  'WAITING_VENDOR',
  'WAITING_PARTS',
]);

const SERVICE_CASE_STATUS_DE: Record<ApiServiceCaseStatus, string> = {
  OPEN: 'Offen',
  SCHEDULED: 'Geplant',
  IN_PROGRESS: 'In Bearbeitung',
  WAITING_VENDOR: 'Wartet Partner',
  WAITING_PARTS: 'Wartet Teile',
  COMPLETED: 'Abgeschlossen',
  CANCELLED: 'Storniert',
};

const SERVICE_CASE_SOURCE_DE: Record<string, string> = {
  MANUAL: 'Manuell',
  HEALTH: 'Health',
  DTC: 'DTC',
  DAMAGE: 'Schaden',
  BOOKING: 'Buchung',
  DOCUMENT: 'Dokument',
  SERVICE_COMPLIANCE: 'Service',
};

const SECTION_RANK: Record<FleetHealthServicePrioritySectionKey, number> = {
  technically_blocked: 10,
  handle_today: 20,
  technical_review: 30,
  incomplete_data: 40,
  due_soon: 50,
};

export function isOpenServiceCase(serviceCase: ApiServiceCase): boolean {
  return OPEN_SERVICE_CASE_STATUSES.has(serviceCase.status);
}

export function getBlockingServiceCaseVehicleIds(
  serviceCases: ApiServiceCase[],
): Set<string> {
  const ids = new Set<string>();
  for (const serviceCase of serviceCases) {
    if (!isOpenServiceCase(serviceCase) || !serviceCase.blocksRental) continue;
    ids.add(serviceCase.vehicleId);
  }
  return ids;
}

function taskToWorkItem(task: ApiTask): FleetHealthServiceVehicleTaskItem {
  const status = taskStatusForTask(task);
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    statusLabel: status.label,
    tone: status.tone,
    sourceLabel: 'Aufgabe',
    dueLabel: task.dueDate ? formatTaskDueDate(task.dueDate) : null,
    serviceCaseId: task.serviceCaseId,
  };
}

function taskStatusForTask(task: ApiTask): { label: string; tone: StatusTone } {
  if (deriveTaskIsOverdue(task)) return FHS_HEALTH_BADGE_DE.overdue;
  if (task.status === 'IN_PROGRESS') return FHS_HEALTH_BADGE_DE.in_progress;
  if (task.status === 'WAITING' && task.vendorId) return FHS_HEALTH_BADGE_DE.vendor_waiting;
  return { label: 'Offen', tone: 'neutral' };
}

function findingFromChip(
  chip: HealthIssueChip,
  linkedTaskId: string | null,
): FleetHealthServiceVehicleFinding {
  return {
    id: `finding-${chip.key}`,
    moduleKey: chip.key,
    label: chip.label,
    detail: chip.detail,
    reason: chip.reason,
    state: chip.state,
    tone: chip.tone,
    linkedTaskId,
    sourceLabel: fhsModuleLabelDe(chip.key),
  };
}

function vehicleSortRank(
  display: ReturnType<typeof buildFleetHealthDisplay>,
  openTasks: ApiTask[],
): number {
  if (display.rentalBlocked) return 10;
  if (display.band === 'blocked' || display.band === 'critical') return 20;
  if (openTasks.some((t) => deriveTaskIsOverdue(t))) return 25;
  if (openTasks.some((t) => t.status === 'IN_PROGRESS')) return 30;
  if (display.band === 'review') return 40;
  if (display.band === 'limited') return 70;
  if (openTasks.some((t) => isDueSoonTask(t))) return 80;
  return 90;
}

function classifyVehicleSection(
  display: ReturnType<typeof buildFleetHealthDisplay>,
  health: VehicleHealthResponse | null | undefined,
  openTasks: ApiTask[],
  openCases: ApiServiceCase[],
): FleetHealthServicePrioritySectionKey | null {
  const hasWork = openTasks.length > 0 || openCases.length > 0;
  const hasHealthSignal =
    display.band !== 'good' || display.rentalBlocked || listFleetHealthIssueChips(health).length > 0;

  if (!hasWork && !hasHealthSignal) return null;

  if (display.rentalBlocked || healthSeverityBand(health) === 'blocked') {
    return 'technically_blocked';
  }

  if (
    openTasks.some(
      (t) =>
        deriveTaskIsOverdue(t) ||
        t.status === 'IN_PROGRESS' ||
        (t.status === 'WAITING' && Boolean(t.vendorId)) ||
        getScheduleBucket(t) === 'today',
    ) ||
    operatorGroupForVehicle(health) === 'action_required'
  ) {
    return 'handle_today';
  }

  if (operatorGroupForVehicle(health) === 'needs_review' || display.band === 'review') {
    return 'technical_review';
  }

  if (operatorGroupForVehicle(health) === 'limited_data' || display.band === 'limited') {
    return 'incomplete_data';
  }

  if (openTasks.some((t) => isDueSoonTask(t))) return 'due_soon';

  if (hasWork || hasHealthSignal) return 'handle_today';

  return null;
}

function primaryStatusFromDisplay(
  display: ReturnType<typeof buildFleetHealthDisplay>,
): { label: string; tone: StatusTone } {
  if (display.rentalBlocked) return FHS_HEALTH_BADGE_DE.blocked;
  switch (display.band) {
    case 'blocked':
    case 'critical':
      return FHS_HEALTH_BADGE_DE.action;
    case 'review':
      return FHS_HEALTH_BADGE_DE.review;
    case 'good':
      return FHS_HEALTH_BADGE_DE.healthy;
    default:
      return FHS_HEALTH_BADGE_DE.limited;
  }
}

function primaryBlockageForVehicle(
  display: ReturnType<typeof buildFleetHealthDisplay>,
  health: VehicleHealthResponse | null | undefined,
  unmatchedTasks: FleetHealthServiceVehicleTaskItem[],
): string {
  if (health?.rental_blocked && health.blocking_reasons[0]) {
    return health.blocking_reasons[0];
  }
  if (display.primaryIssue) return display.primaryIssue;
  if (unmatchedTasks[0]?.title) return unmatchedTasks[0].title;
  if (display.dataQualityNote) return display.dataQualityNote;
  return 'Zustand prüfen';
}

export function buildVehicleOverviewRow(
  item: FleetHealthServiceUiItem,
  health: VehicleHealthResponse | null | undefined,
  openTasks: ApiTask[],
  openCases: ApiServiceCase[],
): FleetHealthServiceVehicleOverviewRow | null {
  const vehicleId = item.vehicleId;
  const vehicleTasks = openTasks.filter((t) => t.vehicleId === vehicleId);
  const vehicleCases = openCases.filter((c) => c.vehicleId === vehicleId);
  const display = buildFleetHealthDisplay(health);
  const issueChips = listFleetHealthIssueChips(health);

  const section = classifyVehicleSection(display, health, vehicleTasks, vehicleCases);
  if (!section) return null;

  const shownTaskIds = new Set<string>();
  const findings: FleetHealthServiceVehicleFinding[] = issueChips.map((chip) => {
    const linked = findDuplicateHealthTask(
      openTasks,
      vehicleId,
      chip.key as HealthActionModule,
      'VEHICLE_SERVICE',
    );
    if (linked) shownTaskIds.add(linked.id);
    return findingFromChip(chip, linked?.id ?? null);
  });

  const cases: FleetHealthServiceVehicleCaseItem[] = [];
  const matchedTasks: FleetHealthServiceVehicleTaskItem[] = [];

  for (const serviceCase of vehicleCases) {
    const refIds = new Set(serviceCase.tasks.map((t) => t.id));
    const caseTasks = vehicleTasks.filter(
      (t) => t.serviceCaseId === serviceCase.id || refIds.has(t.id),
    );
    for (const task of caseTasks) shownTaskIds.add(task.id);

    cases.push({
      id: serviceCase.id,
      title: serviceCase.title,
      status: serviceCase.status,
      statusLabel: SERVICE_CASE_STATUS_DE[serviceCase.status],
      sourceLabel: SERVICE_CASE_SOURCE_DE[serviceCase.source] ?? serviceCase.source,
      linkedTaskIds: caseTasks.map((t) => t.id),
    });

    for (const task of caseTasks) {
      matchedTasks.push(taskToWorkItem(task));
    }
  }

  const unmatchedTasks = vehicleTasks
    .filter((t) => !shownTaskIds.has(t.id))
    .map(taskToWorkItem);

  const status = primaryStatusFromDisplay(display);
  const additionalFindingsCount = Math.max(0, findings.length - 1);
  const moreCount = additionalFindingsCount + unmatchedTasks.length + cases.length;

  const primaryLinkedTaskId =
    findings.find((f) => f.linkedTaskId)?.linkedTaskId ??
    item.existingTaskId ??
    unmatchedTasks[0]?.id ??
    null;

  return {
    id: `vehicle-${vehicleId}`,
    vehicleId,
    plate: item.plate,
    makeModelYear: item.makeModelYear,
    section,
    primaryStatusLabel: status.label,
    primaryStatusTone: status.tone,
    primaryBlockage: primaryBlockageForVehicle(display, health, unmatchedTasks),
    additionalFindingsCount,
    openTaskCount: vehicleTasks.length,
    openCaseCount: vehicleCases.length,
    moreCount,
    recommendedAction: deriveRecommendedAction(
      health,
      primaryLinkedTaskId
        ? vehicleTasks.find((t) => t.id === primaryLinkedTaskId) ?? null
        : null,
    ),
    primaryLinkedTaskId,
    sortRank: vehicleSortRank(display, vehicleTasks),
    findings,
    cases,
    matchedTasks,
    unmatchedTasks,
    dataQualityNote: display.dataQualityNote,
  };
}

export function buildVehicleOverviewSections(
  uiItems: FleetHealthServiceUiItem[],
  healthMap: Map<string, VehicleHealthResponse>,
  taskList: ApiTask[],
  serviceCases: ApiServiceCase[],
): FleetHealthServicePrioritySection[] {
  const openTasks = taskList.filter(isActiveTask);
  const openCases = serviceCases.filter(isOpenServiceCase);
  const buckets: Record<FleetHealthServicePrioritySectionKey, FleetHealthServiceVehicleOverviewRow[]> =
    {
      technically_blocked: [],
      handle_today: [],
      technical_review: [],
      incomplete_data: [],
      due_soon: [],
    };

  const seenVehicleIds = new Set<string>();

  for (const item of uiItems) {
    const health = healthMap.get(item.vehicleId);
    const row = buildVehicleOverviewRow(item, health, openTasks, openCases);
    if (!row || seenVehicleIds.has(item.vehicleId)) continue;
    seenVehicleIds.add(item.vehicleId);
    buckets[row.section].push(row);
  }

  for (const task of openTasks) {
    if (!task.vehicleId || seenVehicleIds.has(task.vehicleId)) continue;
    const item = uiItems.find((i) => i.vehicleId === task.vehicleId);
    if (!item) continue;
    const health = healthMap.get(task.vehicleId);
    const row = buildVehicleOverviewRow(item, health, openTasks, openCases);
    if (!row) continue;
    seenVehicleIds.add(task.vehicleId);
    buckets[row.section].push(row);
  }

  for (const serviceCase of openCases) {
    if (seenVehicleIds.has(serviceCase.vehicleId)) continue;
    const item = uiItems.find((i) => i.vehicleId === serviceCase.vehicleId);
    if (!item) continue;
    const health = healthMap.get(serviceCase.vehicleId);
    const row = buildVehicleOverviewRow(item, health, openTasks, openCases);
    if (!row) continue;
    seenVehicleIds.add(serviceCase.vehicleId);
    buckets[row.section].push(row);
  }

  return FLEET_HEALTH_SERVICE_PRIORITY_SECTION_ORDER.map((key) => ({
    key,
    rows: [...buckets[key]].sort(
      (a, b) =>
        a.sortRank - b.sortRank ||
        SECTION_RANK[a.section] - SECTION_RANK[b.section] ||
        a.plate.localeCompare(b.plate, 'de'),
    ),
  }));
}
