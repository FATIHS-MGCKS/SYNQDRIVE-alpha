import {
  CHARGING_ENRICHMENT_MAX_RECHARGE_LOCATION_SPREAD_METERS,
  ERD_RECHARGE_END_LOCATION,
  ERD_RECHARGE_START_LOCATION,
} from './charging-station-enrichment.constants';
import {
  parseRechargeCoordinatePair,
  rechargeLocationSpreadMeters,
  type RechargeCoordinatePair,
} from './recharge-charging-enrichment-coordinate.util';

export type ChargingEnrichmentCoordinateOutcome =
  | {
      status: 'SELECTED';
      latitude: number;
      longitude: number;
      source: typeof ERD_RECHARGE_START_LOCATION | typeof ERD_RECHARGE_END_LOCATION;
      spreadMeters?: number;
    }
  | { status: 'NO_COORDINATES' }
  | {
      status: 'INCONSISTENT_COORDINATES';
      start: RechargeCoordinatePair;
      end: RechargeCoordinatePair;
      spreadMeters: number;
    };

export interface DeriveCanonicalChargingStationEnrichmentCoordinateInput {
  startLatitude: number | null;
  startLongitude: number | null;
  endLatitude: number | null;
  endLongitude: number | null;
  maxSpreadMeters?: number;
}

/**
 * Pure E6.3 coordinate policy — canonical E6.1 start/end pairs only; no midpoint synthesis.
 */
export function deriveCanonicalChargingStationEnrichmentCoordinate(
  input: DeriveCanonicalChargingStationEnrichmentCoordinateInput,
): ChargingEnrichmentCoordinateOutcome {
  const start = parseRechargeCoordinatePair(input.startLatitude, input.startLongitude);
  const end = parseRechargeCoordinatePair(input.endLatitude, input.endLongitude);
  const maxSpread =
    input.maxSpreadMeters ?? CHARGING_ENRICHMENT_MAX_RECHARGE_LOCATION_SPREAD_METERS;

  if (start && !end) {
    return {
      status: 'SELECTED',
      latitude: start.latitude,
      longitude: start.longitude,
      source: ERD_RECHARGE_START_LOCATION,
    };
  }

  if (!start && end) {
    return {
      status: 'SELECTED',
      latitude: end.latitude,
      longitude: end.longitude,
      source: ERD_RECHARGE_END_LOCATION,
    };
  }

  if (!start && !end) {
    return { status: 'NO_COORDINATES' };
  }

  const spreadMeters = rechargeLocationSpreadMeters(start!, end!);
  if (spreadMeters > maxSpread) {
    return {
      status: 'INCONSISTENT_COORDINATES',
      start: start!,
      end: end!,
      spreadMeters,
    };
  }

  return {
    status: 'SELECTED',
    latitude: start!.latitude,
    longitude: start!.longitude,
    source: ERD_RECHARGE_START_LOCATION,
    spreadMeters,
  };
}
