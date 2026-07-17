import type { FieldExtractionEvidence } from '@modules/ai/documents/document-extraction-merge.service';
import {
  VEHICLE_CANDIDATE_CONFLICT_CODES,
  VEHICLE_CANDIDATE_MATCH_REASONS,
  type VehicleCandidateConflict,
  type VehicleCandidateMatch,
  type VehicleCandidateMatchReason,
  type VehicleCandidateResolverInput,
  type VehicleCandidateSearchRecord,
  type VehicleResolverHints,
} from './vehicle-candidate-resolver.types';

const PLAUSIBLE_CONFIDENCE_THRESHOLD = 0.55;
const HIGH_CONFIDENCE_THRESHOLD = 0.85;
const OCR_UNCERTAINTY_PENALTY = 0.85;

const MATCH_BASE_SCORE: Record<VehicleCandidateMatchReason, number> = {
  [VEHICLE_CANDIDATE_MATCH_REASONS.VIN_EXACT]: 0.98,
  [VEHICLE_CANDIDATE_MATCH_REASONS.LICENSE_PLATE_EXACT]: 0.82,
  [VEHICLE_CANDIDATE_MATCH_REASONS.LICENSE_PLATE_FUZZY]: 0.68,
  [VEHICLE_CANDIDATE_MATCH_REASONS.MAKE_MODEL]: 0.42,
  [VEHICLE_CANDIDATE_MATCH_REASONS.FLEET_NUMBER]: 0.6,
  [VEHICLE_CANDIDATE_MATCH_REASONS.DOCUMENT_CONTEXT]: 0.72,
  [VEHICLE_CANDIDATE_MATCH_REASONS.BOOKING_REFERENCE]: 0.78,
};

export function normalizeVehicleVin(value: unknown): string | null {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  return raw.toUpperCase().replace(/[\s\-._/]+/g, '');
}

export function normalizeVehiclePlate(value: unknown): string | null {
  return normalizeVehicleVin(value);
}

function toStr(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  return null;
}

export function buildVehicleResolverHints(
  input: VehicleCandidateResolverInput,
): VehicleResolverHints {
  const data = input.extractedData;
  const ocrUncertaintyFields: string[] = [];

  for (const evidence of input.fieldEvidence ?? []) {
    if (!evidence.conflict) continue;
    if (evidence.key === 'vin' || evidence.key === 'licensePlate') {
      ocrUncertaintyFields.push(evidence.key);
    }
  }

  return {
    licensePlate: toStr(data.licensePlate),
    vin: toStr(data.vin),
    make: toStr(data.make),
    model: toStr(data.model),
    fleetNumber:
      toStr(data.fleetNumber) ??
      toStr(data.internalFleetNumber) ??
      toStr(data.vehicleNumber) ??
      toStr(data.vehicleName),
    bookingReference:
      toStr(data.bookingReference) ?? toStr(data.bookingId) ?? input.uploadContextBookingId ?? null,
    documentContextVehicleId: input.uploadContextVehicleId ?? null,
    ocrUncertaintyFields,
  };
}

interface ScoredCandidate {
  vehicleId: string;
  reasons: VehicleCandidateMatchReason[];
  conflicts: VehicleCandidateConflict[];
  score: number;
}

function pushReason(
  map: Map<string, ScoredCandidate>,
  vehicleId: string,
  reason: VehicleCandidateMatchReason,
  score: number,
) {
  const existing = map.get(vehicleId);
  if (existing) {
    if (!existing.reasons.includes(reason)) {
      existing.reasons.push(reason);
    }
    existing.score = Math.min(1, existing.score + score * 0.35);
    return;
  }
  map.set(vehicleId, { vehicleId, reasons: [reason], conflicts: [], score });
}

function plateMatchesHint(vehiclePlate: string | null, hint: string, fuzzy: boolean): boolean {
  const normalizedVehicle = normalizeVehiclePlate(vehiclePlate);
  const normalizedHint = normalizeVehiclePlate(hint);
  if (!normalizedVehicle || !normalizedHint) return false;
  if (normalizedVehicle === normalizedHint) return true;
  if (!fuzzy) return false;
  return (
    normalizedVehicle.includes(normalizedHint) ||
    normalizedHint.includes(normalizedVehicle)
  );
}

