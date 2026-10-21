import { createHash } from 'crypto';
import type { VehicleEnergyEvent } from '@prisma/client';

export function computeCoordinateEvidenceFingerprint(
  event: Pick<
    VehicleEnergyEvent,
    | 'fuelLevelRiseStart'
    | 'startTime'
    | 'endTime'
    | 'startLatitude'
    | 'startLongitude'
    | 'endLatitude'
    | 'endLongitude'
  >,
): string {
  const payload = {
    fuelLevelRiseStart: event.fuelLevelRiseStart?.toISOString() ?? null,
    startTime: event.startTime.toISOString(),
    endTime: event.endTime.toISOString(),
    startLatitude: event.startLatitude,
    startLongitude: event.startLongitude,
    endLatitude: event.endLatitude,
    endLongitude: event.endLongitude,
  };
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 16);
}

export function hasCoordinateEvidenceChanged(
  persistedFingerprint: string | null | undefined,
  currentFingerprint: string,
): boolean {
  if (!persistedFingerprint) return false;
  return persistedFingerprint !== currentFingerprint;
}
