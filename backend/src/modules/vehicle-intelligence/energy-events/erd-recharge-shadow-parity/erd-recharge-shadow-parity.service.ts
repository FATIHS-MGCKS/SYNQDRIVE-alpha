import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { buildLegacyDirectDimoRechargeWhere, isLegacyDirectDimoRechargeRow } from './legacy-recharge-cohort.policy';
import { buildCanonicalShadowCandidates } from './canonical-shadow-cohort.policy';
import { evaluateRechargeShadowParity } from './erd-recharge-shadow-parity.evaluate';
import { aggregateRechargeShadowParityReport } from './erd-recharge-shadow-parity.aggregator';
import { isErdRechargeShadowParityEnabled } from './erd-recharge-shadow-parity.config';
import { ErdRechargeShadowParityRepository } from './erd-recharge-shadow-parity.repository';
import { ErdRechargeShadowParityMetricsService } from './erd-recharge-shadow-parity.metrics';
import {
  ERD_RECHARGE_SHADOW_RUN_RESULT,
  type ErdRechargeShadowObservationDraft,
  type ErdRechargeShadowRunResult,
} from './erd-recharge-shadow-parity.types';

export interface EvaluateRechargeShadowParityInput {
  organizationId: string;
  vehicleId: string;
  windowFrom: Date;
  windowTo: Date;
  evaluatedAt?: Date;
  persist?: boolean;
  injectPersistenceFailure?: boolean;
}

export interface EvaluateRechargeShadowParityOutput {
  result: ErdRechargeShadowRunResult;
  observations: ErdRechargeShadowObservationDraft[];
  report: ReturnType<typeof aggregateRechargeShadowParityReport>;
  persistence: { created: number; updated: number; deduped: number };
}

@Injectable()
export class ErdRechargeShadowParityService {
  private readonly logger = new Logger(ErdRechargeShadowParityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: ErdRechargeShadowParityRepository,
    @Optional() private readonly metrics?: ErdRechargeShadowParityMetricsService,
  ) {}

  async evaluateVehicleWindow(
    input: EvaluateRechargeShadowParityInput,
  ): Promise<EvaluateRechargeShadowParityOutput> {
    const persist =
      input.persist ??
      isErdRechargeShadowParityEnabled(process.env);
    if (!persist) {
      this.metrics?.recordRun(ERD_RECHARGE_SHADOW_RUN_RESULT.SKIPPED_FLAG_OFF);
      const built = await this.buildObservations(input);
      const report = aggregateRechargeShadowParityReport({
        observations: built.observations,
        canonicalEpisodeCount: built.canonicalEpisodeCount,
        legacyEpisodeCount: built.legacyEpisodeCount,
      });
      return {
        result: ERD_RECHARGE_SHADOW_RUN_RESULT.SKIPPED_FLAG_OFF,
        observations: built.observations,
        report,
        persistence: { created: 0, updated: 0, deduped: 0 },
      };
    }

    try {
      const evaluatedAt = input.evaluatedAt ?? new Date();
      const built = await this.buildObservations(input);
      const observations = built.observations;
      const report = aggregateRechargeShadowParityReport({
        observations,
        canonicalEpisodeCount: built.canonicalEpisodeCount,
        legacyEpisodeCount: built.legacyEpisodeCount,
      });

      if (input.injectPersistenceFailure) {
        throw new Error('erd_e5_4_injected_shadow_persistence_failure');
      }

      const persistence = { created: 0, updated: 0, deduped: 0 };
      for (const draft of observations) {
        const outcome = await this.repository.upsertObservation(draft, evaluatedAt);
        if (outcome === 'created') persistence.created += 1;
        if (outcome === 'updated') persistence.updated += 1;
        if (outcome === 'deduped') persistence.deduped += 1;
        this.metrics?.recordObservation({
          parityClass: draft.parityClass,
          pairingEvidence: draft.pairingEvidence,
          fieldMismatchFields:
            draft.fieldDiff?.mismatches.map((m) => m.field) ?? [],
        });
      }

      const result =
        persistence.created + persistence.updated > 0
          ? ERD_RECHARGE_SHADOW_RUN_RESULT.PERSISTED
          : persistence.deduped > 0
            ? ERD_RECHARGE_SHADOW_RUN_RESULT.DEDUPED
            : ERD_RECHARGE_SHADOW_RUN_RESULT.OBSERVED;
      this.metrics?.recordRun(result);
      return { result, observations, report, persistence };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `ERD recharge shadow parity isolated failure vehicle=${input.vehicleId}: ${message}`,
      );
      this.metrics?.recordRun(ERD_RECHARGE_SHADOW_RUN_RESULT.FAILED_ISOLATED);
      throw error;
    }
  }

  private async buildObservations(
    input: EvaluateRechargeShadowParityInput,
  ): Promise<{
    observations: ErdRechargeShadowObservationDraft[];
    canonicalEpisodeCount: number;
    legacyEpisodeCount: number;
  }> {
    const [sessions, legacyRows] = await Promise.all([
      this.prisma.hvChargeSession.findMany({
        where: {
          vehicleId: input.vehicleId,
          organizationId: input.organizationId,
        },
      }),
      this.prisma.vehicleEnergyEvent.findMany({
        where: buildLegacyDirectDimoRechargeWhere({
          vehicleId: input.vehicleId,
          windowFrom: input.windowFrom,
          windowTo: input.windowTo,
        }),
      }),
    ]);
    const observations = evaluateRechargeShadowParity({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      windowFrom: input.windowFrom,
      windowTo: input.windowTo,
      sessions,
      legacyRows,
    });
    const canonicalEpisodeCount = buildCanonicalShadowCandidates({
      sessions,
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      windowFrom: input.windowFrom,
      windowTo: input.windowTo,
    }).length;
    const legacyEpisodeCount = legacyRows.filter((row) =>
      isLegacyDirectDimoRechargeRow(row),
    ).length;
    return {
      observations,
      canonicalEpisodeCount,
      legacyEpisodeCount,
    };
  }
}
