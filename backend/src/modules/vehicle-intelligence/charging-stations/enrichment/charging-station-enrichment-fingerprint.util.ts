import { createHash } from 'crypto';
import { CHARGING_ENRICHMENT_COORDINATE_SELECTOR_VERSION } from './charging-station-enrichment.constants';
import { CHARGING_STATION_RESOLVER_VERSION } from '../charging-station-location.types';
import type { ChargingEnrichmentCoordinateOutcome } from './derive-canonical-charging-station-enrichment-coordinate';

function roundCoordinate(value: number): string {
  return value.toFixed(7);
}

function fingerprintMaterialFromCoordinateOutcome(
  outcome: ChargingEnrichmentCoordinateOutcome,
): string {
  switch (outcome.status) {
    case 'SELECTED':
      return [
        'selected',
        roundCoordinate(outcome.latitude),
        roundCoordinate(outcome.longitude),
        outcome.source,
      ].join('|');
    case 'NO_COORDINATES':
      return 'no_coordinates';
    case 'INCONSISTENT_COORDINATES':
      return [
        'inconsistent',
        roundCoordinate(outcome.start.latitude),
        roundCoordinate(outcome.start.longitude),
        roundCoordinate(outcome.end.latitude),
        roundCoordinate(outcome.end.longitude),
      ].join('|');
    default:
      return 'unknown';
  }
}

export function buildChargingStationEnrichmentInputFingerprint(input: {
  energyEventId: string;
  coordinateOutcome: ChargingEnrichmentCoordinateOutcome;
  coordinateSelectorVersion?: string;
  resolverVersion?: string;
}): string {
  const selectorVersion =
    input.coordinateSelectorVersion ?? CHARGING_ENRICHMENT_COORDINATE_SELECTOR_VERSION;
  const resolverVersion = input.resolverVersion ?? CHARGING_STATION_RESOLVER_VERSION;
  const coordinateMaterial = fingerprintMaterialFromCoordinateOutcome(input.coordinateOutcome);
  const canonical = [
    input.energyEventId,
    coordinateMaterial,
    selectorVersion,
    resolverVersion,
  ].join('|');
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

export function buildChargingStationEnrichmentJobIdempotencyKey(input: {
  energyEventId: string;
  inputFingerprint: string;
}): string {
  return `${input.energyEventId}:${input.inputFingerprint}`;
}
