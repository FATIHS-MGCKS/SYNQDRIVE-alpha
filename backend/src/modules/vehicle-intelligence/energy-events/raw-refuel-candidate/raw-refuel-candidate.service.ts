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
  RawRefuelCandidateLifecycleValidationError,
} from './raw-refuel-candidate.errors';
import { tryBuildCandidateIdentityKeyFromEvidence } from './raw-refuel-candidate-identity-key';
import {
  isRawRefuelCandidateTerminal,
  resolveNextLifecycleState,
} from './raw-refuel-candidate-lifecycle';
import { buildRawRefuelCandidateLockKey } from './raw-refuel-candidate-lock.util';
import { classifyRawRefuelCandidateOverlap } from './raw-refuel-candidate.matcher';
import { RawRefuelCandidateRepository } from './raw-refuel-candidate.repository';
import type {
  RawRefuelCandidateObservation,
  RawRefuelCandidateResolveResult,
} from './raw-refuel-candidate.types';

export class RawRefuelCandidateService {
  private readonly repository = new RawRefuelCandidateRepository();

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: RawRefuelCandidateClock = new SystemRawRefuelCandidateClock(),
  ) {}

  withClock(clock: RawRefuelCandidateClock): RawRefuelCandidateService {
    return new RawRefuelCandidateService(this.prisma, clock);
  }

  withFixedClock(isoTimestamp: string | Date): RawRefuelCandidateService {
    const fixed =
      isoTimestamp instanceof Date ? isoTimestamp : new Date(isoTimestamp);
    return this.withClock(new FixedRawRefuelCandidateClock(fixed));
  }

  async resolveOrCreateCandidate(
    observation: RawRefuelCandidateObservation,
  ): Promise<RawRefuelCandidateResolveResult> {
    validateObservationLifecycleRequest(observation);
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

      const candidates = await loadRediscoveryCandidates(
        this.repository,
        tx,
        observation,
      );
      const sameMatches = collectSamePhysicalRiseMatches(observation, candidates, organizationId);
      if (sameMatches.length > 1) {
        throw new RawRefuelCandidateAmbiguityError(
          observation.vehicleId,
          sameMatches.map((row) => row.id),
        );
      }

      if (sameMatches.length === 1) {
        return this.reconcileExistingCandidate(
          tx,
          sameMatches[0],
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
          return this.reconcileExistingCandidate(
            tx,
            byKey,
            observation,
            organizationId,
            serviceNow,
          );
        }
      }

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
      existing.candidateIdentityKey !== candidateIdentityKey;

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

async function loadRediscoveryCandidates(
  repository: RawRefuelCandidateRepository,
  tx: Prisma.TransactionClient,
  observation: RawRefuelCandidateObservation,
): Promise<RawRefuelCandidate[]> {
  const [nonTerminal, terminal] = await Promise.all([
    repository.findNonTerminalByVehicle(tx, observation.vehicleId, observation.signalChannel),
    repository.findTerminalByVehicle(tx, observation.vehicleId, observation.signalChannel),
  ]);
  return [...nonTerminal, ...terminal];
}

function collectSamePhysicalRiseMatches(
  observation: RawRefuelCandidateObservation,
  candidates: RawRefuelCandidate[],
  organizationId: string,
): RawRefuelCandidate[] {
  const slice = { ...observation, organizationId };
  return candidates.filter(
    (row) => classifyRawRefuelCandidateOverlap(slice, row) === 'SAME_PHYSICAL_RISE',
  );
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

function validateObservationLifecycleRequest(observation: RawRefuelCandidateObservation): void {
  if (observation.lifecycleState === 'PROMOTED') {
    throw new RawRefuelCandidateLifecycleValidationError(
      'PROMOTED transition is not caller-controlled in F2 candidate persistence',
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
