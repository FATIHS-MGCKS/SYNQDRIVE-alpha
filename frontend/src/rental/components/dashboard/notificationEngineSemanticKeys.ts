import type { DashboardInsight, InsightType } from '../../DashboardInsightsContext';
import {
  createBookingIssueKey,
  createStationIssueKey,
  createVehicleIssueKey,
  serviceOverdueKeyForVehicle,
} from '../../lib/operational-issues';
import type { PickupTileItem, ReturnTileItem } from '../StatInlineDetail';
import type { DerivedOperationalInsight } from './deriveOperationalInsights';
import type { PredictiveOperationsInsight } from './derivePredictiveOperationsInsights';

/** Stable condition codes — never derived from visible title, locale, or render time. */
export type NotificationConditionCode =
  | 'driving_assessment_device_quality'
  | 'technical_observation_active'
  | 'battery_critical'
  | 'battery_warning'
  | 'tires_critical'
  | 'brakes_critical'
  | 'error_codes_active'
  | 'service_overdue'
  | 'service_window_available'
  | 'pickup_overdue'
  | 'return_overdue'
  | 'return_inspection_required'
  | 'station_shortage'
  | 'telemetry_soft_offline'
  | 'telemetry_offline'
  | 'derived_fleet_telemetry'
  | 'derived_handover_backlog'
  | string;

const INSIGHT_CONDITION: Partial<Record<InsightType, NotificationConditionCode>> = {
  DRIVING_ASSESSMENT_DEVICE_QUALITY: 'driving_assessment_device_quality',
  BATTERY_CRITICAL: 'battery_critical',
  TIRE_CRITICAL: 'tires_critical',
  BRAKE_CRITICAL: 'brakes_critical',
  SERVICE_OVERDUE: 'service_overdue',
  SERVICE_WINDOW: 'service_window_available',
  PICKUP_OVERDUE: 'pickup_overdue',
  RETURN_OVERDUE: 'return_overdue',
  RETURN_NEEDS_INSPECTION: 'return_inspection_required',
  STATION_SHORTAGE: 'station_shortage',
};

export function semanticKeyForDashboardInsight(
  insight: Pick<DashboardInsight, 'type' | 'entityIds'>,
  entityId?: string,
): string | undefined {
  const id = entityId ?? insight.entityIds?.[0];
  if (!id) return undefined;

  const condition = INSIGHT_CONDITION[insight.type];
  if (!condition) return undefined;

  switch (insight.type) {
    case 'SERVICE_OVERDUE':
      return serviceOverdueKeyForVehicle(id);
    case 'SERVICE_WINDOW':
      return `vehicle:${id}:service_window:available`;
    case 'PICKUP_OVERDUE':
      return createBookingIssueKey(id, 'booking', 'pickup_overdue');
    case 'RETURN_OVERDUE':
    case 'RETURN_NEEDS_INSPECTION':
      return createBookingIssueKey(
        id,
        'return',
        insight.type === 'RETURN_OVERDUE' ? 'overdue' : 'inspection_required',
      );
    case 'STATION_SHORTAGE':
      return createStationIssueKey(id, 'shortage');
    default:
      return createVehicleIssueKey(id, 'vehicle_health', condition);
  }
}

export function semanticKeyForPickupItem(item: PickupTileItem): string | undefined {
  if (!item.bookingId) return undefined;
  if (item.isOverdue) {
    return createBookingIssueKey(item.bookingId, 'booking', 'pickup_overdue');
  }
  return createBookingIssueKey(item.bookingId, 'booking', 'pickup_scheduled');
}

export function semanticKeyForReturnItem(item: ReturnTileItem): string | undefined {
  if (!item.bookingId) return undefined;
  if (item.isOverdue) {
    return createBookingIssueKey(item.bookingId, 'return', 'overdue');
  }
  if (item.hasError) {
    return createBookingIssueKey(item.bookingId, 'return', 'inspection_required');
  }
  return createBookingIssueKey(item.bookingId, 'return', 'return_scheduled');
}

export function semanticKeyForDerivedInsight(insight: DerivedOperationalInsight): string {
  if (insight.id === 'derived-fleet-soft-offline-telemetry') {
    return 'fleet:operations:derived_fleet_telemetry';
  }
  if (insight.id === 'derived-handover-backlog') {
    return 'fleet:handover:derived_handover_backlog';
  }
  return `derived:${insight.category}:${insight.id}`;
}

export function semanticKeyForPredictiveInsight(insight: PredictiveOperationsInsight): string {
  const vehicleId =
    insight.vehicleId ??
    (insight.affectedEntity.kind === 'vehicle' ? insight.affectedEntity.vehicleId : undefined) ??
    (insight.affectedEntity.kind === 'booking' ? insight.affectedEntity.vehicleId : undefined);
  const bookingId =
    insight.bookingId ??
    (insight.affectedEntity.kind === 'booking' ? insight.affectedEntity.bookingId : undefined);
  const stationId =
    insight.stationId ??
    (insight.affectedEntity.kind === 'station' ? insight.affectedEntity.stationId : undefined);

  switch (insight.type) {
    case 'SOFT_OFFLINE_TELEMETRY_CHECK':
      return vehicleId
        ? createVehicleIssueKey(vehicleId, 'telemetry', 'soft_offline')
        : insight.id;
    case 'RETURN_OVERDUE_THREATENS_FOLLOWUP':
      return bookingId ? createBookingIssueKey(bookingId, 'return', 'overdue') : insight.id;
    case 'STATION_SHORTAGE_24H':
      return stationId ? createStationIssueKey(stationId, 'shortage') : insight.id;
    default:
      if (vehicleId && bookingId) {
        return `vehicle:${vehicleId}:booking:${bookingId}:${insight.type.toLowerCase()}`;
      }
      if (vehicleId) {
        return createVehicleIssueKey(vehicleId, 'rental_readiness', insight.type.toLowerCase());
      }
      return `predictive:${insight.type.toLowerCase()}:${insight.id}`;
  }
}

/** Driving-assessment adapter feed — keyed by vehicle, not title/time. */
export function semanticKeyForDrivingAssessmentNotification(vehicleId: string): string {
  return createVehicleIssueKey(vehicleId, 'vehicle_health', 'driving_assessment_device_quality');
}
