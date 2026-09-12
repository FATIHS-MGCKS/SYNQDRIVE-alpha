import type { RawRefuelCandidate } from '@prisma/client';
import { acquirePgAdvisoryXactLock64 } from '@shared/database/pg-advisory-lock.util';
import { PrismaService } from '@shared/database/prisma.service';
import {
  buildEvidenceRevisionFingerprint,
  observationToEvidenceSlice,
} from './raw-refuel-candidate-evidence-fingerprint';
import {
  buildCandidateIdentityKey,
  derivePrePlateauBucketFromObservation,
} from './raw-refuel-candidate-identity-key';
import { resolveNextLifecycleState } from './raw-refuel-candidate-lifecycle';
import { buildRawRefuelCandidateLockKey } from './raw-refuel-candidate-lock.util';
import { classifyRawRefuelCandidateOverlap } from './raw-refuel-candidate.matcher';
import { RawRefuelCandidateRepository } from './raw-refuel-candidate.repository';
import type {
  RawRefuelCandidateObservation,
  RawRefuelCandidateResolveResult,
} from './raw-refuel-candidate.types';

export class RawRefuelCandidateService {
  private readonly repository = new RawRefuelCandidateRepository();

  constructor(private readonly prisma: PrismaService) {}

  async resolveOrCreateCandidate(
    observation: RawRefuelCandidateObservation,
  ): Promise<RawRefuelCandidateResolveResult> {
    const observedAt = observation.observedAt ?? new Date();
    const evidenceSlice = observationToEvidenceSlice({
      ...observation,
      organizationId: observation.organizationId,
      vehicleId: observation.vehicleId,
      detectionVersion: observation.detectionVersion,
    });
    const evidenceRevisionFingerprint = buildEvidenceRevisionFingerprint(evidenceSlice);

    return this.prisma.$transaction(async (tx) => {
      await acquirePgAdvisoryXactLock64(
        tx,
        buildRawRefuelCandidateLockKey(observation.vehicleId),
      );

      const existingRows = await this.repository.findNonTerminalByVehicle(
        tx,
        observation.vehicleId,
        observation.signalChannel,
      );

      const semanticMatch = findSemanticMatch(observation, existingRows);

      if (semanticMatch) {
        const nextLifecycle = resolveNextLifecycleState(
          semanticMatch.lifecycleState,
          observation.lifecycleState,
        );

        if (
          semanticMatch.evidenceRevisionFingerprint === evidenceRevisionFingerprint &&
          semanticMatch.lifecycleState === nextLifecycle &&
          semanticMatch.rejectionReason === (observation.rejectionReason ?? null)
        ) {
          return toResolveResult(semanticMatch, {
            created: false,
            updated: false,
          });
        }

        const updated = await this.repository.updateCandidateEvidence(tx, semanticMatch, {
          evidenceRevisionFingerprint,
          observation,
          lastObservedAt: observedAt,
          lifecycleState: nextLifecycle,
        });

        return toResolveResult(updated, { created: false, updated: true });
      }

      const riseOnsetAt = observation.riseOnsetAt;
      const prePlateauBucket = derivePrePlateauBucketFromObservation(observation);
      if (!riseOnsetAt || prePlateauBucket == null) {
        throw new Error(
          'RawRefuelCandidate insert requires riseOnsetAt and pre-plateau evidence for identity assignment',
        );
      }

      const candidateIdentityKey = buildCandidateIdentityKey({
        vehicleId: observation.vehicleId,
        detectionVersion: observation.detectionVersion,
        signalChannel: observation.signalChannel,
        prePlateauBucket,
        riseOnsetAt,
      });

      const created = await this.repository.createCandidate(tx, {
        organizationId: observation.organizationId,
        vehicleId: observation.vehicleId,
        candidateIdentityKey,
        evidenceRevisionFingerprint,
        observation,
        firstObservedAt: observedAt,
        lastObservedAt: observedAt,
      });

      return toResolveResult(created, { created: true, updated: false });
    });
  }
}

function findSemanticMatch(
  observation: RawRefuelCandidateObservation,
  existingRows: RawRefuelCandidate[],
): RawRefuelCandidate | null {
  let best: RawRefuelCandidate | null = null;
  for (const row of existingRows) {
    const classification = classifyRawRefuelCandidateOverlap(observation, row);
    if (classification === 'SAME_PHYSICAL_RISE') {
      best = row;
      break;
    }
  }
  return best;
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
