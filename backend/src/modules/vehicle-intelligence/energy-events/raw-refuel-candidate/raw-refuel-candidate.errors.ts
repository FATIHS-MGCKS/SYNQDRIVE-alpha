import type { RawRefuelCandidateLifecycleState } from '@prisma/client';

export type RawRefuelCandidateAmbiguityReason =
  | 'MULTIPLE_SAME_PHYSICAL_RISE'
  | 'SAME_WITH_INSUFFICIENT_NEIGHBOR'
  | 'MULTIPLE_INSUFFICIENT_NEIGHBORS';

export class RawRefuelCandidateOrgVehicleIntegrityError extends Error {
  readonly code = 'ORG_VEHICLE_INTEGRITY_MISMATCH';

  constructor(
    readonly vehicleId: string,
    readonly expectedOrganizationId: string,
    readonly assertedOrganizationId: string,
  ) {
    super(
      `Vehicle ${vehicleId} belongs to organization ${expectedOrganizationId}, not ${assertedOrganizationId}`,
    );
    this.name = 'RawRefuelCandidateOrgVehicleIntegrityError';
  }
}

export class RawRefuelCandidateVehicleNotFoundError extends Error {
  readonly code = 'VEHICLE_NOT_FOUND';

  constructor(readonly vehicleId: string) {
    super(`Vehicle ${vehicleId} not found`);
    this.name = 'RawRefuelCandidateVehicleNotFoundError';
  }
}

export class RawRefuelCandidateAmbiguityError extends Error {
  readonly code = 'RAW_REFUEL_CANDIDATE_REDISCOVERY_AMBIGUITY';

  constructor(
    readonly reason: RawRefuelCandidateAmbiguityReason,
    readonly vehicleId: string,
    readonly candidateIds: string[],
  ) {
    super(
      `Ambiguous raw refuel candidate rediscovery (${reason}) for vehicle ${vehicleId}: ${candidateIds.join(', ')}`,
    );
    this.name = 'RawRefuelCandidateAmbiguityError';
  }
}

export class RawRefuelCandidateLifecycleTransitionError extends Error {
  readonly code = 'INVALID_LIFECYCLE_TRANSITION';

  constructor(
    readonly from: RawRefuelCandidateLifecycleState,
    readonly to: RawRefuelCandidateLifecycleState,
  ) {
    super(`Invalid RawRefuelCandidate lifecycle transition: ${from} → ${to}`);
    this.name = 'RawRefuelCandidateLifecycleTransitionError';
  }
}

export class RawRefuelCandidateLifecycleValidationError extends Error {
  readonly code = 'INVALID_LIFECYCLE_STATE';

  constructor(message: string) {
    super(message);
    this.name = 'RawRefuelCandidateLifecycleValidationError';
  }
}

export class RawRefuelCandidateVersionedTerminalConflictError extends Error {
  readonly code = 'RAW_REFUEL_CANDIDATE_VERSIONED_TERMINAL_CONFLICT';

  constructor(
    readonly vehicleId: string,
    readonly candidateIds: string[],
  ) {
    super(
      `Versioned terminal conflict for vehicle ${vehicleId}: ${candidateIds.join(', ')}`,
    );
    this.name = 'RawRefuelCandidateVersionedTerminalConflictError';
  }
}

export class RawRefuelCandidateUnsupportedDetectionVersionError extends Error {
  readonly code = 'RAW_REFUEL_CANDIDATE_UNSUPPORTED_DETECTION_VERSION';

  constructor(
    readonly vehicleId: string,
    readonly detectionVersion: string,
  ) {
    super(
      `Unsupported raw refuel candidate detectionVersion ${detectionVersion} for vehicle ${vehicleId}`,
    );
    this.name = 'RawRefuelCandidateUnsupportedDetectionVersionError';
  }
}

export class RawRefuelCandidateCrossVersionInsufficientEvidenceError extends Error {
  readonly code = 'RAW_REFUEL_CANDIDATE_CROSS_VERSION_INSUFFICIENT_EVIDENCE';

  constructor(
    readonly vehicleId: string,
    readonly candidateIds: string[],
  ) {
    super(
      `Cross-version insufficient evidence for vehicle ${vehicleId}: ${candidateIds.join(', ')}`,
    );
    this.name = 'RawRefuelCandidateCrossVersionInsufficientEvidenceError';
  }
}

export class RawRefuelCandidateV2RediscoveryInsufficientEvidenceError extends Error {
  readonly code = 'RAW_REFUEL_CANDIDATE_V2_REDISCOVERY_INSUFFICIENT_EVIDENCE';

  constructor(
    readonly vehicleId: string,
    readonly candidateIds: string[],
  ) {
    super(
      `v2→v2 rediscovery insufficient evidence for vehicle ${vehicleId}: ${candidateIds.join(', ')}`,
    );
    this.name = 'RawRefuelCandidateV2RediscoveryInsufficientEvidenceError';
  }
}
