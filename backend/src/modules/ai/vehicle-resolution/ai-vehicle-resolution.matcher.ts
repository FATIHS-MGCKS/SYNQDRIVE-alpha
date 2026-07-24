import { VehicleStatus } from '@prisma/client';
import {
  normalizeVehiclePlate,
  normalizeVehicleVin,
} from '@modules/document-extraction/vehicle-candidate-matching.util';
import type { AiAllowedVehicleScope } from '../execution/ai-execution-context.types';
import {
  AI_VEHICLE_AMBIGUITY_DELTA,
  AI_VEHICLE_MATCH_BASE_SCORE,
  AI_VEHICLE_MIN_CONFIDENCE,
  type AiVehicleMatchType,
} from './ai-vehicle-resolution.enums';
import {
  buildAiVehicleDisplayName,
  sanitizeAiVehicleLlmField,
} from './ai-vehicle-resolution.hints';
import type {
  AiVehicleAllowedDataScope,
  AiVehicleResolutionAmbiguity,
  AiVehicleResolutionCandidate,
  AiVehicleResolutionHints,
  AiVehicleResolutionRecord,
  AiVehicleResolutionResult,
  ResolveAiVehicleFromMessageInput,
  ScoredAiVehicleMatch,
} from './ai-vehicle-resolution.types';
import { extractAiVehicleResolutionHints } from './ai-vehicle-resolution.hints';

function isOperationalStatus(status: VehicleStatus): boolean {
  return status !== VehicleStatus.OUT_OF_SERVICE;
}

function isVehicleInStationScope(
  vehicle: AiVehicleResolutionRecord,
  scope?: AiAllowedVehicleScope,
): boolean {
  if (!scope || scope.mode === 'all' || scope.stationBypass) {
    return true;
  }

  if (scope.vehicleIds && scope.vehicleIds.length > 0) {
    return scope.vehicleIds.includes(vehicle.vehicleId);
  }

  const stationId = vehicle.currentStationId;
  const allowedStations = scope.effectiveStationIds ?? [];
  return Boolean(stationId && allowedStations.includes(stationId));
}

function pushMatch(
  matches: Map<string, ScoredAiVehicleMatch>,
  vehicleId: string,
  matchType: AiVehicleMatchType,
): void {
  const confidence = AI_VEHICLE_MATCH_BASE_SCORE[matchType];
  const existing = matches.get(vehicleId);

  if (!existing || confidence > existing.confidence) {
    matches.set(vehicleId, { vehicleId, matchType, confidence });
    return;
  }

  if (confidence === existing.confidence && rankMatchType(matchType) < rankMatchType(existing.matchType)) {
    matches.set(vehicleId, { vehicleId, matchType, confidence });
  }
}

function rankMatchType(matchType: AiVehicleMatchType): number {
  const order: AiVehicleMatchType[] = [
    'internal_id',
    'vin_exact',
    'license_plate_exact',
    'dimo_token_id',
    'booking_assignment',
    'vehicle_name_exact',
    'license_plate_in_message',
    'make_model_exact',
    'make_model_partial',
    'none',
  ];
  return order.indexOf(matchType);
}

function scoreFleetMatches(
  fleet: readonly AiVehicleResolutionRecord[],
  hints: AiVehicleResolutionHints,
): ScoredAiVehicleMatch[] {
  const matches = new Map<string, ScoredAiVehicleMatch>();
  const hintVin = hints.vin ? normalizeVehicleVin(hints.vin) : null;
  const hintPlate = hints.licensePlate ? normalizeVehiclePlate(hints.licensePlate) : null;
  const messageNorm = normalizeVehiclePlate(hints.sanitizedMessage);
  const hintNameNorm = hints.vehicleName
    ? normalizeVehiclePlate(hints.vehicleName)
    : null;

  for (const vehicle of fleet) {
    if (hints.internalVehicleId && vehicle.vehicleId.toLowerCase() === hints.internalVehicleId.toLowerCase()) {
      pushMatch(matches, vehicle.vehicleId, 'internal_id');
    }

    const vehicleVin = normalizeVehicleVin(vehicle.vin);
    if (hintVin && vehicleVin && hintVin === vehicleVin) {
      pushMatch(matches, vehicle.vehicleId, 'vin_exact');
    }

    const vehiclePlate = normalizeVehiclePlate(vehicle.licensePlate);
    if (hintPlate && vehiclePlate) {
      if (hintPlate === vehiclePlate) {
        pushMatch(matches, vehicle.vehicleId, 'license_plate_exact');
      } else if (
        messageNorm &&
        messageNorm.includes(vehiclePlate) &&
        vehiclePlate.length >= 4
      ) {
        pushMatch(matches, vehicle.vehicleId, 'license_plate_in_message');
      }
    } else if (messageNorm && vehiclePlate && messageNorm === vehiclePlate) {
      pushMatch(matches, vehicle.vehicleId, 'license_plate_exact');
    } else if (
      messageNorm &&
      vehiclePlate &&
      messageNorm.includes(vehiclePlate) &&
      vehiclePlate.length >= 4
    ) {
      pushMatch(matches, vehicle.vehicleId, 'license_plate_in_message');
    }

    if (hints.tokenId != null && vehicle.tokenId === hints.tokenId) {
      pushMatch(matches, vehicle.vehicleId, 'dimo_token_id');
    }

    if (hints.bookingVehicleId && hints.bookingVehicleId === vehicle.vehicleId) {
      pushMatch(matches, vehicle.vehicleId, 'booking_assignment');
    }

    const vehicleNameNorm = vehicle.vehicleName
      ? normalizeVehiclePlate(vehicle.vehicleName)
      : null;
    if (hintNameNorm && vehicleNameNorm && hintNameNorm === vehicleNameNorm) {
      pushMatch(matches, vehicle.vehicleId, 'vehicle_name_exact');
    }

    const makeMatch =
      hints.make &&
      vehicle.make.trim().toLowerCase() === hints.make.trim().toLowerCase();
    const modelMatch =
      hints.model &&
      vehicle.model.trim().toLowerCase() === hints.model.trim().toLowerCase();

    if (makeMatch && modelMatch) {
      pushMatch(matches, vehicle.vehicleId, 'make_model_exact');
    } else if (modelMatch) {
      pushMatch(matches, vehicle.vehicleId, 'make_model_partial');
    }
  }

  return [...matches.values()].sort(
    (left, right) =>
      right.confidence - left.confidence ||
      rankMatchType(left.matchType) - rankMatchType(right.matchType) ||
      left.vehicleId.localeCompare(right.vehicleId),
  );
}

