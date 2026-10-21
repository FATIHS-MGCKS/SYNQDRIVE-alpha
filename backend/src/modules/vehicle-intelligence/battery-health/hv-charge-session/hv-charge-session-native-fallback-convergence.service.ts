import { Injectable, Logger } from '@nestjs/common';
import type { NormalizedDimoRechargeSegment } from '@modules/dimo/recharge-segments/dimo-recharge-segments.types';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import { acquireErdHvChargeSessionVehicleAuthorityLock } from './erd-hv-charge-session-authority.lock';
import {
  decideFallbackSupersessionForNative,
  ERD_PHYSICAL_MATCH_RESULT,
  nativeSideFromDimoSegment,
} from './erd-physical-episode-matcher';
import { shouldPersistFallbackCandidate } from './hv-fallback-charge-session-activation.policy';
import { resolveFallbackPersistIdentity } from './hv-fallback-charge-session-anchor.policy';
import { mapFallbackCandidateToHvChargeSessionDraft } from './hv-fallback-charge-session.mapper';
import { buildFallbackSupersessionUpdate } from './hv-fallback-charge-session.supersede';
import type { HvFallbackChargeSessionCandidate } from './hv-fallback-charge-session.types';
import { mapRechargeSegmentToHvChargeSessionDraft } from './hv-charge-session.mapper';
import { mergeHvChargeSessionUpdate } from './hv-charge-session.merge';
import { HvChargeSessionRepository } from './hv-charge-session.repository';
import type { HvChargeSession } from '@prisma/client';
import {
  HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE,
  HV_CHARGE_SESSION_SOURCE_TELEMETRY_POLL_FALLBACK,
  type HvChargeSessionDraft,
  type HvChargeSessionPersistResult,
} from './hv-charge-session.types';
import { recordErdE3ConvergenceMetric } from './hv-erd-convergence.metrics';

export interface HvNativeFallbackConvergenceResult extends HvChargeSessionPersistResult {
  convergence: {
    matchResult: string | null;
    supersededFallbackId: string | null;
    skippedSupersession: boolean;
  };
}

export interface HvFallbackAuthorityPersistResult {
  session: HvChargeSession | null;
  created: boolean;
  changed: boolean;
  changeKind: HvChargeSessionPersistResult['changeKind'];
  authority: {
    skipped: boolean;
    skipReason?:
      | 'blocked_by_native_after_revalidation'
      | 'ambiguous_anchor'
      | 'fail_closed';
    reusedExistingIdentity: boolean;
  };
}

@Injectable()
export class HvChargeSessionNativeFallbackConvergenceService {
  private readonly logger = new Logger(HvChargeSessionNativeFallbackConvergenceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: HvChargeSessionRepository,
    private readonly metrics: TripMetricsService,
  ) {}

