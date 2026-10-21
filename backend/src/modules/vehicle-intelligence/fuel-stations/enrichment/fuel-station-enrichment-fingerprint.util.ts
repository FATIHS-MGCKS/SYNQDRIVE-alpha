import { createHash } from 'crypto';
import { FUEL_STATION_RESOLVER_VERSION } from '../fuel-station-location.types';

function roundCoordinate(value: number): string {
  return value.toFixed(7);
}

/**
 * Deterministic fingerprint for resolver input staleness detection.
 * Includes only fields that materially affect station resolution.
 */
export function buildFuelStationEnrichmentInputFingerprint(input: {
  energyEventId: string;
  latitude: number;
  longitude: number;
  resolverVersion?: string;
}): string {
  const resolverVersion = input.resolverVersion ?? FUEL_STATION_RESOLVER_VERSION;
  const canonical = [
    input.energyEventId,
    roundCoordinate(input.latitude),
    roundCoordinate(input.longitude),
    resolverVersion,
  ].join('|');

  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

export function buildFuelStationEnrichmentJobIdempotencyKey(input: {
  energyEventId: string;
  inputFingerprint: string;
}): string {
  return `${input.energyEventId}:${input.inputFingerprint}`;
}
