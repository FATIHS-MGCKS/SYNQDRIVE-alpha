import { Injectable, Logger } from '@nestjs/common';
import type { NormalizedDimoRechargeSegment } from '@modules/dimo/recharge-segments/dimo-recharge-segments.types';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import {
  decideFallbackSupersessionForNative,
  ERD_PHYSICAL_MATCHER_VERSION,
  ERD_PHYSICAL_MATCH_RESULT,
  nativeSideFromDimoSegment,
} from './erd-physical-episode-matcher';
import { buildFallbackSupersessionUpdate } from './hv-fallback-charge-session.supersede';
import { mapRechargeSegmentToHvChargeSessionDraft } from './hv-charge-session.mapper';
import { mergeHvChargeSessionUpdate } from './hv-charge-session.merge';
import { HvChargeSessionRepository } from './hv-charge-session.repository';
import type {
  HvChargeSessionDraft,
  HvChargeSessionMetadata,
  HvChargeSessionPersistResult,
} from './hv-charge-session.types';
import { HV_CHARGE_SESSION_SOURCE_TELEMETRY_POLL_FALLBACK } from './hv-charge-session.types';
import { recordErdE3ConvergenceMetric } from './hv-erd-convergence.metrics';

export interface HvNativeFallbackConvergenceResult extends HvChargeSessionPersistResult {
  convergence: {
    matchResult: string | null;
    supersededFallbackId: string | null;
    skippedSupersession: boolean;
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
  }): Promise<HvNativeFallbackConvergenceResult> {
    const evaluatedAt = input.evaluatedAt ?? new Date();
    const draft = mapRechargeSegmentToHvChargeSessionDraft({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      segment: input.segment,
      reconciledAt: evaluatedAt,
    });

    const fallbackSessions = await this.repository.findBySource(
      input.vehicleId,
      HV_CHARGE_SESSION_SOURCE_TELEMETRY_POLL_FALLBACK,
    );

    const decision = decideFallbackSupersessionForNative({
      vehicleId: input.vehicleId,
      fallbackSessions,
      native: nativeSideFromDimoSegment(input.segment),
      evaluatedAt,
    });

    for (const entry of decision.evaluatedMatches) {
      if (entry.result === ERD_PHYSICAL_MATCH_RESULT.SAME) {
        recordErdE3ConvergenceMetric(this.metrics, 'match_same');
      } else if (entry.result === ERD_PHYSICAL_MATCH_RESULT.DIFFERENT) {
        recordErdE3ConvergenceMetric(this.metrics, 'match_different');
      } else {
        recordErdE3ConvergenceMetric(this.metrics, 'match_ambiguous');
      }
    }

    if (decision.action !== 'supersede_one' || !decision.target) {
      const persistResult = await this.persistDraftOutsideTx(
        input.organizationId,
        input.vehicleId,
        draft,
        evaluatedAt,
        input.correlationId,
      );
      return {
        ...persistResult,
        convergence: {
          matchResult: decision.matchResult,
          supersededFallbackId: null,
          skippedSupersession: true,
        },
      };
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.vehicleId}))`;

        const lockedFallback = await tx.hvChargeSession.findMany({
          where: {
            vehicleId: input.vehicleId,
            source: HV_CHARGE_SESSION_SOURCE_TELEMETRY_POLL_FALLBACK,
          },
        });

        const reDecision = decideFallbackSupersessionForNative({
          vehicleId: input.vehicleId,
          fallbackSessions: lockedFallback,
          native: nativeSideFromDimoSegment(input.segment),
          evaluatedAt,
        });

        if (
          reDecision.action !== 'supersede_one' ||
          !reDecision.target ||
          reDecision.target.id !== decision.target?.id
        ) {
          throw new Error('erd_e3_convergence_revalidation_failed');
        }

        const fallbackRow = lockedFallback.find((row) => row.id === reDecision.target!.id);
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

        const nativeResult = await this.upsertNativeInTransaction(
          tx,
          input.organizationId,
          input.vehicleId,
          draft,
          evaluatedAt,
        );

        recordErdE3ConvergenceMetric(this.metrics, 'native_superseded_fallback');

        return {
          ...nativeResult,
          convergence: {
            matchResult: ERD_PHYSICAL_MATCH_RESULT.SAME,
            supersededFallbackId: fallbackRow.id,
            skippedSupersession: false,
          },
        };
      });
    } catch (error) {
      recordErdE3ConvergenceMetric(this.metrics, 'convergence_failed');
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `ERD E3 convergence transaction failed vehicle=${input.vehicleId}: ${message}`,
      );
      throw error;
    }
  }

  private async upsertNativeInTransaction(
    tx: Prisma.TransactionClient,
    organizationId: string,
    vehicleId: string,
    draft: HvChargeSessionDraft,
    reconciledAt: Date,
  ): Promise<HvChargeSessionPersistResult> {
    const existing = await tx.hvChargeSession.findUnique({
      where: {
        vehicleId_segmentFingerprint: {
          vehicleId,
          segmentFingerprint: draft.segmentFingerprint,
        },
      },
    });

    if (!existing) {
      const session = await tx.hvChargeSession.create({
        data: {
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
        },
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

  private async persistDraftOutsideTx(
    organizationId: string,
    vehicleId: string,
    draft: HvChargeSessionDraft,
    reconciledAt: Date,
    correlationId?: string | null,
  ): Promise<HvChargeSessionPersistResult> {
    const existing = await this.repository.findByFingerprint(
      vehicleId,
      draft.segmentFingerprint,
    );

    if (!existing) {
      const session = await this.repository.create(draft);
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
      const session =
        (await this.repository.findById(existing.id)) ?? existing;
      return {
        session: session as HvChargeSessionPersistResult['session'],
        created: false,
        changed: false,
        changeKind: 'no_op',
      };
    }

    const session = await this.repository.update(existing.id, merged.update);
    return {
      session,
      created: false,
      changed: true,
      changeKind: merged.changeKind,
    };
  }
}