export function scoreVehicleCandidates(input: {
  vehicles: VehicleCandidateSearchRecord[];
  hints: VehicleResolverHints;
  bookingVehicleId?: string | null;
}): VehicleCandidateMatch[] {
  const { vehicles, hints, bookingVehicleId } = input;
  const scored = new Map<string, ScoredCandidate>();
  const plateUncertain = (hints.ocrUncertaintyFields ?? []).includes('licensePlate');
  const vinUncertain = (hints.ocrUncertaintyFields ?? []).includes('vin');

  for (const vehicle of vehicles) {
    const normalizedVin = normalizeVehicleVin(vehicle.vin);
    const hintVin = normalizeVehicleVin(hints.vin);

    if (hintVin && normalizedVin && hintVin === normalizedVin) {
      const base = MATCH_BASE_SCORE[VEHICLE_CANDIDATE_MATCH_REASONS.VIN_EXACT];
      pushReason(
        scored,
        vehicle.id,
        VEHICLE_CANDIDATE_MATCH_REASONS.VIN_EXACT,
        vinUncertain ? base * OCR_UNCERTAINTY_PENALTY : base,
      );
      if (vinUncertain) {
        const row = scored.get(vehicle.id);
        row?.conflicts.push({
          code: VEHICLE_CANDIDATE_CONFLICT_CODES.OCR_UNCERTAINTY,
          field: 'vin',
          message: 'OCR-VIN weist Unsicherheit auf',
          severity: 'WARNING',
        });
      }
    }

    if (hints.licensePlate) {
      const exact = plateMatchesHint(vehicle.licensePlate, hints.licensePlate, false);
      const fuzzy = !exact && plateMatchesHint(vehicle.licensePlate, hints.licensePlate, true);
      if (exact) {
        pushReason(
          scored,
          vehicle.id,
          plateUncertain
            ? VEHICLE_CANDIDATE_MATCH_REASONS.LICENSE_PLATE_FUZZY
            : VEHICLE_CANDIDATE_MATCH_REASONS.LICENSE_PLATE_EXACT,
          plateUncertain
            ? MATCH_BASE_SCORE[VEHICLE_CANDIDATE_MATCH_REASONS.LICENSE_PLATE_FUZZY]
            : MATCH_BASE_SCORE[VEHICLE_CANDIDATE_MATCH_REASONS.LICENSE_PLATE_EXACT],
        );
      } else if (fuzzy || plateUncertain) {
        pushReason(
          scored,
          vehicle.id,
          VEHICLE_CANDIDATE_MATCH_REASONS.LICENSE_PLATE_FUZZY,
          MATCH_BASE_SCORE[VEHICLE_CANDIDATE_MATCH_REASONS.LICENSE_PLATE_FUZZY],
        );
      }
      if (plateUncertain && (exact || fuzzy)) {
        const row = scored.get(vehicle.id);
        row?.conflicts.push({
          code: VEHICLE_CANDIDATE_CONFLICT_CODES.OCR_UNCERTAINTY,
          field: 'licensePlate',
          message: 'OCR-Kennzeichen weist Unsicherheit auf',
          severity: 'WARNING',
        });
      }
    }

    if (hints.make && hints.model) {
      const makeMatch =
        vehicle.make.trim().toLowerCase() === hints.make.trim().toLowerCase();
      const modelMatch =
        vehicle.model.trim().toLowerCase() === hints.model.trim().toLowerCase();
      if (makeMatch && modelMatch) {
        pushReason(
          scored,
          vehicle.id,
          VEHICLE_CANDIDATE_MATCH_REASONS.MAKE_MODEL,
          MATCH_BASE_SCORE[VEHICLE_CANDIDATE_MATCH_REASONS.MAKE_MODEL],
        );
      }
    }

    if (hints.fleetNumber && vehicle.vehicleName) {
      const fleetNorm = normalizeVehiclePlate(hints.fleetNumber);
      const nameNorm = normalizeVehiclePlate(vehicle.vehicleName);
      if (fleetNorm && nameNorm && fleetNorm === nameNorm) {
        pushReason(
          scored,
          vehicle.id,
          VEHICLE_CANDIDATE_MATCH_REASONS.FLEET_NUMBER,
          MATCH_BASE_SCORE[VEHICLE_CANDIDATE_MATCH_REASONS.FLEET_NUMBER],
        );
      }
    }

    if (hints.documentContextVehicleId && hints.documentContextVehicleId === vehicle.id) {
      pushReason(
        scored,
        vehicle.id,
        VEHICLE_CANDIDATE_MATCH_REASONS.DOCUMENT_CONTEXT,
        MATCH_BASE_SCORE[VEHICLE_CANDIDATE_MATCH_REASONS.DOCUMENT_CONTEXT],
      );
    }

    if (bookingVehicleId && bookingVehicleId === vehicle.id) {
      pushReason(
        scored,
        vehicle.id,
        VEHICLE_CANDIDATE_MATCH_REASONS.BOOKING_REFERENCE,
        MATCH_BASE_SCORE[VEHICLE_CANDIDATE_MATCH_REASONS.BOOKING_REFERENCE],
      );
    }
  }

  return finalizeRankedCandidates([...scored.values()]);
}

