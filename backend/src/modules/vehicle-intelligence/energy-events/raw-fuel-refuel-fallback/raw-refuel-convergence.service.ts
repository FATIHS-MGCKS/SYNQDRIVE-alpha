import { Injectable, Logger, Optional } from '@nestjs/common';
import type { Prisma, RawRefuelCandidate } from '@prisma/client';
import {
  isRfrfNativeFallbackConvergenceAuthorized,
  RFRF_NATIVE_FALLBACK_CONVERGENCE_AUTHORIZED_ENV,
} from '@config/raw-fuel-refuel-fallback.config';
import { acquirePgAdvisoryXactLock64 } from '@shared/database/pg-advisory-lock.util';
import { PrismaService } from '@shared/database/prisma.service';
import { resolveNextLifecycleState } from '../raw-refuel-candidate/raw-refuel-candidate-lifecycle';
import { buildRawRefuelCandidateLockKey } from '../raw-refuel-candidate/raw-refuel-candidate-lock.util';
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
import type { RawRefuelConvergenceApplyResult } from './raw-refuel-native-fallback-convergence.types';
import { computeNativeOverlapQueryWindow } from './raw-refuel-native-overlap.advisory';

@Injectable()
export class RawRefuelConvergenceService {
  private readonly logger = new Logger(RawRefuelConvergenceService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly metrics?: RawFuelRefuelFallbackMetricsService,
  ) {}

  async evaluateAndApplyConvergenceById(
    candidateId: string,
    context: RawRefuelPromotionPreparationContext = {},
    env: NodeJS.ProcessEnv = process.env,
  ): Promise<RawRefuelConvergenceApplyResult> {
    if (!isRfrfNativeFallbackConvergenceAuthorized(env)) {
      this.metrics?.recordConvergenceSkippedNotAuthorized();
      return {
        status: 'SKIPPED_NOT_AUTHORIZED',
        evaluation: null,
        candidateId,
        convergedNativeEventId: null,
        detail: 'f5_convergence_not_authorized',
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
        convergedNativeEventId: null,
        detail: 'candidate_not_found',
      };
    }

    if (candidate.lifecycleState === 'CONVERGED_NATIVE') {
      const existingNativeId = readConvergedNativeEventId(candidate);
      this.metrics?.recordConvergenceAlreadyConverged();
      return {
        status: 'ALREADY_CONVERGED',
        evaluation: null,
        candidateId: candidate.id,
        convergedNativeEventId: existingNativeId,
        detail: 'already_converged_native',
      };
    }

    return this.evaluateAndApplyConvergence(candidate, context, env);
  }

