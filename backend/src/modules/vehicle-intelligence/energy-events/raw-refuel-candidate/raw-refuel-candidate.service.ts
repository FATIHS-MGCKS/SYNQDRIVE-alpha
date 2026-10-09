import { Injectable } from '@nestjs/common';
import type { Prisma, RawRefuelCandidate } from '@prisma/client';
import { acquirePgAdvisoryXactLock64 } from '@shared/database/pg-advisory-lock.util';
import { PrismaService } from '@shared/database/prisma.service';
import {
  FixedRawRefuelCandidateClock,
  RawRefuelCandidateClock,
  SystemRawRefuelCandidateClock,
} from './raw-refuel-candidate-clock';
import { buildEvidenceRevisionFingerprint } from './raw-refuel-candidate-evidence-fingerprint';
import { mergeCandidateEvidence } from './raw-refuel-candidate-evidence-merge';
import {
  RawRefuelCandidateAmbiguityError,
  RawRefuelCandidateCrossVersionInsufficientEvidenceError,
  RawRefuelCandidateV2RediscoveryInsufficientEvidenceError,
  RawRefuelCandidateLifecycleValidationError,
  RawRefuelCandidateOrgVehicleIntegrityError,
  RawRefuelCandidateVehicleNotFoundError,
  RawRefuelCandidateUnsupportedDetectionVersionError,
  RawRefuelCandidateVersionedTerminalConflictError,
} from './raw-refuel-candidate.errors';
import {
  classifyCandidateDetectionVersionCompatibility,
  RFRF_PLANNED_SETTLED_POST_DETECTION_VERSION,
} from './raw-refuel-candidate-cross-version-compatibility.authority';
import {
  isV2SameVersionPair,
  isV2ShiftedIdentityBucketStaleAmbiguity,
} from './raw-refuel-candidate-v2-same-version-rediscovery.authority';
import {
  isSupportedCandidateDetectionVersionForIdentity,
  tryBuildCandidateIdentityKeyFromEvidence,
} from './raw-refuel-candidate-identity-key';
import {
  isRawRefuelCandidateTerminal,
  resolveNextLifecycleState,
} from './raw-refuel-candidate-lifecycle';
import { buildRawRefuelCandidateLockKey } from './raw-refuel-candidate-lock.util';
import {
  candidateToEvidenceSlice,
  classifyRawRefuelCandidateOverlap,
} from './raw-refuel-candidate.matcher';
import { computeRawRefuelCandidateRediscoveryWindow } from './raw-refuel-candidate-rediscovery-window';
import { RawRefuelCandidateRepository } from './raw-refuel-candidate.repository';
import type {
  RawRefuelCandidateObservation,
  RawRefuelCandidateOverlapClassification,
  RawRefuelCandidateResolveResult,
} from './raw-refuel-candidate.types';
import {
  lockRecoveryClaimForMutation,
  type RawRefuelCandidateRecoveryClaimIdentity,
  type RawRefuelCandidateRecoveryMutationContext,
} from './raw-refuel-candidate-recovery-fencing';

export type RawRefuelCandidateRecoveryReconcileResult =
  | { kind: 'APPLIED'; result: RawRefuelCandidateResolveResult }
  | { kind: 'STALE_CLAIM' };

@Injectable()
export class RawRefuelCandidateService {
  private readonly repository = new RawRefuelCandidateRepository();
  private readonly clock: RawRefuelCandidateClock;

  constructor(private readonly prisma: PrismaService) {
    this.clock = new SystemRawRefuelCandidateClock();
  }

  /** Deterministic clock for unit/integration tests without changing Nest DI contract. */
  static withClock(
    prisma: PrismaService,
    clock: RawRefuelCandidateClock,
  ): RawRefuelCandidateService {
    const service = new RawRefuelCandidateService(prisma);
    (service as unknown as { clock: RawRefuelCandidateClock }).clock = clock;
    return service;
  }

  static withFixedClock(
    prisma: PrismaService,
    isoTimestamp: string | Date,
  ): RawRefuelCandidateService {
    const fixed =
      isoTimestamp instanceof Date ? isoTimestamp : new Date(isoTimestamp);
    return RawRefuelCandidateService.withClock(
      prisma,
      new FixedRawRefuelCandidateClock(fixed),
    );
  }

