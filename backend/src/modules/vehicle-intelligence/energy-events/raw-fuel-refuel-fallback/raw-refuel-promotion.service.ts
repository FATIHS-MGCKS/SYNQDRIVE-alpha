import { Injectable, Logger, Optional } from '@nestjs/common';
import type { Prisma, RawRefuelCandidate } from '@prisma/client';
import {
  evaluateFallbackPromotionAuthority,
  loadRawFuelRefuelFallbackConfig,
  RFRF_FALLBACK_PROMOTION_EXECUTION_AUTHORIZED_ENV,
} from '@config/raw-fuel-refuel-fallback.config';
import { acquirePgAdvisoryXactLock64 } from '@shared/database/pg-advisory-lock.util';
import { PrismaService } from '@shared/database/prisma.service';
import { vehicleEnergyEventToRefuelRow } from '../physical-refuel-row.mapper';
import { RawRefuelCandidateRepository } from '../raw-refuel-candidate/raw-refuel-candidate.repository';
import { mapRawRefuelCandidateToPromotionDraft } from '../raw-refuel-candidate/raw-refuel-candidate-promotion.design';
import { resolveNextLifecycleState } from '../raw-refuel-candidate/raw-refuel-candidate-lifecycle';
import { evaluateRawRefuelCandidateReadiness } from './raw-refuel-candidate-readiness.evaluator';
import type { RawRefuelPromotionPreparationContext } from './raw-refuel-promotion-preparation.service';
import { RawFuelRefuelFallbackMetricsService } from './raw-fuel-refuel-fallback-metrics.service';
import {
  buildNativeSiblingLimitExceededEvaluation,
  buildNativeSiblingRawLoadIncompleteEvaluation,
  buildPendingPhysicalReconciliationEvaluation,
  buildPhysicalRefuelAuthorityConflictEvaluation,
  detectAuthoritativeNativeSiblingLimitExceeded,
  evaluateRawRefuelNativeFallbackConvergence,
  NATIVE_SIBLING_LIMIT_EXCEEDED_DETAIL,
} from './raw-refuel-native-fallback-convergence.evaluator';
import { loadAuthoritativeNativeRefuelSiblings } from './authoritative-native-refuel-siblings.resolver';
import type { RawRefuelNativeFallbackConvergenceEvaluation } from './raw-refuel-native-fallback-convergence.types';
import { computeNativeOverlapQueryWindow } from './raw-refuel-native-overlap.advisory';
import { evaluateRawRefuelPromotionCutover } from './raw-refuel-promotion-cutover.util';
import { buildRfrfPromotionLockKey } from './raw-refuel-promotion-lock.util';
import type {
  RawRefuelPromotionApplyResult,
  RawRefuelPromotionTransactionHooks,
} from './raw-refuel-promotion.types';
import { mapPromotionDraftToVehicleEnergyEventCreateInput } from './raw-refuel-promotion-vee.mapper';
import {
  lockRecoveryClaimForMutation,
  type RawRefuelCandidateRecoveryMutationContext,
} from '../raw-refuel-candidate/raw-refuel-candidate-recovery-fencing';

function assertRecoveryClaimActiveForPromotion(
  locked: RawRefuelCandidate,
  claim: RawRefuelCandidateRecoveryMutationContext['claim'],
  mutationTime: Date,
): boolean {
  if (locked.recoveryAttemptCount !== claim.expectedClaimGeneration) {
    return false;
  }
  if (claim.requireActiveLease) {
    if (!locked.recoveryLeaseExpiresAt || locked.recoveryLeaseExpiresAt <= mutationTime) {
      return false;
    }
  }
  return true;
}

type RecoveryPromotionStale = {
  status: 'SKIPPED_NO_ACTION';
  detail: 'recovery_claim_stale';
  candidateId: string;
};

function recoveryPromotionStaleResult(candidateId: string): RawRefuelPromotionApplyResult {
  return {
    status: 'SKIPPED_NO_ACTION',
    evaluation: null,
    candidateId,
    fallbackVehicleEnergyEventId: null,
    convergedNativeEventId: null,
    detail: 'recovery_claim_stale',
  };
}

