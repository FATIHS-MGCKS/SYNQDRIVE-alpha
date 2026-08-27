/**
 * P1.3 — Fleet display resolution from P1.2 UI projection.
 */
import type { StatusTone } from '../../components/patterns';
import type { FleetTelemetryFreshness } from '../../lib/api';
import type { VehicleData } from '../data/vehicles';
import type { VehicleOperationalUiProjection } from './operational-projection';
import type { FleetHealthDisplay, FleetHealthStatus, FleetReasonBadge, FleetTelemetryStatus } from './fleetVehicleDisplay';
import { classifyReasonBadgeDomain } from './fleet-reason-badge-domain';
import { OPERATIONAL_AVAILABILITY_STATE } from './operational-availability/types';
import { HEALTH_EVALUABILITY_STATE } from './fleet-health-evaluation/types';
import type { OperationalStatusBadgeDisplay } from './vehicle-operational-booking-display';
import { selectOperationalStatus } from './vehicle-operational-state';

function connectivityTelemetryWarning(overall?: string, telemetry?: FleetTelemetryFreshness): boolean {
  if (telemetry === 'offline' || telemetry === 'no_signal') return true;
  if (overall === 'OFFLINE' || overall === 'NO_ACTIVE_DATA_SOURCE' || overall === 'INTEGRATION_ERROR') {
    return true;
  }
  return false;
}

export function resolveAvailabilityBadgeFromUi(
  ui: VehicleOperationalUiProjection,
  vehicle: VehicleData,
): OperationalStatusBadgeDisplay {
  const businessStatus = selectOperationalStatus(vehicle);
  const avail = ui.availability.presentation;

  if (!avail) {
    return {
      status: businessStatus,
      label: '—',
      tone: 'neutral',
      isUnknown: true,
      dataQualityHint: null,
      unreliableExplanation: null,
      showUnreliableCallout: false,
    };
  }

  return {
    status: businessStatus,
    label: avail.label,
    tone: avail.tone,
    isUnknown: avail.state === OPERATIONAL_AVAILABILITY_STATE.UNKNOWN,
    dataQualityHint: avail.tooltip,
    unreliableExplanation: null,
    showUnreliableCallout: false,
  };
}

export function resolveHealthDisplayFromUi(
  ui: VehicleOperationalUiProjection,
): FleetHealthDisplay {
  const health = ui.health.presentation;

  if (!health) {
    return {
      status: 'unknown',
      label: '—',
      tone: 'neutral',
      isEvaluable: false,
    };
  }

  if (!health.isEvaluable) {
    return {
      status: 'unknown',
      label: health.label,
      tone: health.tone,
      tooltip: health.tooltip,
      isEvaluable: false,
    };
  }

  const condition = health.condition.presentation?.state;
  let status: FleetHealthStatus = 'unknown';
  if (condition === 'good') status = 'good';
  else if (condition === 'warning') status = 'warning';
  else if (condition === 'critical') status = 'critical';
  else if (health.evaluability === HEALTH_EVALUABILITY_STATE.PARTIALLY_EVALUABLE) {
    status = 'unknown';
  }

  return {
    status,
    label: health.label,
    tone: health.tone,
    tooltip: health.tooltip,
    isEvaluable: health.isEvaluable,
  };
}

export function resolveTelemetryFromUi(ui: VehicleOperationalUiProjection): {
  telemetryStatus: FleetTelemetryStatus;
  telemetryLabel: string;
  showTelemetryWarning: boolean;
} {
  const telemetry = ui.connectivity.telemetryState.presentation;
  const overall = ui.connectivity.overallState.presentation?.state;

  if (!telemetry) {
    return {
      telemetryStatus: 'no_signal',
      telemetryLabel: '—',
      showTelemetryWarning: false,
    };
  }

  const telemetryStatus = telemetry.state as FleetTelemetryStatus;
  return {
    telemetryStatus,
    telemetryLabel: telemetry.label,
    showTelemetryWarning: connectivityTelemetryWarning(overall, telemetry.state),
  };
}

export function resolveReasonBadgeFromUi(
  ui: VehicleOperationalUiProjection,
  healthStatus: FleetHealthStatus,
): FleetReasonBadge | null {
  const primary = ui.operator.primaryReason.presentation ?? ui.attention.primaryReason.presentation;
  if (primary?.label) {
    const tone: StatusTone =
      healthStatus === 'critical' ? 'critical' : healthStatus === 'warning' ? 'watch' : 'neutral';
    const code = primary.code ?? null;
    return {
      text: primary.label,
      tone,
      code,
      domain: classifyReasonBadgeDomain(code),
      source: 'ui_projection',
    };
  }
  return null;
}
