/**
 * P1.7 — Canonical connectivity / health notification attention adapter.
 *
 * Tenant notification eligibility uses P0.1 connectivityRuntime attentionState
 * and P1.2 presentation — not client timestamp / onlineStatus heuristics.
 */
import type { VehicleConnectivityRuntimeState } from '../../../lib/api';
import type { VehicleData } from '../../data/vehicles';
import { buildFleetVehicleUiProjection, type FleetProjectionVehicle } from '../fleet-vehicle-ui-projection';
import {
  HEALTH_EVALUABILITY_STATE,
  type FleetHealthEvaluation,
  type HealthEvaluabilityState,
  normalizeHealthEvaluabilityState,
} from '../fleet-health-evaluation/types';
import { createVehicleIssueKey } from '../operational-issues/operationalIssueKeys';
import type {
  OperationalIssueDraft,
  OperationalIssueSeverity,
  OperationalIssueVehicleLike,
} from '../operational-issues/operationalIssueTypes';

export type ConnectivityNotificationAttention =
  | 'NONE'
  | 'WATCH'
  | 'ACTION_REQUIRED'
  | 'CRITICAL';

export function readConnectivityAttention(
  runtime: VehicleConnectivityRuntimeState | undefined,
): ConnectivityNotificationAttention {
  if (!runtime) return 'NONE';
  switch (runtime.attentionState) {
    case 'CRITICAL':
      return 'CRITICAL';
    case 'ACTION_REQUIRED':
      return 'ACTION_REQUIRED';
    case 'WATCH':
      return 'WATCH';
    default:
      return 'NONE';
  }
}

/** Canonical severity authority — attentionState, not overallState alone. */
export function mapAttentionToNotificationSeverity(
  runtime: VehicleConnectivityRuntimeState | undefined,
): OperationalIssueSeverity | null {
  const attention = readConnectivityAttention(runtime);
  if (attention === 'CRITICAL' || attention === 'ACTION_REQUIRED') {
    return 'critical';
  }
  if (attention === 'WATCH') {
    return 'warning';
  }
  return null;
}

export function shouldEmitCanonicalConnectivityNotification(
  runtime: VehicleConnectivityRuntimeState | undefined,
): boolean {
  return mapAttentionToNotificationSeverity(runtime) != null;
}

export function buildCanonicalConnectivityNotificationIdentity(
  vehicleId: string,
  runtime: VehicleConnectivityRuntimeState,
): string {
  const reasonCode = runtime.reasonCodes?.[0] ?? runtime.overallState;
  const episode = runtime.activeEpisodeId ?? 'none';
  return `connectivity:${vehicleId}:${episode}:${reasonCode}:${runtime.overallState}`;
}

export function resolveCanonicalConnectivityIssueType(
  runtime: VehicleConnectivityRuntimeState,
): string {
  if (runtime.overallState === 'DEVICE_UNPLUGGED') return 'device_unplugged';
  if (runtime.overallState === 'INTEGRATION_ERROR') return 'integration_error';
  if (runtime.overallState === 'AUTHORIZATION_REQUIRED') return 'authorization_required';
  if (runtime.overallState === 'NO_ACTIVE_DATA_SOURCE') return 'no_active_data_source';
  if (runtime.overallState === 'OFFLINE' || runtime.telemetryState === 'offline') {
    return 'telemetry_offline';
  }
  if (runtime.overallState === 'SOFT_OFFLINE' || runtime.telemetryState === 'signal_delayed') {
    return 'telemetry_soft_offline';
  }
  return 'connectivity_attention';
}

export function readVehicleHealthEvaluability(
  vehicle: OperationalIssueVehicleLike | VehicleData | undefined,
): HealthEvaluabilityState {
  const evaluation = (vehicle as { healthEvaluation?: FleetHealthEvaluation | null })?.healthEvaluation;
  return normalizeHealthEvaluabilityState(evaluation?.evaluability);
}

/**
 * NOT_EVALUABLE / UNKNOWN must not fabricate mechanical-critical notifications
 * without explicit rental-health module evidence.
 */
export function canEmitMechanicalHealthNotification(input: {
  vehicle?: OperationalIssueVehicleLike | VehicleData | null;
  hasExplicitModuleEvidence: boolean;
  proposedSeverity: OperationalIssueSeverity;
}): boolean {
  if (input.hasExplicitModuleEvidence) return true;
  const evaluability = readVehicleHealthEvaluability(input.vehicle ?? undefined);
  if (
    evaluability === HEALTH_EVALUABILITY_STATE.NOT_EVALUABLE ||
    evaluability === HEALTH_EVALUABILITY_STATE.UNKNOWN
  ) {
    return false;
  }
  if (
    evaluability === HEALTH_EVALUABILITY_STATE.PARTIALLY_EVALUABLE &&
    input.proposedSeverity === 'critical'
  ) {
    return false;
  }
  return true;
}

export function buildCanonicalConnectivityNotificationDraft(input: {
  vehicle: OperationalIssueVehicleLike | VehicleData;
  vehicleId: string;
  locale?: 'de' | 'en';
}): OperationalIssueDraft | null {
  const vehicle = input.vehicle as FleetProjectionVehicle;
  const runtime = vehicle.connectivityRuntime;
  const severity = mapAttentionToNotificationSeverity(runtime);
  if (!runtime || !severity) return null;

  const locale = input.locale ?? 'de';
  const ui = buildFleetVehicleUiProjection(vehicle, { locale });
  const title =
    ui.attention.primaryReason.presentation?.label ??
    ui.connectivity.overallState.presentation?.label ??
    ui.operator.primaryReason.presentation?.label ??
    (locale === 'de' ? 'Konnektivität prüfen' : 'Check connectivity');
  const subtitle =
    ui.availability.presentation?.tooltip ??
    ui.operator.recommendedAction.presentation?.label ??
    undefined;
  const recommendedAction = ui.operator.recommendedAction.presentation?.label ?? undefined;
  const issueType = resolveCanonicalConnectivityIssueType(runtime);

  return {
    semanticKey: buildCanonicalConnectivityNotificationIdentity(input.vehicleId, runtime),
    domain: 'telemetry',
    issueType,
    severity,
    title,
    subtitle,
    entityLabel: undefined,
    vehicleId: input.vehicleId,
    source: {
      sourceType: 'canonical',
      sourceId: runtime.activeEpisodeId ?? input.vehicleId,
      rawType: runtime.overallState,
      debugLabel: `canonical:connectivity:${runtime.attentionState}`,
    },
    recommendedAction,
    evidence: runtime.lastReceivedAt
      ? [{ label: locale === 'de' ? 'Zuletzt empfangen' : 'Last received', value: runtime.lastReceivedAt }]
      : undefined,
  };
}

export function resolveLegacyConflictConnectivityAlert(
  vehicle: VehicleData,
): OperationalIssueSeverity | null {
  return mapAttentionToNotificationSeverity(vehicle.connectivityRuntime);
}