async function assertRecoveryFenceBeforeSideEffect(
  tx: Prisma.TransactionClient,
  locked: RawRefuelCandidate,
  recoveryMutation: RawRefuelCandidateRecoveryMutationContext,
): Promise<RecoveryPromotionStale | null> {
  const mutationTime = recoveryMutation.mutationClock();
  const freshLocked = await tx.rawRefuelCandidate.findUnique({
    where: { id: locked.id },
  });
  if (
    !freshLocked ||
    !assertRecoveryClaimActiveForPromotion(freshLocked, recoveryMutation.claim, mutationTime)
  ) {
    return {
      status: 'SKIPPED_NO_ACTION',
      detail: 'recovery_claim_stale',
      candidateId: locked.id,
    };
  }
  return null;
}

async function commitRecoveryOwnedPromotedCandidate(
  tx: Prisma.TransactionClient,
  locked: RawRefuelCandidate,
  recoveryMutation: RawRefuelCandidateRecoveryMutationContext,
  data: {
    lifecycleState: RawRefuelCandidate['lifecycleState'];
    qualityMeta: Prisma.InputJsonValue;
  },
): Promise<RecoveryPromotionStale | null> {
  const mutationTime = recoveryMutation.mutationClock();
  const where: Prisma.RawRefuelCandidateWhereInput = {
    id: locked.id,
    recoveryAttemptCount: recoveryMutation.claim.expectedClaimGeneration,
  };
  if (recoveryMutation.claim.requireActiveLease) {
    where.recoveryLeaseExpiresAt = { gt: mutationTime };
  }
  const result = await tx.rawRefuelCandidate.updateMany({
    where,
    data: {
      lifecycleState: data.lifecycleState,
      qualityMeta: data.qualityMeta,
      recoveryLastOutcome: 'SUCCESS_PROMOTED',
      recoveryNextAttemptAt: null,
      recoveryLeaseExpiresAt: null,
    },
  });
  if (result.count !== 1) {
    return {
      status: 'SKIPPED_NO_ACTION',
      detail: 'recovery_claim_stale',
      candidateId: locked.id,
    };
  }
  return null;
}