  async resolveOrCreateCandidate(
    observation: RawRefuelCandidateObservation,
  ): Promise<RawRefuelCandidateResolveResult> {
    validateObservationLifecycleRequest(observation);
    assertSupportedObservationDetectionVersion(observation);
    const serviceNow = this.clock.now();

    return this.prisma.$transaction(async (tx) => {
      await acquirePgAdvisoryXactLock64(
        tx,
        buildRawRefuelCandidateLockKey(observation.vehicleId),
      );

      const organizationId = await this.repository.resolveAuthoritativeOrganizationId(
        tx,
        observation.vehicleId,
        observation.organizationId,
      );

      const window = computeRawRefuelCandidateRediscoveryWindow(observation, serviceNow);
      const candidates = await this.repository.findRediscoveryCandidatesInWindow(
        tx,
        observation.vehicleId,
        observation.signalChannel,
        window,
      );
      const classified = classifyRediscoveryCandidates(observation, candidates, organizationId);

      if (classified.versionedTerminalConflict.length > 0) {
        throw new RawRefuelCandidateVersionedTerminalConflictError(
          observation.vehicleId,
          classified.versionedTerminalConflict.map((row) => row.id),
        );
      }

      if (classified.crossVersionInsufficient.length > 0) {
        throw new RawRefuelCandidateCrossVersionInsufficientEvidenceError(
          observation.vehicleId,
          classified.crossVersionInsufficient.map((row) => row.id),
        );
      }

      if (classified.v2RediscoveryInsufficient.length > 0) {
        throw new RawRefuelCandidateV2RediscoveryInsufficientEvidenceError(
          observation.vehicleId,
          classified.v2RediscoveryInsufficient.map((row) => row.id),
        );
      }

      if (classified.same.length > 1) {
        throw new RawRefuelCandidateAmbiguityError(
          'MULTIPLE_SAME_PHYSICAL_RISE',
          observation.vehicleId,
          classified.same.map((row) => row.id),
        );
      }

      if (classified.same.length === 1 && classified.insufficient.length > 0) {
        throw new RawRefuelCandidateAmbiguityError(
          'SAME_WITH_INSUFFICIENT_NEIGHBOR',
          observation.vehicleId,
          [...classified.same, ...classified.insufficient].map((row) => row.id),
        );
      }

      if (classified.same.length === 1) {
        return this.reconcileExistingCandidate(
          tx,
          classified.same[0],
          observation,
          organizationId,
          serviceNow,
        );
      }

      if (classified.insufficient.length > 1) {
        throw new RawRefuelCandidateAmbiguityError(
          'MULTIPLE_INSUFFICIENT_NEIGHBORS',
          observation.vehicleId,
          classified.insufficient.map((row) => row.id),
        );
      }

      if (classified.insufficient.length === 1) {
        return this.reconcileExistingCandidate(
          tx,
          classified.insufficient[0],
          observation,
          organizationId,
          serviceNow,
        );
      }

      const mergedForLookup = mergeCandidateEvidence(null, observation, organizationId);
      const lookupIdentityKey = tryBuildCandidateIdentityKeyFromEvidence(mergedForLookup);
      if (lookupIdentityKey) {
        const byKey = await this.repository.findByIdentityKey(
          tx,
          observation.vehicleId,
          lookupIdentityKey,
        );
        if (byKey) {
          assertV2IdentityKeyFallbackReconcileAllowed(
            { ...observation, organizationId },
            byKey,
          );
          return this.reconcileExistingCandidate(
            tx,
            byKey,
            observation,
            organizationId,
            serviceNow,
          );
        }
      }

      assertNoV2ShiftedBucketDuplicateInsert(
        observation,
        organizationId,
        classified.distinct,
      );

      return this.insertCandidate(tx, observation, organizationId, serviceNow);
    });
  }

