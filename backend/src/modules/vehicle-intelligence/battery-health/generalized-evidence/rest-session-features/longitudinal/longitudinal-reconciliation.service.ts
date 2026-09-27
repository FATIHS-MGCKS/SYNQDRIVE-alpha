import { Injectable, Logger, Optional } from '@nestjs/common';
import { isBatteryV2LongitudinalProfileMaterializationEnabled } from '@config/battery-health-v2.config';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import { getBatteryV2LongitudinalMaterializationSessionLimit } from './longitudinal-profile-materialization.runtime-config';
import { LongitudinalProfileMaterializationRuntimeService } from './longitudinal-profile-materialization.runtime.service';
import {
  getBatteryV2LongitudinalReconciliationBatchSize,
} from './longitudinal-reconciliation.config';
import { LongitudinalReconciliationCandidateRepository } from './longitudinal-reconciliation-candidate.repository';
import {
  recordLongitudinalReconciliationInvariantFailure,
  recordLongitudinalReconciliationTickOutcomes,
} from './longitudinal-reconciliation.metrics';
import { LongitudinalReconciliationInvariantViolationError } from './longitudinal-reconciliation.invariants';

export type LongitudinalReconciliationTickOutcome = {
  status: 'SKIPPED_FLAG_OFF' | 'COMPLETED';
  candidateCount: number;
  processedCount: number;
  createdCount: number;
  existingCount: number;
  d1RejectedCount: number;
  d2RejectedCount: number;
  errorCount: number;
};

/**
 * M3.3F F4.1 — bounded D3 reconciliation orchestration (scheduler + internal ops).
 */
@Injectable()
export class LongitudinalReconciliationService {
  private readonly logger = new Logger(LongitudinalReconciliationService.name);

  constructor(
    private readonly candidates: LongitudinalReconciliationCandidateRepository,
    private readonly materializationRuntime: LongitudinalProfileMaterializationRuntimeService,
    @Optional() private readonly metrics?: TripMetricsService,
  ) {}

  async runBoundedReconciliationTick(): Promise<LongitudinalReconciliationTickOutcome> {
    if (!isBatteryV2LongitudinalProfileMaterializationEnabled()) {
      return {
        status: 'SKIPPED_FLAG_OFF',
        candidateCount: 0,
        processedCount: 0,
        createdCount: 0,
        existingCount: 0,
        d1RejectedCount: 0,
        d2RejectedCount: 0,
        errorCount: 0,
      };
    }

    const batchSize = getBatteryV2LongitudinalReconciliationBatchSize();
    const sessionLimit = getBatteryV2LongitudinalMaterializationSessionLimit();
    let candidateList;
    try {
      candidateList = await this.candidates.findCandidates({
        batchSize,
        sessionLimit,
      });
    } catch (error) {
      if (error instanceof LongitudinalReconciliationInvariantViolationError) {
        recordLongitudinalReconciliationInvariantFailure(this.metrics, error.code);
        this.logger.error(
          `longitudinal_reconciliation_invariant_violation type=${error.code}`,
        );
      }
      throw error;
    }

    let processedCount = 0;
    let createdCount = 0;
    let existingCount = 0;
    let d1RejectedCount = 0;
    let d2RejectedCount = 0;
    let errorCount = 0;

    for (const candidate of candidateList) {
      processedCount += 1;
      const profileGeneratedAt = new Date().toISOString();
      try {
        const outcome = await this.materializationRuntime.materialize({
          organizationId: candidate.organizationId,
          vehicleId: candidate.vehicleId,
          sessionLimit,
          profileGeneratedAt,
        });

        if ('status' in outcome && outcome.status === 'SKIPPED_FLAG_OFF') {
          continue;
        }
        if ('outcome' in outcome && outcome.outcome === 'CREATED') createdCount += 1;
        else if ('outcome' in outcome && outcome.outcome === 'EXISTING') existingCount += 1;
        else if ('outcome' in outcome && outcome.outcome === 'D1_REJECTED') {
          d1RejectedCount += 1;
          this.logger.warn(
            `longitudinal_reconciliation_d1_rejected org=${candidate.organizationId} vehicle=${candidate.vehicleId} reason=${outcome.reason}`,
          );
        } else if ('outcome' in outcome && outcome.outcome === 'D2_REJECTED') {
          d2RejectedCount += 1;
          this.logger.warn(
            `longitudinal_reconciliation_d2_rejected org=${candidate.organizationId} vehicle=${candidate.vehicleId} reason=${outcome.reason}`,
          );
        }
      } catch (error) {
        errorCount += 1;
        const errorClass = error instanceof Error ? error.constructor.name : 'UnknownError';
        this.logger.warn(
          `longitudinal_reconciliation_error org=${candidate.organizationId} vehicle=${candidate.vehicleId} class=${errorClass}`,
        );
      }
    }

    const result = {
      status: 'COMPLETED' as const,
      candidateCount: candidateList.length,
      processedCount,
      createdCount,
      existingCount,
      d1RejectedCount,
      d2RejectedCount,
      errorCount,
    };
    recordLongitudinalReconciliationTickOutcomes(this.metrics, result);
    return result;
  }
}
