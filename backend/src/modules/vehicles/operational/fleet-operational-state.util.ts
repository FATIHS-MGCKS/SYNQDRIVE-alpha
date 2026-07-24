export type FleetOperationalStatusToken =
  | 'AVAILABLE'
  | 'RESERVED'
  | 'ACTIVE_RENTED'
  | 'MAINTENANCE'
  | 'BLOCKED'
  | 'UNKNOWN';

export type FleetDataQualityState = 'RELIABLE' | 'DEGRADED' | 'UNAVAILABLE';

export interface FleetVehicleOperationalStateDto {
  status: FleetOperationalStatusToken;
  reason: string | null;
  source: string;
  derivedAt: string;
  dataQualityState: FleetDataQualityState;
  dataQualityReasons: string[];
  isReliable: boolean;
}

const DISPLAY_TO_TOKEN: Record<string, FleetOperationalStatusToken> = {
  Available: 'AVAILABLE',
  Reserved: 'RESERVED',
  'Active Rented': 'ACTIVE_RENTED',
  Maintenance: 'MAINTENANCE',
  Blocked: 'BLOCKED',
  Unknown: 'UNKNOWN',
};

export function fleetDisplayStatusToToken(displayStatus: string): FleetOperationalStatusToken {
  return DISPLAY_TO_TOKEN[displayStatus] ?? 'UNKNOWN';
}

export function buildFleetOperationalStateDto(input: {
  displayStatus: string;
  bookingContextLoadFailed?: boolean;
  derivedAt?: Date;
}): FleetVehicleOperationalStateDto {
  const derivedAt = (input.derivedAt ?? new Date()).toISOString();

  if (input.bookingContextLoadFailed) {
    return {
      status: 'UNKNOWN',
      reason: 'Buchungskontext konnte nicht geladen werden',
      source: 'vehicles.service:booking-context-load-failed',
      derivedAt,
      dataQualityState: 'UNAVAILABLE',
      dataQualityReasons: ['booking_context_load_failed'],
      isReliable: false,
    };
  }

  return {
    status: fleetDisplayStatusToToken(input.displayStatus),
    reason: null,
    source: 'vehicles.service:deriveFleetStatusContext',
    derivedAt,
    dataQualityState: 'RELIABLE',
    dataQualityReasons: [],
    isReliable: true,
  };
}