  private async reconcileExistingCandidate(
    tx: Prisma.TransactionClient,
    existing: RawRefuelCandidate,
    observation: RawRefuelCandidateObservation,
    organizationId: string,
    serviceNow: Date,
  ): Promise<RawRefuelCandidateResolveResult> {
    assertSupportedObservationDetectionVersion(observation);
    if (isRawRefuelCandidateTerminal(existing.lifecycleState)) {
      return toResolveResult(existing, { created: false, updated: false });
    }

    const mergedEvidence = mergeCandidateEvidence(existing, observation, organizationId);
    const evidenceRevisionFingerprint = buildEvidenceRevisionFingerprint(mergedEvidence);
    const candidateIdentityKey = resolveAssignedIdentityKey(existing, mergedEvidence);
    const nextLifecycle = resolveNextLifecycleState(
      existing.lifecycleState,
      observation.lifecycleState,
    );
    validateLifecycleWithIdentity(nextLifecycle, candidateIdentityKey, observation);

    const nextLastObservedAt =
      serviceNow > existing.lastObservedAt ? serviceNow : existing.lastObservedAt;
    const nextRejectionReason = observation.rejectionReason ?? null;

    const evidenceChanged =
      existing.evidenceRevisionFingerprint !== evidenceRevisionFingerprint ||
      existing.lifecycleState !== nextLifecycle ||
      existing.rejectionReason !== nextRejectionReason ||
      existing.candidateIdentityKey !== candidateIdentityKey ||
      existing.detectionVersion !== mergedEvidence.detectionVersion ||
      existing.detectorVersion !== mergedEvidence.detectorVersion;

    if (!evidenceChanged && nextLastObservedAt.getTime() === existing.lastObservedAt.getTime()) {
      return toResolveResult(existing, { created: false, updated: false });
    }

    if (
      !evidenceChanged &&
      nextLastObservedAt.getTime() !== existing.lastObservedAt.getTime()
    ) {
      const touched = await this.repository.touchLastObservedAt(
        tx,
        existing,
        nextLastObservedAt,
      );
      return toResolveResult(touched, { created: false, updated: true });
    }

    const updated = await this.repository.updateCandidateEvidence(tx, existing, {
      candidateIdentityKey,
      evidenceRevisionFingerprint,
      mergedEvidence,
      lastObservedAt: nextLastObservedAt,
      lifecycleState: nextLifecycle,
      rejectionReason: nextRejectionReason,
    });

    return toResolveResult(updated, { created: false, updated: true });
  }

  /**
   * F10.6.8-B — reconcile evidence into an existing row only (never inserts).
   */
  async reconcileExistingCandidateById(
    candidateId: string,
    observation: RawRefuelCandidateObservation,
  ): Promise<RawRefuelCandidateResolveResult> {
    validateObservationLifecycleRequest(observation);
    const serviceNow = this.clock.now();

    return this.prisma.$transaction(async (tx) => {
      const existing = await this.repository.findById(tx, candidateId);
      if (!existing) {
        throw new RawRefuelCandidateVehicleNotFoundError(observation.vehicleId);
      }
      if (existing.vehicleId !== observation.vehicleId) {
        throw new RawRefuelCandidateOrgVehicleIntegrityError(
          observation.vehicleId,
          existing.organizationId,
          observation.organizationId,
        );
      }

      await acquirePgAdvisoryXactLock64(
        tx,
        buildRawRefuelCandidateLockKey(observation.vehicleId),
      );

      const organizationId = await this.repository.resolveAuthoritativeOrganizationId(
        tx,
        observation.vehicleId,
        observation.organizationId,
      );

      return this.reconcileExistingCandidate(
        tx,
        existing,
        observation,
        organizationId,
        serviceNow,
      );
    });
  }

