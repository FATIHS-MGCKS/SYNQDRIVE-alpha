import type { RawRefuelCandidateLifecycleState } from '@prisma/client';

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
  readonly code = 'MULTIPLE_SAME_PHYSICAL_RISE';

  constructor(
    readonly vehicleId: string,
    readonly candidateIds: string[],
  ) {
    super(
      `Ambiguous raw refuel candidate rediscovery for vehicle ${vehicleId}: ${candidateIds.join(', ')}`,
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