  async persistNativeWithFallbackConvergence(input: {
    organizationId: string;
    vehicleId: string;
    segment: NormalizedDimoRechargeSegment;
    correlationId?: string | null;
    evaluatedAt?: Date;
    /** Test-only: throw after supersede write to prove rollback */
    injectFailureAfterSupersede?: boolean;
  }): Promise<HvNativeFallbackConvergenceResult> {
    const evaluatedAt = input.evaluatedAt ?? new Date();
    const draft = mapRechargeSegmentToHvChargeSessionDraft({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      segment: input.segment,
      reconciledAt: evaluatedAt,
    });

    try {
      return await this.prisma.$transaction(async (tx) => {
        await acquireErdHvChargeSessionVehicleAuthorityLock(tx, input.vehicleId);

        const fallbackSessions = await tx.hvChargeSession.findMany({
          where: {
            vehicleId: input.vehicleId,
            source: HV_CHARGE_SESSION_SOURCE_TELEMETRY_POLL_FALLBACK,
          },
        });

        const reDecision = decideFallbackSupersessionForNative({
          vehicleId: input.vehicleId,
          fallbackSessions,
          native: nativeSideFromDimoSegment(input.segment),
          evaluatedAt,
        });

        for (const entry of reDecision.evaluatedMatches) {
          if (entry.result === ERD_PHYSICAL_MATCH_RESULT.SAME) {
            recordErdE3ConvergenceMetric(this.metrics, 'match_same');
          } else if (entry.result === ERD_PHYSICAL_MATCH_RESULT.DIFFERENT) {
            recordErdE3ConvergenceMetric(this.metrics, 'match_different');
          } else {
            recordErdE3ConvergenceMetric(this.metrics, 'match_ambiguous');
          }
        }

        let supersededFallbackId: string | null = null;
        if (reDecision.action === 'supersede_one' && reDecision.target) {
          const fallbackRow = fallbackSessions.find(
            (row) => row.id === reDecision.target!.id,
          );
          if (!fallbackRow) {
            throw new Error('erd_e3_convergence_fallback_missing');
          }

          const supersedeUpdate = buildFallbackSupersessionUpdate({
            existing: fallbackRow,
            dimoSegment: input.segment,
            reconciledAt: evaluatedAt,
            matchEvidence: reDecision.evidence,
          });

          await tx.hvChargeSession.update({
            where: { id: fallbackRow.id },
            data: supersedeUpdate as Prisma.HvChargeSessionUpdateInput,
          });
          supersededFallbackId = fallbackRow.id;

          if (input.injectFailureAfterSupersede) {
            throw new Error('erd_e3_test_inject_failure_after_supersede');
          }

          recordErdE3ConvergenceMetric(this.metrics, 'native_superseded_fallback');
        }

        const nativeResult = await this.upsertNativeInTransaction(
          tx,
          draft,
          evaluatedAt,
        );

        return {
          ...nativeResult,
          convergence: {
            matchResult: reDecision.matchResult,
            supersededFallbackId,
            skippedSupersession: supersededFallbackId == null,
          },
        };
      });
    } catch (error) {
      recordErdE3ConvergenceMetric(this.metrics, 'convergence_failed');
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `ERD authority native convergence failed vehicle=${input.vehicleId}: ${message}`,
      );
      throw error;
    }
  }

  async persistProvisionalFallbackUnderAuthorityLock(input: {
    organizationId: string;
    vehicleId: string;
    candidate: HvFallbackChargeSessionCandidate;
    evaluatedAt?: Date;
    correlationId?: string | null;
    injectFailureBeforeCommit?: boolean;
  }): Promise<HvFallbackAuthorityPersistResult> {
    const evaluatedAt = input.evaluatedAt ?? new Date();
    const draftPre = mapFallbackCandidateToHvChargeSessionDraft({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      candidate: input.candidate,
      reconciledAt: evaluatedAt,
    });

    try {
      return await this.prisma.$transaction(async (tx) => {
        await acquireErdHvChargeSessionVehicleAuthorityLock(tx, input.vehicleId);

        const nativeSessions = await tx.hvChargeSession.findMany({
          where: {
            vehicleId: input.vehicleId,
            source: HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE,
          },
        });

        const allow = shouldPersistFallbackCandidate({
          vehicleId: input.vehicleId,
          candidate: input.candidate,
          nativeSessions,
          evaluatedAt,
        });

        if (!allow.allowed) {
          recordErdE3ConvergenceMetric(
            this.metrics,
            'fallback_blocked_by_native_after_revalidation',
          );
          return {
            session: null,
            created: false,
            changed: false,
            changeKind: 'no_op',
            authority: {
              skipped: true,
              skipReason: 'blocked_by_native_after_revalidation',
              reusedExistingIdentity: false,
            },
          };
        }

        const fallbackRows = await tx.hvChargeSession.findMany({
          where: {
            vehicleId: input.vehicleId,
            source: HV_CHARGE_SESSION_SOURCE_TELEMETRY_POLL_FALLBACK,
          },
        });

        const identity = resolveFallbackPersistIdentity({
          vehicleId: input.vehicleId,
          candidate: input.candidate,
          draft: draftPre,
          existingFallbackRows: fallbackRows,
          evaluatedAt,
        });

        if (identity.action === 'fail_closed') {
          recordErdE3ConvergenceMetric(this.metrics, 'fallback_anchor_ambiguous');
          return {
            session: null,
            created: false,
            changed: false,
            changeKind: 'no_op',
            authority: {
              skipped: true,
              skipReason: 'ambiguous_anchor',
              reusedExistingIdentity: false,
            },
          };
        }

        const draft = identity.draft;
        const reusedExistingIdentity = identity.action === 'reuse';

        if (reusedExistingIdentity) {
          recordErdE3ConvergenceMetric(this.metrics, 'fallback_reused_existing_identity');
        }

        const persistResult = await this.upsertFallbackDraftInTransaction(
          tx,
          draft,
          evaluatedAt,
        );

        if (input.injectFailureBeforeCommit) {
          throw new Error('erd_e3_test_inject_failure_before_commit');
        }

        return {
          ...persistResult,
          authority: {
            skipped: false,
            reusedExistingIdentity,
          },
        };
      });
    } catch (error) {
      recordErdE3ConvergenceMetric(this.metrics, 'convergence_failed');
      throw error;
    }
  }

  private async upsertNativeInTransaction(
    tx: Prisma.TransactionClient,
    draft: HvChargeSessionDraft,
    reconciledAt: Date,
  ): Promise<HvChargeSessionPersistResult> {
    const existing = await tx.hvChargeSession.findUnique({
      where: {
        vehicleId_segmentFingerprint: {
          vehicleId: draft.vehicleId,
          segmentFingerprint: draft.segmentFingerprint,
        },
      },
    });

    if (!existing) {
      const session = await tx.hvChargeSession.create({
        data: this.draftToCreateData(draft),
      });
      return {
        session,
        created: true,
        changed: true,
        changeKind: 'created',
      };
    }

    const merged = mergeHvChargeSessionUpdate({
      existing,
      incoming: draft,
      reconciledAt,
    });

    if (!merged.changed || !merged.update) {
      return {
        session: existing,
        created: false,
        changed: false,
        changeKind: 'no_op',
      };
    }

    const session = await tx.hvChargeSession.update({
      where: { id: existing.id },
      data: merged.update as Prisma.HvChargeSessionUpdateInput,
    });

    return {
      session,
      created: false,
      changed: true,
      changeKind: merged.changeKind,
    };
  }

  private async upsertFallbackDraftInTransaction(
    tx: Prisma.TransactionClient,
    draft: HvChargeSessionDraft,
    reconciledAt: Date,
  ): Promise<HvChargeSessionPersistResult> {
    const existing = await tx.hvChargeSession.findUnique({
      where: {
        vehicleId_segmentFingerprint: {
          vehicleId: draft.vehicleId,
          segmentFingerprint: draft.segmentFingerprint,
        },
      },
    });

    if (!existing) {
      const session = await tx.hvChargeSession.create({
        data: this.draftToCreateData(draft),
      });
      recordErdE3ConvergenceMetric(this.metrics, 'fallback_created');
      return {
        session,
        created: true,
        changed: true,
        changeKind: 'created',
      };
    }

    const merged = mergeHvChargeSessionUpdate({
      existing,
      incoming: draft,
      reconciledAt,
    });

    if (!merged.changed || !merged.update) {
      return {
        session: existing,
        created: false,
        changed: false,
        changeKind: 'no_op',
      };
    }

    const session = await tx.hvChargeSession.update({
      where: { id: existing.id },
      data: merged.update as Prisma.HvChargeSessionUpdateInput,
    });
    recordErdE3ConvergenceMetric(this.metrics, 'fallback_updated');
    return {
      session,
      created: false,
      changed: true,
      changeKind: merged.changeKind,
    };
  }

  private draftToCreateData(
    draft: HvChargeSessionDraft,
  ): Prisma.HvChargeSessionUncheckedCreateInput {
    return {
      organizationId: draft.organizationId,
      vehicleId: draft.vehicleId,
      segmentFingerprint: draft.segmentFingerprint,
      dimoSegmentId: draft.dimoSegmentId,
      source: draft.source,
      startAt: draft.startAt,
      endAt: draft.endAt,
      startSocPercent: draft.startSocPercent,
      endSocPercent: draft.endSocPercent,
      startEnergyKwh: draft.startEnergyKwh,
      endEnergyKwh: draft.endEnergyKwh,
      energyAddedKwh: draft.energyAddedKwh,
      deltaSocPercent: draft.deltaSocPercent,
      isOngoing: draft.isOngoing,
      quality: draft.quality,
      idempotencyKey: draft.idempotencyKey,
      providerObservedAt: draft.providerObservedAt,
      metadata: draft.metadata as unknown as Prisma.InputJsonValue,
    };
  }
}