  /**
   * F10.6.8-B3 — recovery-owned reconcile; fences on claim generation + active lease.
   */
  async reconcileExistingCandidateByIdForRecoveryClaim(
    candidateId: string,
    observation: RawRefuelCandidateObservation,
    recoveryMutation: RawRefuelCandidateRecoveryMutationContext,
  ): Promise<RawRefuelCandidateRecoveryReconcileResult> {
    validateObservationLifecycleRequest(observation);
    const serviceNow = this.clock.now();

    return this.prisma.$transaction(async (tx) => {
      await acquirePgAdvisoryXactLock64(
        tx,
        buildRawRefuelCandidateLockKey(observation.vehicleId),
      );

      const mutationTime = recoveryMutation.mutationClock();
      const existing = await lockRecoveryClaimForMutation(
        tx,
        candidateId,
        recoveryMutation.claim,
        mutationTime,
      );
      if (!existing) {
        return { kind: 'STALE_CLAIM' };
      }
      if (existing.vehicleId !== observation.vehicleId) {
        throw new RawRefuelCandidateOrgVehicleIntegrityError(
          observation.vehicleId,
          existing.organizationId,
          observation.organizationId,
        );
      }

      const organizationId = await this.repository.resolveAuthoritativeOrganizationId(
        tx,
        observation.vehicleId,
        observation.organizationId,
      );

      const result = await this.reconcileExistingCandidate(
        tx,
        existing,
        observation,
        organizationId,
        serviceNow,
      );
      return { kind: 'APPLIED', result };
    });
  }

  private async insertCandidate(
    tx: Prisma.TransactionClient,
    observation: RawRefuelCandidateObservation,
    organizationId: string,
    serviceNow: Date,
  ): Promise<RawRefuelCandidateResolveResult> {
    const mergedEvidence = mergeCandidateEvidence(null, observation, organizationId);
    const evidenceRevisionFingerprint = buildEvidenceRevisionFingerprint(mergedEvidence);
    const candidateIdentityKey = tryBuildCandidateIdentityKeyFromEvidence(mergedEvidence);
    validateLifecycleWithIdentity(observation.lifecycleState, candidateIdentityKey, observation);

    const created = await this.repository.createCandidate(tx, {
      organizationId,
      vehicleId: observation.vehicleId,
      candidateIdentityKey,
      evidenceRevisionFingerprint,
      observation,
      mergedEvidence,
      firstObservedAt: serviceNow,
      lastObservedAt: serviceNow,
    });

    return toResolveResult(created, { created: true, updated: false });
  }
}

interface RediscoveryClassification {
  same: RawRefuelCandidate[];
  insufficient: RawRefuelCandidate[];
  distinct: RawRefuelCandidate[];
  versionedTerminalConflict: RawRefuelCandidate[];
  crossVersionInsufficient: RawRefuelCandidate[];
  v2RediscoveryInsufficient: RawRefuelCandidate[];
}

function classifyRediscoveryCandidates(
  observation: RawRefuelCandidateObservation,
  candidates: RawRefuelCandidate[],
  organizationId: string,
): RediscoveryClassification {
  const slice = { ...observation, organizationId };
  const classified: RediscoveryClassification = {
    same: [],
    insufficient: [],
    distinct: [],
    versionedTerminalConflict: [],
    crossVersionInsufficient: [],
    v2RediscoveryInsufficient: [],
  };

  for (const row of candidates) {
    const overlap = classifyRawRefuelCandidateOverlap(slice, row);
    bucketClassification(classified, overlap, row, observation.detectionVersion);
  }

  return classified;
}

function isAuthorizedCrossVersionPair(
  observationDetectionVersion: string,
  candidateDetectionVersion: string,
): boolean {
  return (
    classifyCandidateDetectionVersionCompatibility({
      observationDetectionVersion,
      candidateDetectionVersion,
    }) === 'AUTHORIZED_CROSS_VERSION'
  );
}

function bucketClassification(
  classified: RediscoveryClassification,
  overlap: RawRefuelCandidateOverlapClassification,
  row: RawRefuelCandidate,
  observationDetectionVersion: string,
): void {
  if (overlap === 'VERSIONED_TERMINAL_CONFLICT') {
    classified.versionedTerminalConflict.push(row);
    return;
  }
  if (overlap === 'SAME_PHYSICAL_RISE') {
    classified.same.push(row);
    return;
  }
  if (overlap === 'INSUFFICIENT_EVIDENCE') {
    if (
      isAuthorizedCrossVersionPair(observationDetectionVersion, row.detectionVersion)
    ) {
      classified.crossVersionInsufficient.push(row);
      return;
    }
    if (
      observationDetectionVersion === RFRF_PLANNED_SETTLED_POST_DETECTION_VERSION &&
      row.detectionVersion === RFRF_PLANNED_SETTLED_POST_DETECTION_VERSION
    ) {
      classified.v2RediscoveryInsufficient.push(row);
      return;
    }
    classified.insufficient.push(row);
    return;
  }
  classified.distinct.push(row);
}

