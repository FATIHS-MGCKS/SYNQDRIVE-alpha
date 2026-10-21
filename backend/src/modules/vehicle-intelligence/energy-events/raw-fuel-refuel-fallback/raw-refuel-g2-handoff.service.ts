import { Injectable, Logger, Optional } from '@nestjs/common';
import { evaluateFallbackG2HandoffAuthority } from '@config/raw-fuel-refuel-fallback.config';
import { PhysicalRefuelReconciliationRuntimeService } from '../physical-refuel-reconciliation-runtime.service';
import { RawFuelRefuelFallbackMetricsService } from './raw-fuel-refuel-fallback-metrics.service';
import type { RawRefuelG2HandoffParams, RawRefuelG2HandoffResult } from './raw-refuel-g2-handoff.types';

const PROMOTED_HANDOFF_STATUSES = new Set(['PROMOTED', 'ALREADY_PROMOTED']);

@Injectable()
export class RawRefuelG2HandoffService {
  private readonly logger = new Logger(RawRefuelG2HandoffService.name);

  constructor(
    @Optional()
    private readonly physicalRefuelReconciliationRuntime?: PhysicalRefuelReconciliationRuntimeService,
    @Optional() private readonly metrics?: RawFuelRefuelFallbackMetricsService,
  ) {}

  async handoffAfterPromotionCommit(
    params: RawRefuelG2HandoffParams,
    env: NodeJS.ProcessEnv = process.env,
  ): Promise<RawRefuelG2HandoffResult> {
    if (!PROMOTED_HANDOFF_STATUSES.has(params.promotionStatus)) {
      return {
        status: 'SKIPPED_NOT_PROMOTED',
        fallbackVehicleEnergyEventId: params.fallbackVehicleEnergyEventId,
        promotionStatus: params.promotionStatus,
        detail: `promotion_status_${params.promotionStatus.toLowerCase()}`,
      };
    }

    if (!params.fallbackVehicleEnergyEventId) {
      return {
        status: 'SKIPPED_NO_EVENT_ID',
        fallbackVehicleEnergyEventId: null,
        promotionStatus: params.promotionStatus,
        detail: 'missing_fallback_vehicle_energy_event_id',
      };
    }

    const authority = evaluateFallbackG2HandoffAuthority(env);
    if (!authority.authorized) {
      this.metrics?.recordG2HandoffSkippedNotAuthorized();
      return {
        status: 'SKIPPED_NOT_AUTHORIZED',
        fallbackVehicleEnergyEventId: params.fallbackVehicleEnergyEventId,
        promotionStatus: params.promotionStatus,
        detail: authority.detail,
      };
    }

    if (!this.physicalRefuelReconciliationRuntime?.isEnabled()) {
      this.metrics?.recordG2HandoffSkippedG2Disabled();
      return {
        status: 'SKIPPED_G2_DISABLED',
        fallbackVehicleEnergyEventId: params.fallbackVehicleEnergyEventId,
        promotionStatus: params.promotionStatus,
        detail: 'physical_refuel_reconciliation_v2_disabled',
      };
    }

    this.metrics?.recordG2HandoffAttempted();

    try {
      const g2Result = await this.physicalRefuelReconciliationRuntime.reconcileAndEnqueueAfterPersist({
        vehicleId: params.vehicleId,
        triggerEventId: params.fallbackVehicleEnergyEventId,
        organizationId: params.organizationId,
        tokenId: params.tokenId,
      });

      const status = classifyG2HandoffOutcome(g2Result);
      recordOutcomeMetrics(status, g2Result, this.metrics);

      this.logger.log(
        JSON.stringify({
          event: 'rfrf_fallback_g2_handoff_complete',
          vehicleId: params.vehicleId,
          fallbackVehicleEnergyEventId: params.fallbackVehicleEnergyEventId,
          promotionStatus: params.promotionStatus,
          handoffStatus: status,
          enqueuedCount: g2Result.enqueuedEventIds.length,
          dedupedCount: g2Result.dedupedEventIds.length,
          heldCount: g2Result.heldEventIds.length,
        }),
      );

      return {
        status,
        fallbackVehicleEnergyEventId: params.fallbackVehicleEnergyEventId,
        promotionStatus: params.promotionStatus,
        detail: 'handoff_invoked',
        g2Result,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.metrics?.recordG2HandoffFailed();
      this.logger.warn(
        JSON.stringify({
          event: 'rfrf_fallback_g2_handoff_failed',
          vehicleId: params.vehicleId,
          fallbackVehicleEnergyEventId: params.fallbackVehicleEnergyEventId,
          promotionStatus: params.promotionStatus,
          message,
        }),
      );
      return {
        status: 'HANDOFF_FAILED',
        fallbackVehicleEnergyEventId: params.fallbackVehicleEnergyEventId,
        promotionStatus: params.promotionStatus,
        detail: message,
      };
    }
  }
}

function classifyG2HandoffOutcome(
  result: NonNullable<RawRefuelG2HandoffResult['g2Result']>,
): RawRefuelG2HandoffResult['status'] {
  if (result.enqueuedEventIds.length > 0) {
    return 'HANDOFF_COMPLETED';
  }
  if (result.dedupedEventIds.length > 0) {
    return 'HANDOFF_DEDUPED';
  }
  if (result.heldEventIds.length > 0) {
    return 'HANDOFF_HELD';
  }
  if (result.decisions.length === 0) {
    return 'HANDOFF_DEFERRED';
  }
  return 'HANDOFF_COMPLETED';
}

function recordOutcomeMetrics(
  status: RawRefuelG2HandoffResult['status'],
  _result: NonNullable<RawRefuelG2HandoffResult['g2Result']>,
  metrics?: RawFuelRefuelFallbackMetricsService,
): void {
  switch (status) {
    case 'HANDOFF_COMPLETED':
      metrics?.recordG2HandoffCompleted();
      break;
    case 'HANDOFF_HELD':
      metrics?.recordG2HandoffHeld();
      break;
    case 'HANDOFF_DEFERRED':
      metrics?.recordG2HandoffDeferred();
      break;
    case 'HANDOFF_DEDUPED':
      metrics?.recordG2HandoffDeduped();
      break;
    default:
      break;
  }
}