function toCandidate(
  vehicle: AiVehicleResolutionRecord,
  match: ScoredAiVehicleMatch,
): AiVehicleResolutionCandidate {
  return {
    vehicleId: vehicle.vehicleId,
    displayName: buildAiVehicleDisplayName(vehicle),
    licensePlate: vehicle.licensePlate,
    matchType: match.matchType,
    confidence: match.confidence,
    operational: isOperationalStatus(vehicle.status),
  };
}

function buildAllowedDataScope(
  vehicle: AiVehicleResolutionRecord | null,
  scope?: AiAllowedVehicleScope,
): AiVehicleAllowedDataScope {
  if (!vehicle) {
    return {
      inOrganization: false,
      inStationScope: false,
      hasDimoTelemetry: false,
      operational: false,
      vehicleStatus: null,
    };
  }

  return {
    inOrganization: true,
    inStationScope: isVehicleInStationScope(vehicle, scope),
    hasDimoTelemetry: typeof vehicle.tokenId === 'number' && vehicle.tokenId > 0,
    operational: isOperationalStatus(vehicle.status),
    vehicleStatus: vehicle.status,
  };
}

function buildAmbiguity(
  plausible: ScoredAiVehicleMatch[],
  fleet: readonly AiVehicleResolutionRecord[],
): AiVehicleResolutionAmbiguity {
  const fleetById = new Map(fleet.map((vehicle) => [vehicle.vehicleId, vehicle]));
  const candidates = plausible
    .map((match) => {
      const vehicle = fleetById.get(match.vehicleId);
      return vehicle ? toCandidate(vehicle, match) : null;
    })
    .filter((candidate): candidate is AiVehicleResolutionCandidate => candidate != null);

  if (candidates.length <= 1) {
    return {
      isAmbiguous: false,
      reason: null,
      candidates,
    };
  }

  const topConfidence = candidates[0]?.confidence ?? 0;
  const closeCandidates = candidates.filter(
    (candidate) => topConfidence - candidate.confidence <= AI_VEHICLE_AMBIGUITY_DELTA,
  );

  if (closeCandidates.length <= 1) {
    return {
      isAmbiguous: false,
      reason: null,
      candidates: [candidates[0]],
    };
  }

  return {
    isAmbiguous: true,
    reason: 'multiple_vehicles_match',
    candidates: closeCandidates,
  };
}

export function resolveAiVehicleFromMessage(
  input: ResolveAiVehicleFromMessageInput,
): AiVehicleResolutionResult {
  const orgFleet = input.fleet.filter(
    (vehicle) => vehicle.organizationId === input.organizationId,
  );

  const hints = extractAiVehicleResolutionHints({
    message: input.message,
    fleet: orgFleet,
    bookingId: input.bookingId,
    bookingVehicleId: input.bookingVehicleId,
  });

  const scored = scoreFleetMatches(orgFleet, hints);
  const plausible = scored.filter((match) => match.confidence >= AI_VEHICLE_MIN_CONFIDENCE);
  const ambiguity = buildAmbiguity(plausible, orgFleet);

  if (plausible.length === 0 || ambiguity.isAmbiguous) {
    return {
      resolvedVehicleId: null,
      displayName: null,
      licensePlate: null,
      matchType: 'none',
      confidence: 0,
      ambiguity,
      allowedDataScope: buildAllowedDataScope(null, input.allowedVehicleScope),
    };
  }

  const winner = plausible[0];
  const vehicle = orgFleet.find((entry) => entry.vehicleId === winner.vehicleId);
  if (!vehicle || !isVehicleInStationScope(vehicle, input.allowedVehicleScope)) {
    return {
      resolvedVehicleId: null,
      displayName: null,
      licensePlate: null,
      matchType: 'none',
      confidence: 0,
      ambiguity: {
        isAmbiguous: false,
        reason: 'outside_station_scope',
        candidates: [],
      },
      allowedDataScope: buildAllowedDataScope(vehicle ?? null, input.allowedVehicleScope),
    };
  }

  return {
    resolvedVehicleId: vehicle.vehicleId,
    displayName: buildAiVehicleDisplayName(vehicle),
    licensePlate: vehicle.licensePlate,
    matchType: winner.matchType,
    confidence: winner.confidence,
    ambiguity,
    allowedDataScope: buildAllowedDataScope(vehicle, input.allowedVehicleScope),
  };
}

export function toLlmSafeVehicleCandidate(
  candidate: AiVehicleResolutionCandidate,
): { label: string; licensePlate: string | null; matchType: AiVehicleMatchType; confidence: number } {
  return {
    label: sanitizeAiVehicleLlmField(candidate.displayName),
    licensePlate: candidate.licensePlate
      ? sanitizeAiVehicleLlmField(candidate.licensePlate)
      : null,
    matchType: candidate.matchType,
    confidence: candidate.confidence,
  };
}