function assertV2IdentityKeyFallbackReconcileAllowed(
  observation: RawRefuelCandidateObservation & { organizationId: string },
  existing: RawRefuelCandidate,
): void {
  if (!isV2SameVersionPair(observation, existing)) {
    return;
  }
  const overlap = classifyRawRefuelCandidateOverlap(
    observation,
    candidateToEvidenceSlice(existing),
  );
  if (overlap !== 'SAME_PHYSICAL_RISE') {
    throw new RawRefuelCandidateV2RediscoveryInsufficientEvidenceError(
      observation.vehicleId,
      [existing.id],
    );
  }
}

function assertNoV2ShiftedBucketDuplicateInsert(
  observation: RawRefuelCandidateObservation,
  organizationId: string,
  distinctNeighbors: RawRefuelCandidate[],
): void {
  const slice = { ...observation, organizationId };
  const ambiguousIds: string[] = [];
  for (const row of distinctNeighbors) {
    const candidate = candidateToEvidenceSlice(row);
    if (isV2ShiftedIdentityBucketStaleAmbiguity(slice, candidate)) {
      ambiguousIds.push(row.id);
    }
  }
  if (ambiguousIds.length > 0) {
    throw new RawRefuelCandidateV2RediscoveryInsufficientEvidenceError(
      observation.vehicleId,
      ambiguousIds,
    );
  }
}

function resolveAssignedIdentityKey(
  existing: RawRefuelCandidate,
  mergedEvidence: ReturnType<typeof mergeCandidateEvidence>,
): string | null {
  if (existing.candidateIdentityKey) {
    return existing.candidateIdentityKey;
  }
  return tryBuildCandidateIdentityKeyFromEvidence(mergedEvidence);
}

function assertSupportedObservationDetectionVersion(
  observation: RawRefuelCandidateObservation,
): void {
  if (!isSupportedCandidateDetectionVersionForIdentity(observation.detectionVersion)) {
    throw new RawRefuelCandidateUnsupportedDetectionVersionError(
      observation.vehicleId,
      observation.detectionVersion,
    );
  }
}

function validateObservationLifecycleRequest(observation: RawRefuelCandidateObservation): void {
  if (observation.lifecycleState === 'PROMOTED') {
    throw new RawRefuelCandidateLifecycleValidationError(
      'PROMOTED transition is not caller-controlled in F2 candidate persistence',
    );
  }
  if (observation.lifecycleState === 'CONVERGED_NATIVE') {
    throw new RawRefuelCandidateLifecycleValidationError(
      'CONVERGED_NATIVE transition is not caller-controlled in F2 candidate persistence',
    );
  }
  if (observation.lifecycleState === 'REJECTED' && !observation.rejectionReason) {
    throw new RawRefuelCandidateLifecycleValidationError(
      'REJECTED lifecycle requires rejectionReason',
    );
  }
}

function validateLifecycleWithIdentity(
  lifecycleState: RawRefuelCandidate['lifecycleState'],
  candidateIdentityKey: string | null,
  observation: RawRefuelCandidateObservation,
): void {
  if (
    (lifecycleState === 'READY_FOR_PERSIST' || lifecycleState === 'PROMOTED') &&
    !candidateIdentityKey
  ) {
    throw new RawRefuelCandidateLifecycleValidationError(
      `${lifecycleState} requires candidateIdentityKey`,
    );
  }
  if (lifecycleState === 'REJECTED' && !observation.rejectionReason) {
    throw new RawRefuelCandidateLifecycleValidationError(
      'REJECTED lifecycle requires rejectionReason',
    );
  }
}

function toResolveResult(
  row: RawRefuelCandidate,
  flags: { created: boolean; updated: boolean },
): RawRefuelCandidateResolveResult {
  return {
    candidateId: row.id,
    candidateIdentityKey: row.candidateIdentityKey,
    evidenceRevisionFingerprint: row.evidenceRevisionFingerprint,
    lifecycleState: row.lifecycleState,
    created: flags.created,
    updated: flags.updated,
  };
}
