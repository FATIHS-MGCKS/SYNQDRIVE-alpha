import { ForbiddenException } from '@nestjs/common';
import type { StationScopeErrorCodeValue } from './station-scope.constants';

export interface StationScopeForbiddenPayload {
  statusCode: 403;
  code: StationScopeErrorCodeValue;
  message: string;
  stationId?: string;
  mode?: string;
}

export class StationScopeForbiddenException extends ForbiddenException {
  constructor(payload: StationScopeForbiddenPayload) {
    super(payload);
    this.name = 'StationScopeForbiddenException';
  }
}

export function throwStationScopeForbidden(
  code: StationScopeErrorCodeValue,
  message: string,
  extra?: Pick<StationScopeForbiddenPayload, 'stationId' | 'mode'>,
): never {
  throw new StationScopeForbiddenException({
    statusCode: 403,
    code,
    message,
    ...extra,
  });
}
