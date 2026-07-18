import { BadRequestException, GoneException } from '@nestjs/common';
import {
  STATION_SET_VEHICLES_DEPRECATED_CODE,
  STATION_SET_VEHICLES_DISABLED_CODE,
  STATION_SET_VEHICLES_DISABLE_FLAG,
  STATION_SET_VEHICLES_REPLACEMENT_METHOD,
  STATION_SET_VEHICLES_REPLACEMENT_PATH,
} from './station-set-vehicles-deprecation.constants';
import type { StationSetVehiclesPolicyIssue } from '@shared/stations/station-set-vehicles.policy';

export interface StationSetVehiclesDeprecationMetadata {
  deprecated: true;
  code: typeof STATION_SET_VEHICLES_DEPRECATED_CODE;
  message: string;
  replacement: {
    method: typeof STATION_SET_VEHICLES_REPLACEMENT_METHOD;
    path: typeof STATION_SET_VEHICLES_REPLACEMENT_PATH;
    command: 'ChangeVehicleHomeStation';
  };
  disableFlag: typeof STATION_SET_VEHICLES_DISABLE_FLAG;
}

export function isStationSetVehiclesDisabled(): boolean {
  return process.env[STATION_SET_VEHICLES_DISABLE_FLAG] === 'true';
}

export function buildStationSetVehiclesDeprecationMetadata(): StationSetVehiclesDeprecationMetadata {
  return {
    deprecated: true,
    code: STATION_SET_VEHICLES_DEPRECATED_CODE,
    message:
      'PUT /stations/:id/vehicles (SET semantics) is deprecated. Use POST /stations/vehicles/change-home-station per vehicle. Implicit detach from partial lists is forbidden.',
    replacement: {
      method: STATION_SET_VEHICLES_REPLACEMENT_METHOD,
      path: STATION_SET_VEHICLES_REPLACEMENT_PATH,
      command: 'ChangeVehicleHomeStation',
    },
    disableFlag: STATION_SET_VEHICLES_DISABLE_FLAG,
  };
}

export function throwStationSetVehiclesDisabled(): never {
  throw new GoneException({
    statusCode: 410,
    code: STATION_SET_VEHICLES_DISABLED_CODE,
    message:
      'PUT /stations/:id/vehicles is disabled. Use POST /stations/vehicles/change-home-station per vehicle instead.',
    replacement: buildStationSetVehiclesDeprecationMetadata().replacement,
    disableFlag: STATION_SET_VEHICLES_DISABLE_FLAG,
  });
}

export function throwStationSetVehiclesPolicyBlocked(
  blockingReasons: StationSetVehiclesPolicyIssue[],
): never {
  throw new BadRequestException({
    message:
      blockingReasons[0]?.message ??
      'SET vehicle assignment is not allowed for this payload',
    code: blockingReasons[0]?.code ?? 'STATION_SET_VEHICLES_BLOCKED',
    blockingReasons,
    deprecation: buildStationSetVehiclesDeprecationMetadata(),
  });
}
