import type { StationsUiCapabilities } from './stations-v2-ui-capabilities';
import type {
  StationVehicleWorkflowPreviewResult,
  StationVehicleWorkflowStationRef,
  StationVehicleWorkflowType,
  StationVehicleWorkflowVehicleRow,
} from '../../lib/api';

export const STATION_VEHICLE_WORKFLOW_ORDER: StationVehicleWorkflowType[] = [
  'change_home',
  'remove_home',
  'correct_current',
  'plan_transfer',
  'check_in',
];

export function availableStationVehicleWorkflows(
  caps: StationsUiCapabilities,
): StationVehicleWorkflowType[] {
  return STATION_VEHICLE_WORKFLOW_ORDER.filter((workflow) => {
    if (workflow === 'change_home' || workflow === 'remove_home') return caps.canManageHomeFleet;
    if (workflow === 'correct_current' || workflow === 'check_in') return caps.canManageCurrentLocation;
    if (workflow === 'plan_transfer') return caps.canManageTransfers;
    return false;
  });
}

export function formatWorkflowStationRef(
  station: StationVehicleWorkflowStationRef | null | undefined,
  unassignedLabel: string,
): string {
  if (!station) return unassignedLabel;
  return station.code ? `${station.name} (${station.code})` : station.name;
}

export function workflowNeedsTargetStation(workflow: StationVehicleWorkflowType): boolean {
  return workflow === 'change_home' || workflow === 'correct_current' || workflow === 'plan_transfer';
}

export function workflowDefaultTargetStationId(
  workflow: StationVehicleWorkflowType,
  contextStationId: string,
): string | undefined {
  if (workflow === 'change_home' || workflow === 'check_in') {
    return contextStationId;
  }
  return undefined;
}

export function workflowRestrictHomeFleet(workflow: StationVehicleWorkflowType): boolean {
  return workflow === 'remove_home';
}

export function isVersionConflictError(error: unknown): boolean {
  const payload = extractErrorPayload(error);
  const code = String(payload?.code ?? '');
  const blockingReasons = payload?.blockingReasons;
  const hasBlockingConflict = Array.isArray(blockingReasons)
    && blockingReasons.some(
      (issue) => typeof issue === 'object' && issue !== null && (issue as { code?: string }).code === 'STATION_POSITION_VERSION_CONFLICT',
    );
  return code === 'STATION_POSITION_VERSION_CONFLICT' || hasBlockingConflict;
}

export function extractErrorPayload(error: unknown): Record<string, unknown> | null {
  if (!error || typeof error !== 'object') return null;
  const maybe = error as { body?: unknown; message?: string };
  if (maybe.body && typeof maybe.body === 'object') {
    return maybe.body as Record<string, unknown>;
  }
  return { message: maybe.message };
}

export function buildWorkflowPreviewRequest(input: {
  workflow: StationVehicleWorkflowType;
  vehicle: StationVehicleWorkflowVehicleRow;
  contextStationId: string;
  targetStationId?: string;
  reason?: string;
}) {
  return {
    workflow: input.workflow,
    vehicleId: input.vehicle.id,
    contextStationId: input.contextStationId,
    ...(input.targetStationId ? { targetStationId: input.targetStationId } : {}),
    ...(input.reason?.trim() ? { reason: input.reason.trim() } : {}),
  };
}

export function previewHasRentedWarning(preview: StationVehicleWorkflowPreviewResult): boolean {
  return preview.rentalStatus === 'RENTED' || preview.warnings.some((w) => w.code.includes('RENTED'));
}

export function positionRowsFromPreview(preview: StationVehicleWorkflowPreviewResult) {
  return [
    { key: 'home', from: preview.from.homeStation, to: preview.to.homeStation },
    { key: 'current', from: preview.from.currentStation, to: preview.to.currentStation },
    { key: 'expected', from: preview.from.expectedStation, to: preview.to.expectedStation },
  ] as const;
}
