/**
 * P0.3 — Minimal Fleet consumer contract for P0.2 operational availability.
 */
import type { AttentionState, ConnectivityRecommendedAction } from '../connectivity/domain/connectivity-domain.types';
import type {
  OperationalAvailabilityState,
  OperationalReasonCode,
  VehicleOperationalProjection,
} from './projection/vehicle-operational-projection.types';

export interface FleetOperationalAvailabilityDto {
  state: OperationalAvailabilityState;
  primaryReason: OperationalReasonCode | null;
  reasonCodes: OperationalReasonCode[];
  recommendedAction: ConnectivityRecommendedAction;
  attention: AttentionState;
  generatedAt: string;
}

export function toFleetOperationalAvailabilityDto(
  projection: VehicleOperationalProjection,
): FleetOperationalAvailabilityDto {
  return {
    state: projection.operationalAvailability,
    primaryReason: projection.operatorSummary.primaryReason,
    reasonCodes: projection.operatorSummary.reasonCodes,
    recommendedAction: projection.operatorSummary.recommendedAction,
    attention: projection.attention,
    generatedAt: projection.generatedAt,
  };
}

export const FLEET_OPERATIONAL_AVAILABILITY_UNKNOWN: FleetOperationalAvailabilityDto = {
  state: 'UNKNOWN',
  primaryReason: null,
  reasonCodes: [],
  recommendedAction: 'NONE',
  attention: 'NONE',
  generatedAt: new Date(0).toISOString(),
};
