export const StationSetVehiclesListCompleteness = {
  COMPLETE: 'COMPLETE',
  PARTIAL: 'PARTIAL',
} as const;

export type StationSetVehiclesListCompleteness =
  (typeof StationSetVehiclesListCompleteness)[keyof typeof StationSetVehiclesListCompleteness];

export const StationSetVehiclesPolicyIssueCode = {
  ENDPOINT_DISABLED: 'STATION_SET_VEHICLES_DISABLED',
  PARTIAL_LIST_DECLARED: 'STATION_SET_VEHICLES_PARTIAL_LIST',
  INCOMPLETE_STATION_HOME_LIST: 'STATION_SET_VEHICLES_INCOMPLETE_LIST',
  IMPLICIT_DETACH_FORBIDDEN: 'STATION_SET_VEHICLES_IMPLICIT_DETACH_FORBIDDEN',
} as const;

export type StationSetVehiclesPolicyIssueCode =
  (typeof StationSetVehiclesPolicyIssueCode)[keyof typeof StationSetVehiclesPolicyIssueCode];

export interface StationSetVehiclesPolicyIssue {
  code: StationSetVehiclesPolicyIssueCode | string;
  message: string;
  missingVehicleIds?: string[];
  missingCount?: number;
}

export interface StationSetVehiclesPolicyEvaluation {
  allowed: boolean;
  blockingReasons: StationSetVehiclesPolicyIssue[];
  wouldImplicitlyDetachIds: string[];
}

export function findImplicitHomeDetachIds(
  stationHomeVehicleIds: string[],
  requestedVehicleIds: string[],
): string[] {
  const requested = new Set(requestedVehicleIds);
  return stationHomeVehicleIds.filter((id) => !requested.has(id));
}

export function evaluateSetStationVehiclesPolicy(input: {
  disabledByFlag: boolean;
  stationHomeVehicleIds: string[];
  requestedVehicleIds: string[];
  listCompleteness?: StationSetVehiclesListCompleteness;
}): StationSetVehiclesPolicyEvaluation {
  const blockingReasons: StationSetVehiclesPolicyIssue[] = [];

  if (input.disabledByFlag) {
    blockingReasons.push({
      code: StationSetVehiclesPolicyIssueCode.ENDPOINT_DISABLED,
      message:
        'PUT /stations/:id/vehicles is disabled. Use POST /stations/vehicles/change-home-station per vehicle instead.',
    });
    return {
      allowed: false,
      blockingReasons,
      wouldImplicitlyDetachIds: [],
    };
  }

  if (input.listCompleteness === StationSetVehiclesListCompleteness.PARTIAL) {
    blockingReasons.push({
      code: StationSetVehiclesPolicyIssueCode.PARTIAL_LIST_DECLARED,
      message:
        'Partial vehicle lists cannot be applied via the deprecated SET endpoint. Use change-home-station per vehicle.',
    });
  }

  const wouldImplicitlyDetachIds = findImplicitHomeDetachIds(
    input.stationHomeVehicleIds,
    input.requestedVehicleIds,
  );

  if (wouldImplicitlyDetachIds.length > 0) {
    blockingReasons.push({
      code: StationSetVehiclesPolicyIssueCode.INCOMPLETE_STATION_HOME_LIST,
      message: `Payload is missing ${wouldImplicitlyDetachIds.length} vehicle(s) currently assigned to this station home fleet. Implicit detach is forbidden.`,
      missingVehicleIds: wouldImplicitlyDetachIds,
      missingCount: wouldImplicitlyDetachIds.length,
    });
    blockingReasons.push({
      code: StationSetVehiclesPolicyIssueCode.IMPLICIT_DETACH_FORBIDDEN,
      message:
        'Vehicles cannot be removed from a station home fleet because they are absent from the payload. Use change-home-station with newHomeStationId=null.',
    });
  }

  return {
    allowed: blockingReasons.length === 0,
    blockingReasons,
    wouldImplicitlyDetachIds,
  };
}