  async evaluateAndApplyConvergence(
    candidate: RawRefuelCandidate,
    context: RawRefuelPromotionPreparationContext = {},
    env: NodeJS.ProcessEnv = process.env,
  ): Promise<RawRefuelConvergenceApplyResult> {
    if (!isRfrfNativeFallbackConvergenceAuthorized(env)) {
      this.metrics?.recordConvergenceSkippedNotAuthorized();
      return {
        status: 'SKIPPED_NOT_AUTHORIZED',
        evaluation: null,
        candidateId: candidate.id,
        convergedNativeEventId: null,
        detail: 'f5_convergence_not_authorized',
      };
    }

    if (candidate.lifecycleState === 'CONVERGED_NATIVE') {
      const existingNativeId = readConvergedNativeEventId(candidate);
      this.metrics?.recordConvergenceAlreadyConverged();
      return {
        status: 'ALREADY_CONVERGED',
        evaluation: null,
        candidateId: candidate.id,
        convergedNativeEventId: existingNativeId,
        detail: 'already_converged_native',
      };
    }

    if (candidate.lifecycleState === 'PROMOTED') {
      this.metrics?.recordConvergenceFailClosed();
      return {
        status: 'FAIL_CLOSED_TERMINAL_PROMOTED',
        evaluation: null,
        candidateId: candidate.id,
        convergedNativeEventId: null,
        detail: 'candidate_already_promoted',
      };
    }

    const readiness = evaluateRawRefuelCandidateReadiness(candidate, context);
    if (!readiness.ready) {
      return {
        status: 'SKIPPED_NOT_READY',
        evaluation: null,
        candidateId: candidate.id,
        convergedNativeEventId: null,
        detail: readiness.detail,
      };
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        await acquirePgAdvisoryXactLock64(
          tx,
          buildRawRefuelCandidateLockKey(candidate.vehicleId),
        );

        const locked = await tx.rawRefuelCandidate.findUnique({
          where: { id: candidate.id },
        });
        if (!locked) {
          return {
            status: 'SKIPPED_NO_ACTION',
            evaluation: null,
            candidateId: candidate.id,
            convergedNativeEventId: null,
            detail: 'candidate_not_found_in_transaction',
          };
        }

        if (locked.lifecycleState === 'CONVERGED_NATIVE') {
          const existingNativeId = readConvergedNativeEventId(locked);
          this.metrics?.recordConvergenceAlreadyConverged();
          return {
            status: 'ALREADY_CONVERGED',
            evaluation: null,
            candidateId: locked.id,
            convergedNativeEventId: existingNativeId,
            detail: 'already_converged_native',
          };
        }

        if (locked.lifecycleState === 'PROMOTED') {
          this.metrics?.recordConvergenceFailClosed();
          return {
            status: 'FAIL_CLOSED_TERMINAL_PROMOTED',
            evaluation: null,
            candidateId: locked.id,
            convergedNativeEventId: null,
            detail: 'candidate_already_promoted',
          };
        }

        const window = computeNativeOverlapQueryWindow(locked);
        const siblingLoad = await loadAuthoritativeNativeRefuelSiblings(tx, locked, window);

        if (siblingLoad.status === 'PENDING_RECONCILIATION') {
          const evaluation = buildPendingPhysicalReconciliationEvaluation();
          return {
            status: 'SKIPPED_NO_ACTION',
            evaluation,
            candidateId: locked.id,
            convergedNativeEventId: null,
            detail: siblingLoad.detail,
          };
        }

        if (siblingLoad.status === 'AUTHORITY_CONFLICT') {
          const evaluation = buildPhysicalRefuelAuthorityConflictEvaluation();
          this.metrics?.recordConvergenceFailClosed();
          this.metrics?.recordConvergenceAmbiguous();
          return {
            status: 'FAIL_CLOSED',
            evaluation,
            candidateId: locked.id,
            convergedNativeEventId: null,
            detail: siblingLoad.detail,
          };
        }

        if (siblingLoad.status === 'RAW_LOAD_INCOMPLETE') {
          const evaluation = buildNativeSiblingRawLoadIncompleteEvaluation();
          this.metrics?.recordConvergenceFailClosed();
          this.metrics?.recordConvergenceAmbiguous();
          return {
            status: 'FAIL_CLOSED',
            evaluation,
            candidateId: locked.id,
            convergedNativeEventId: null,
            detail: siblingLoad.detail,
          };
        }

        if (
          detectAuthoritativeNativeSiblingLimitExceeded(
            siblingLoad.authoritativeNativeRows.length,
          )
        ) {
          const evaluation = buildNativeSiblingLimitExceededEvaluation();
          this.metrics?.recordConvergenceNativeSiblingOverflow();
          this.metrics?.recordConvergenceFailClosed();
          this.metrics?.recordConvergenceAmbiguous();
          return {
            status: 'FAIL_CLOSED',
            evaluation,
            candidateId: locked.id,
            convergedNativeEventId: null,
            detail: NATIVE_SIBLING_LIMIT_EXCEEDED_DETAIL,
          };
        }

        const evaluation = evaluateRawRefuelNativeFallbackConvergence({
          candidate: locked,
          nativeRefuelRows: siblingLoad.authoritativeNativeRows,
        });

        this.recordEvaluationMetrics(evaluation.classification);

        if (evaluation.failClosed) {
          this.metrics?.recordConvergenceFailClosed();
          return {
            status: 'FAIL_CLOSED',
            evaluation,
            candidateId: locked.id,
            convergedNativeEventId: null,
            detail: evaluation.detail,
          };
        }

        if (!evaluation.shouldConvergeToNative) {
          return {
            status: 'SKIPPED_NO_ACTION',
            evaluation,
            candidateId: locked.id,
            convergedNativeEventId: null,
            detail: evaluation.detail,
          };
        }

        const nextLifecycle = resolveNextLifecycleState(
          locked.lifecycleState,
          'CONVERGED_NATIVE',
        );
        const convergedNativeEventId = evaluation.authoritativeSameNativeEventId;
        const updated = await tx.rawRefuelCandidate.update({
          where: { id: locked.id },
          data: {
            lifecycleState: nextLifecycle,
            qualityMeta: mergeConvergenceMeta(locked.qualityMeta, {
              convergedNativeEnergyEventId: convergedNativeEventId,
              convergedAt: new Date().toISOString(),
              convergenceAuthorityEnv: RFRF_NATIVE_FALLBACK_CONVERGENCE_AUTHORIZED_ENV,
            }) as Prisma.InputJsonValue,
          },
        });

        this.metrics?.recordConvergedNative();
        this.logger.log(
          JSON.stringify({
            event: 'rfrf_converged_native',
            candidateId: updated.id,
            vehicleId: updated.vehicleId,
            convergedNativeEventId,
          }),
        );

        return {
          status: 'CONVERGED_NATIVE',
          evaluation,
          candidateId: updated.id,
          convergedNativeEventId,
          detail: evaluation.detail,
        };
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `RFRF convergence isolated failure candidate=${candidate.id}: ${message}`,
      );
      this.metrics?.recordConvergenceError();
      throw error;
    }
  }

  private recordEvaluationMetrics(
    classification: ReturnType<
      typeof evaluateRawRefuelNativeFallbackConvergence
    >['classification'],
  ): void {
    switch (classification) {
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
        const _exhaustive: never = classification;
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

function mergeConvergenceMeta(
  existing: RawRefuelCandidate['qualityMeta'],
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const base =
    existing && typeof existing === 'object' && !Array.isArray(existing)
      ? (existing as Record<string, unknown>)
      : {};
  return { ...base, ...patch };
}
