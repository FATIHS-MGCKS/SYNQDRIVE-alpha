import { BadRequestException, ConflictException } from '@nestjs/common';
import { StationConcurrencyErrorCode } from './station-optimistic-concurrency.constants';

export function parseExpectedUpdatedAt(value: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException('expectedUpdatedAt must be a valid ISO-8601 timestamp');
  }
  return parsed;
}

export function stationUpdatedAtMatches(expected: Date, actual: Date): boolean {
  return expected.getTime() === actual.getTime();
}

export function assertStationUpdatedAtMatches(input: {
  expectedUpdatedAt: string;
  actualUpdatedAt: Date;
  resourceLabel?: string;
}): void {
  const expected = parseExpectedUpdatedAt(input.expectedUpdatedAt);
  if (stationUpdatedAtMatches(expected, input.actualUpdatedAt)) {
    return;
  }

  throw new ConflictException({
    message: `${input.resourceLabel ?? 'Station'} was updated by another request. Reload and retry.`,
    code: StationConcurrencyErrorCode.STATION_UPDATED_AT_CONFLICT,
    expectedUpdatedAt: expected.toISOString(),
    actualUpdatedAt: input.actualUpdatedAt.toISOString(),
  });
}

export function assertStationPositionVersionMatches(input: {
  expectedVersion: number;
  actualVersion: number;
  resourceLabel?: string;
}): void {
  if (input.expectedVersion === input.actualVersion) {
    return;
  }

  throw new ConflictException({
    message: `${input.resourceLabel ?? 'Vehicle station position'} version conflict. Reload and retry.`,
    code: StationConcurrencyErrorCode.STATION_POSITION_VERSION_CONFLICT,
    expectedVersion: input.expectedVersion,
    actualVersion: input.actualVersion,
  });
}

export function buildStationPositionVersionConflictIssue(message?: string) {
  return {
    code: StationConcurrencyErrorCode.STATION_POSITION_VERSION_CONFLICT,
    message:
      message ??
      'Vehicle station position version conflict. Reload the vehicle and retry the operation.',
  };
}