function finalizeRankedCandidates(scored: ScoredCandidate[]): VehicleCandidateMatch[] {
  const sorted = scored
    .map((row) => ({
      vehicleId: row.vehicleId,
      confidence: Math.min(1, Math.round(row.score * 1000) / 1000),
      matchReasons: sortReasons(row.reasons),
      conflicts: row.conflicts,
      rank: 0,
      confirmationRequired: true,
    }))
    .sort((a, b) => b.confidence - a.confidence || a.vehicleId.localeCompare(b.vehicleId));

  const plausible = sorted.filter((c) => c.confidence >= PLAUSIBLE_CONFIDENCE_THRESHOLD);
  const multiplePlausible = plausible.length > 1;

  return sorted.map((candidate, index) => {
    const confirmationRequired =
      multiplePlausible ||
      candidate.conflicts.some((c) => c.severity === 'BLOCKER') ||
      candidate.confidence < HIGH_CONFIDENCE_THRESHOLD ||
      candidate.conflicts.length > 0;

    return {
      ...candidate,
      rank: index + 1,
      confirmationRequired,
    };
  });
}

function sortReasons(reasons: VehicleCandidateMatchReason[]): VehicleCandidateMatchReason[] {
  const priority: VehicleCandidateMatchReason[] = [
    VEHICLE_CANDIDATE_MATCH_REASONS.VIN_EXACT,
    VEHICLE_CANDIDATE_MATCH_REASONS.LICENSE_PLATE_EXACT,
    VEHICLE_CANDIDATE_MATCH_REASONS.LICENSE_PLATE_FUZZY,
    VEHICLE_CANDIDATE_MATCH_REASONS.BOOKING_REFERENCE,
    VEHICLE_CANDIDATE_MATCH_REASONS.DOCUMENT_CONTEXT,
    VEHICLE_CANDIDATE_MATCH_REASONS.FLEET_NUMBER,
    VEHICLE_CANDIDATE_MATCH_REASONS.MAKE_MODEL,
  ];
  return [...reasons].sort(
    (a, b) => priority.indexOf(a) - priority.indexOf(b),
  );
}

export function detectVinPlateSignalBlocker(input: {
  hints: VehicleResolverHints;
  vehicles: VehicleCandidateSearchRecord[];
}): { blockerPresent: boolean; conflicts: VehicleCandidateConflict[] } {
  const hintVin = normalizeVehicleVin(input.hints.vin);
  const hintPlate = normalizeVehiclePlate(input.hints.licensePlate);
  if (!hintVin || !hintPlate) {
    return { blockerPresent: false, conflicts: [] };
  }

  const vinVehicleId = input.vehicles.find(
    (v) => normalizeVehicleVin(v.vin) === hintVin,
  )?.id;
  const plateVehicleId = input.vehicles.find((v) =>
    plateMatchesHint(v.licensePlate, input.hints.licensePlate!, false),
  )?.id;

  if (!vinVehicleId || !plateVehicleId || vinVehicleId === plateVehicleId) {
    return { blockerPresent: false, conflicts: [] };
  }

  return {
    blockerPresent: true,
    conflicts: [
      {
        code: VEHICLE_CANDIDATE_CONFLICT_CODES.VIN_PLATE_MISMATCH,
        field: 'vin',
        message: 'OCR-VIN und OCR-Kennzeichen verweisen auf unterschiedliche Fahrzeuge',
        severity: 'BLOCKER',
      },
      {
        code: VEHICLE_CANDIDATE_CONFLICT_CODES.VIN_PLATE_MISMATCH,
        field: 'licensePlate',
        message: 'OCR-VIN und OCR-Kennzeichen verweisen auf unterschiedliche Fahrzeuge',
        severity: 'BLOCKER',
      },
    ],
  };
}

export function applyGlobalBlockerToCandidates(
  candidates: VehicleCandidateMatch[],
  globalConflicts: VehicleCandidateConflict[],
): VehicleCandidateMatch[] {
  if (globalConflicts.length === 0) return candidates;
  return candidates.map((candidate) => ({
    ...candidate,
    conflicts: [...candidate.conflicts, ...globalConflicts],
    confirmationRequired: true,
  }));
}

export function readVehicleCandidatePipelineState(
  plausibility: unknown,
): import('./vehicle-candidate-resolver.types').VehicleCandidatePipelineState | null {
  if (!plausibility || typeof plausibility !== 'object' || Array.isArray(plausibility)) {
    return null;
  }
  const pipeline = (plausibility as Record<string, unknown>)._pipeline;
  if (!pipeline || typeof pipeline !== 'object' || Array.isArray(pipeline)) {
    return null;
  }
  const vehicleCandidates = (pipeline as Record<string, unknown>).vehicleCandidates;
  if (!vehicleCandidates || typeof vehicleCandidates !== 'object' || Array.isArray(vehicleCandidates)) {
    return null;
  }
  return vehicleCandidates as import('./vehicle-candidate-resolver.types').VehicleCandidatePipelineState;
}

export function mapFieldEvidence(
  evidence: FieldExtractionEvidence[] | null | undefined,
): Array<{ key: string; conflict: boolean; candidateValues?: unknown[] }> {
  return (evidence ?? []).map((row) => ({
    key: row.key,
    conflict: row.conflict,
    candidateValues: row.candidateValues?.map((c) => c.value),
  }));
}