@Injectable()
export class RawRefuelPromotionService {
  private readonly logger = new Logger(RawRefuelPromotionService.name);
  private readonly candidateRepository = new RawRefuelCandidateRepository();

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly metrics?: RawFuelRefuelFallbackMetricsService,
  ) {}

  async evaluateAndApplyPromotionById(
    candidateId: string,
    context: RawRefuelPromotionPreparationContext = {},
    env: NodeJS.ProcessEnv = process.env,
    hooks?: RawRefuelPromotionTransactionHooks,
    recoveryMutation?: RawRefuelCandidateRecoveryMutationContext,
  ): Promise<RawRefuelPromotionApplyResult> {
    const authority = evaluateFallbackPromotionAuthority(env);
    if (!authority.authorized) {
      this.metrics?.recordPromotionSkippedNotAuthorized();
      return {
        status: 'SKIPPED_NOT_AUTHORIZED',
        evaluation: null,
        candidateId,
        fallbackVehicleEnergyEventId: null,
        convergedNativeEventId: null,
        detail: authority.detail,
      };
    }

    const candidate = await this.prisma.rawRefuelCandidate.findUnique({
      where: { id: candidateId },
    });
    if (!candidate) {
      return {
        status: 'SKIPPED_NO_ACTION',
        evaluation: null,
        candidateId,
        fallbackVehicleEnergyEventId: null,
        convergedNativeEventId: null,
        detail: 'candidate_not_found',
      };
    }

    return this.evaluateAndApplyPromotion(candidate, context, env, hooks, recoveryMutation);
  }

  async evaluateAndApplyPromotion(
    candidate: RawRefuelCandidate,
    context: RawRefuelPromotionPreparationContext = {},
    env: NodeJS.ProcessEnv = process.env,
    hooks?: RawRefuelPromotionTransactionHooks,
    recoveryMutation?: RawRefuelCandidateRecoveryMutationContext,
  ): Promise<RawRefuelPromotionApplyResult> {
    const authority = evaluateFallbackPromotionAuthority(env);
    if (!authority.authorized) {
      this.metrics?.recordPromotionSkippedNotAuthorized();
      return {
        status: 'SKIPPED_NOT_AUTHORIZED',
        evaluation: null,
        candidateId: candidate.id,
        fallbackVehicleEnergyEventId: null,
        convergedNativeEventId: null,
        detail: authority.detail,
      };
    }

    if (!recoveryMutation && candidate.lifecycleState === 'CONVERGED_NATIVE') {
      return {
        status: 'SKIPPED_CONVERGED_NATIVE',
        evaluation: null,
        candidateId: candidate.id,
        fallbackVehicleEnergyEventId: null,
        convergedNativeEventId: readConvergedNativeEventId(candidate),
        detail: 'already_converged_native',
      };
    }

    // Recovery-fenced promotion must not idempotently short-circuit on a stale
    // in-memory lifecycle snapshot — enter the transaction so generation/lease
    // fencing runs before ALREADY_PROMOTED read-back.
    if (!recoveryMutation && candidate.lifecycleState === 'PROMOTED') {
      const existingVeeId = await this.resolveExistingFallbackVeeId(candidate);
      this.metrics?.recordPromotionIdempotentReplay();
      return {
        status: 'ALREADY_PROMOTED',
        evaluation: null,
        candidateId: candidate.id,
        fallbackVehicleEnergyEventId: existingVeeId,
        convergedNativeEventId: null,
        detail: 'candidate_already_promoted',
      };
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        await acquirePgAdvisoryXactLock64(tx, buildRfrfPromotionLockKey(candidate.vehicleId));

        let locked: RawRefuelCandidate | null;
        if (recoveryMutation) {
          const mutationTime = recoveryMutation.mutationClock();
          locked = await lockRecoveryClaimForMutation(
            tx,
            candidate.id,
            recoveryMutation.claim,
            mutationTime,
          );
          if (!locked) {
            return {
              status: 'SKIPPED_NO_ACTION',
              evaluation: null,
              candidateId: candidate.id,
              fallbackVehicleEnergyEventId: null,
              convergedNativeEventId: null,
              detail: 'recovery_claim_stale',
            };
          }
        } else {
          locked = await this.candidateRepository.findByIdForUpdate(tx, candidate.id);
        }
        if (!locked) {
          return {
            status: 'SKIPPED_NO_ACTION',
            evaluation: null,
            candidateId: candidate.id,
            fallbackVehicleEnergyEventId: null,
            convergedNativeEventId: null,
            detail: 'candidate_not_found_in_transaction',
          };
        }

        if (hooks?.afterCandidateRowLock) {
          await hooks.afterCandidateRowLock();
        }

        if (recoveryMutation) {
          const mutationTime = recoveryMutation.mutationClock();
          if (!assertRecoveryClaimActiveForPromotion(locked, recoveryMutation.claim, mutationTime)) {
            return {
              status: 'SKIPPED_NO_ACTION',
              evaluation: null,
              candidateId: locked.id,
              fallbackVehicleEnergyEventId: null,
              convergedNativeEventId: null,
              detail: 'recovery_claim_stale',
            };
          }
        }

        if (locked.lifecycleState === 'CONVERGED_NATIVE') {
          return {
            status: 'SKIPPED_CONVERGED_NATIVE',
            evaluation: null,
            candidateId: locked.id,
            fallbackVehicleEnergyEventId: null,
            convergedNativeEventId: readConvergedNativeEventId(locked),
            detail: 'already_converged_native',
          };
        }

        if (locked.lifecycleState === 'PROMOTED') {
          const existingVeeId = await this.resolveExistingFallbackVeeIdTx(tx, locked);
          this.metrics?.recordPromotionIdempotentReplay();
          if (recoveryMutation) {
            const stale = await commitRecoveryOwnedPromotedCandidate(tx, locked, recoveryMutation, {
              lifecycleState: locked.lifecycleState,
              qualityMeta: (locked.qualityMeta ?? {}) as Prisma.InputJsonValue,
            });
            if (stale) {
              return recoveryPromotionStaleResult(stale.candidateId);
            }
            return {
              status: 'ALREADY_PROMOTED',
              evaluation: null,
              candidateId: locked.id,
              fallbackVehicleEnergyEventId: existingVeeId,
              convergedNativeEventId: null,
              detail: 'candidate_already_promoted',
              recoveryOwnedPromotionFinalized: true,
            };
          }
          return {
            status: 'ALREADY_PROMOTED',
            evaluation: null,
            candidateId: locked.id,
            fallbackVehicleEnergyEventId: existingVeeId,
            convergedNativeEventId: null,
            detail: 'candidate_already_promoted',
          };
        }

        const config = loadRawFuelRefuelFallbackConfig(env);
        const cutover = evaluateRawRefuelPromotionCutover(locked, config.cutoverAt);
        if (!cutover.eligible) {
          this.metrics?.recordPromotionBlockedByCutover();
          return {
            status: 'BLOCKED_CUTOVER',
            evaluation: null,
            candidateId: locked.id,
            fallbackVehicleEnergyEventId: null,
            convergedNativeEventId: null,
            detail: cutover.detail,
          };
        }

        const readiness = evaluateRawRefuelCandidateReadiness(locked, context);
        if (!readiness.ready) {
          return {
            status: 'SKIPPED_NOT_READY',
            evaluation: null,
            candidateId: locked.id,
            fallbackVehicleEnergyEventId: null,
            convergedNativeEventId: null,
            detail: readiness.detail,
          };
        }

        const promotionTrust = context.absoluteSignalTrust ?? locked.absoluteSignalTrust;
        if (promotionTrust !== 'TRUSTED') {
          this.metrics?.recordPromotionBlockedByTrust();
          return {
            status: 'BLOCKED_PROMOTION_TRUST',
            evaluation: null,
            candidateId: locked.id,
            fallbackVehicleEnergyEventId: null,
            convergedNativeEventId: null,
            detail: 'promotion_trust_not_trusted',
          };
        }

        this.metrics?.recordPromotionAttempted();

        if (!locked.candidateIdentityKey) {
          return {
            status: 'FAIL_CLOSED',
            evaluation: null,
            candidateId: locked.id,
            fallbackVehicleEnergyEventId: null,
            convergedNativeEventId: null,
            detail: 'missing_candidate_identity_key',
          };
        }

        const evaluation = await this.evaluateAuthoritativeConvergenceTx(tx, locked, env);
        this.recordEvaluationMetrics(evaluation);

        if (evaluation.shouldConvergeToNative) {
          const convergedNativeEventId = evaluation.authoritativeSameNativeEventId;
          const nextLifecycle = resolveNextLifecycleState(
            locked.lifecycleState,
            'CONVERGED_NATIVE',
          );
          await tx.rawRefuelCandidate.update({
            where: { id: locked.id },
            data: {
              lifecycleState: nextLifecycle,
              qualityMeta: mergePromotionMeta(locked.qualityMeta, {
                convergedNativeEnergyEventId: convergedNativeEventId,
                convergedAt: new Date().toISOString(),
                promotionAuthorityEnv: RFRF_FALLBACK_PROMOTION_EXECUTION_AUTHORIZED_ENV,
              }) as Prisma.InputJsonValue,
            },
          });
          this.metrics?.recordConvergedNative();
          return {
            status: 'CONVERGED_NATIVE',
            evaluation,
            candidateId: locked.id,
            fallbackVehicleEnergyEventId: null,
            convergedNativeEventId,
            detail: evaluation.detail,
          };
        }

        if (evaluation.failClosed) {
          this.metrics?.recordPromotionBlockedByConvergence();
          this.metrics?.recordConvergenceFailClosed();
          return {
            status: 'FAIL_CLOSED',
            evaluation,
            candidateId: locked.id,
            fallbackVehicleEnergyEventId: null,
            convergedNativeEventId: null,
            detail: evaluation.detail,
          };
        }

        if (
          evaluation.classification !== 'NO_NATIVE_SIBLINGS' &&
          evaluation.classification !== 'DISTINCT_FROM_NATIVE'
        ) {
          return {
            status: 'SKIPPED_NO_ACTION',
            evaluation,
            candidateId: locked.id,
            fallbackVehicleEnergyEventId: null,
            convergedNativeEventId: null,
            detail: evaluation.detail,
          };
        }

        const draft = mapRawRefuelCandidateToPromotionDraft(locked);
        const existingBySourceKey = await tx.vehicleEnergyEvent.findUnique({
          where: {
            vehicleId_sourceEventKey: {
              vehicleId: locked.vehicleId,
              sourceEventKey: draft.sourceEventKey,
            },
          },
        });

        if (existingBySourceKey) {
          if (existingBySourceKey.detectionSource !== 'SYNQDRIVE_RAW_FUEL_FALLBACK') {
            this.metrics?.recordPromotionSourceIdentityCollision();
            return {
              status: 'FAIL_CLOSED',
              evaluation,
              candidateId: locked.id,
              fallbackVehicleEnergyEventId: null,
              convergedNativeEventId: null,
              detail: 'source_event_key_collision_non_fallback',
            };
          }
          const nextLifecycle = resolveNextLifecycleState(locked.lifecycleState, 'PROMOTED');
          const promotedMeta = mergePromotionMeta(locked.qualityMeta, {
            promotedVehicleEnergyEventId: existingBySourceKey.id,
            promotedAt: new Date().toISOString(),
            promotionAuthorityEnv: RFRF_FALLBACK_PROMOTION_EXECUTION_AUTHORIZED_ENV,
          }) as Prisma.InputJsonValue;
          if (recoveryMutation) {
            const stale = await commitRecoveryOwnedPromotedCandidate(tx, locked, recoveryMutation, {
              lifecycleState: nextLifecycle,
              qualityMeta: promotedMeta,
            });
            if (stale) {
              return recoveryPromotionStaleResult(stale.candidateId);
            }
          } else {
            await tx.rawRefuelCandidate.update({
              where: { id: locked.id },
              data: {
                lifecycleState: nextLifecycle,
                qualityMeta: promotedMeta,
              },
            });
          }
          this.metrics?.recordPromotionIdempotentReplay();
          this.metrics?.recordPromotionCommitted();
          return {
            status: 'PROMOTED',
            evaluation,
            candidateId: locked.id,
            fallbackVehicleEnergyEventId: existingBySourceKey.id,
            convergedNativeEventId: null,
            detail: 'idempotent_existing_fallback_vee',
            recoveryOwnedPromotionFinalized: recoveryMutation ? true : undefined,
          };
        }

        const existingByDimoSegmentId = await tx.vehicleEnergyEvent.findUnique({
          where: { dimoSegmentId: draft.dimoSegmentIdPlaceholder },
        });
        if (
          existingByDimoSegmentId &&
          existingByDimoSegmentId.sourceEventKey !== draft.sourceEventKey
        ) {
          this.metrics?.recordPromotionSyntheticIdCollision();
          return {
            status: 'FAIL_CLOSED',
            evaluation,
            candidateId: locked.id,
            fallbackVehicleEnergyEventId: null,
            convergedNativeEventId: null,
            detail: 'synthetic_dimo_segment_id_collision',
          };
        }

        if (hooks?.beforeVeeInsert) {
          await hooks.beforeVeeInsert();
        }
        if (recoveryMutation) {
          const staleFence = await assertRecoveryFenceBeforeSideEffect(
            tx,
            locked,
            recoveryMutation,
          );
          if (staleFence) {
            return recoveryPromotionStaleResult(staleFence.candidateId);
          }
        }

        const createdVee = await tx.vehicleEnergyEvent.create({
          data: mapPromotionDraftToVehicleEnergyEventCreateInput(draft),
        });

        if (hooks?.afterVeeInsertBeforeLifecycleUpdate) {
          await hooks.afterVeeInsertBeforeLifecycleUpdate();
        }
        if (recoveryMutation) {
          const staleFence = await assertRecoveryFenceBeforeSideEffect(
            tx,
            locked,
            recoveryMutation,
          );
          if (staleFence) {
            return recoveryPromotionStaleResult(staleFence.candidateId);
          }
        }

        const nextLifecycle = resolveNextLifecycleState(locked.lifecycleState, 'PROMOTED');
        const promotedMeta = mergePromotionMeta(locked.qualityMeta, {
          promotedVehicleEnergyEventId: createdVee.id,
          promotedAt: new Date().toISOString(),
          promotionAuthorityEnv: RFRF_FALLBACK_PROMOTION_EXECUTION_AUTHORIZED_ENV,
        }) as Prisma.InputJsonValue;
        if (recoveryMutation) {
          const stale = await commitRecoveryOwnedPromotedCandidate(tx, locked, recoveryMutation, {
            lifecycleState: nextLifecycle,
            qualityMeta: promotedMeta,
          });
          if (stale) {
            return recoveryPromotionStaleResult(stale.candidateId);
          }
        } else {
          await tx.rawRefuelCandidate.update({
            where: { id: locked.id },
            data: {
              lifecycleState: nextLifecycle,
              qualityMeta: promotedMeta,
            },
          });
        }

        this.metrics?.recordPromotionCommitted();
        this.logger.log(
          JSON.stringify({
            event: 'rfrf_fallback_promoted',
            candidateId: locked.id,
            vehicleId: locked.vehicleId,
            fallbackVehicleEnergyEventId: createdVee.id,
            sourceEventKey: draft.sourceEventKey,
          }),
        );

        return {
          status: 'PROMOTED',
          evaluation,
          candidateId: locked.id,
          fallbackVehicleEnergyEventId: createdVee.id,
          convergedNativeEventId: null,
          detail: 'promotion_committed',
          recoveryOwnedPromotionFinalized: recoveryMutation ? true : undefined,
        };
      }, { timeout: 20_000 });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `RFRF promotion isolated failure candidate=${candidate.id}: ${message}`,
      );
      this.metrics?.recordPromotionTransactionFailure();
      throw error;
    }
  }

  private async evaluateAuthoritativeConvergenceTx(
    tx: Prisma.TransactionClient,
    candidate: RawRefuelCandidate,
    env: NodeJS.ProcessEnv = process.env,
  ): Promise<RawRefuelNativeFallbackConvergenceEvaluation> {
    const window = computeNativeOverlapQueryWindow(candidate);
    const siblingLoad = await loadAuthoritativeNativeRefuelSiblings(tx, candidate, window, env);

    if (siblingLoad.status === 'PENDING_RECONCILIATION') {
      return buildPendingPhysicalReconciliationEvaluation();
    }
    if (siblingLoad.status === 'AUTHORITY_CONFLICT') {
      return buildPhysicalRefuelAuthorityConflictEvaluation();
    }
    if (siblingLoad.status === 'RAW_LOAD_INCOMPLETE') {
      return buildNativeSiblingRawLoadIncompleteEvaluation();
    }

    if (
      detectAuthoritativeNativeSiblingLimitExceeded(
        siblingLoad.authoritativeNativeRows.length,
      )
    ) {
      return buildNativeSiblingLimitExceededEvaluation();
    }

    return evaluateRawRefuelNativeFallbackConvergence({
      candidate,
      nativeRefuelRows: siblingLoad.authoritativeNativeRows,
    });
  }

  private async resolveExistingFallbackVeeId(
    candidate: RawRefuelCandidate,
  ): Promise<string | null> {
    if (!candidate.candidateIdentityKey) return null;
    const row = await this.prisma.vehicleEnergyEvent.findUnique({
      where: {
        vehicleId_sourceEventKey: {
          vehicleId: candidate.vehicleId,
          sourceEventKey: candidate.candidateIdentityKey,
        },
      },
      select: { id: true, detectionSource: true },
    });
    if (!row || row.detectionSource !== 'SYNQDRIVE_RAW_FUEL_FALLBACK') return null;
    return row.id;
  }

  private async resolveExistingFallbackVeeIdTx(
    tx: Prisma.TransactionClient,
    candidate: RawRefuelCandidate,
  ): Promise<string | null> {
    if (!candidate.candidateIdentityKey) return null;
    const row = await tx.vehicleEnergyEvent.findUnique({
      where: {
        vehicleId_sourceEventKey: {
          vehicleId: candidate.vehicleId,
          sourceEventKey: candidate.candidateIdentityKey,
        },
      },
      select: { id: true, detectionSource: true },
    });
    if (!row || row.detectionSource !== 'SYNQDRIVE_RAW_FUEL_FALLBACK') return null;
    return row.id;
  }

  private recordEvaluationMetrics(
    evaluation: RawRefuelNativeFallbackConvergenceEvaluation,
  ): void {
    switch (evaluation.classification) {
      case 'SAME_NATIVE':
        this.metrics?.recordConvergenceSameNative();
        break;
      case 'NO_NATIVE_SIBLINGS':
        this.metrics?.recordConvergenceNoNative();
        break;
      case 'DISTINCT_FROM_NATIVE':
        this.metrics?.recordConvergenceDistinct();
        break;
      case 'INSUFFICIENT_EVIDENCE':
        this.metrics?.recordConvergenceInsufficient();
        break;
      case 'AMBIGUOUS':
        this.metrics?.recordConvergenceAmbiguous();
        break;
      default: {
        const _exhaustive: never = evaluation.classification;
        void _exhaustive;
      }
    }
  }
}

function readConvergedNativeEventId(candidate: RawRefuelCandidate): string | null {
  const meta = candidate.qualityMeta;
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return null;
  const value = (meta as Record<string, unknown>).convergedNativeEnergyEventId;
  return typeof value === 'string' ? value : null;
}

function mergePromotionMeta(
  existing: RawRefuelCandidate['qualityMeta'],
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const base =
    existing && typeof existing === 'object' && !Array.isArray(existing)
      ? (existing as Record<string, unknown>)
      : {};
  return { ...base, ...patch };
}
