import { GoneException } from '@nestjs/common';
import {
  STATION_DELETE_DEPRECATED_CODE,
  STATION_DELETE_REPLACEMENT_METHOD,
  STATION_DELETE_REPLACEMENT_PATH,
} from './station-delete-deprecation.constants';

export interface StationDeleteDeprecatedResponse {
  statusCode: 410;
  code: typeof STATION_DELETE_DEPRECATED_CODE;
  message: string;
  replacement: {
    method: typeof STATION_DELETE_REPLACEMENT_METHOD;
    path: typeof STATION_DELETE_REPLACEMENT_PATH;
    command: 'ArchiveStation';
  };
}

export function buildStationDeleteDeprecatedResponse(): StationDeleteDeprecatedResponse {
  return {
    statusCode: 410,
    code: STATION_DELETE_DEPRECATED_CODE,
    message:
      'DELETE /stations/:id is deprecated. Stations are archived, not hard-deleted. Use POST /stations/:id/archive instead.',
    replacement: {
      method: STATION_DELETE_REPLACEMENT_METHOD,
      path: STATION_DELETE_REPLACEMENT_PATH,
      command: 'ArchiveStation',
    },
  };
}

export function throwStationDeleteDeprecated(): never {
  throw new GoneException(buildStationDeleteDeprecatedResponse());
}
