import { Injectable, Logger, Optional } from '@nestjs/common';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import {
  isExpectedFixClassification,
  PhysicalStateShadowClassification,
} from './physical-state-shadow.classification';
import type { PhysicalStateShadowComparisonResult } from './physical-state-shadow-comparator.types';
import {
  recordPhysicalStateShadowClassification,
  recordPhysicalStateShadowCorrectnessBlocker,
  recordPhysicalStateShadowEvaluation,
} from './physical-state-shadow.metrics';
import { PhysicalStateShadowObservationRepository } from './physical-state-shadow-observation.repository';

export type PhysicalStateShadowLogContext = {
  organizationId: string;
  vehicleId: string;
  provider: string;
  classification: PhysicalStateShadowClassification;
  correctnessBlocking: boolean;
  authorityMode: string;
  legacyDecision: 'accept' | 'reject';
  physicalDecision: 'accept' | 'reject';
  observedAt: string;
  legacyReason?: string | null;
  physicalReason?: string | null;
  correlationId?: string | null;
  evidenceReferenceId?: string | null;
  bindingKey?: string | null;
};

/**
 * Structured shadow observability — compare-only durable pilot evidence.
 * Per-event identifiers may appear in logs but never as Prometheus label dimensions.
 */
@Injectable()
export class PhysicalStateShadowObservabilityService {
  private readonly logger = new Logger(PhysicalStateShadowObservabilityService.name);

  constructor(
    private readonly metrics: TripMetricsService,
    @Optional()
    private readonly observationRepository?: PhysicalStateShadowObservationRepository,
  ) {}

  async recordShadowComparison(result: PhysicalStateShadowComparisonResult): Promise<void> {
    const metricDimensions = {
      classification: result.classification,
      authority_mode: result.authorityMode,
      provider: result.scope.provider,
      legacy_decision: (result.legacyDecision.accepted ? 'accept' : 'reject') as 'accept' | 'reject',
      physical_decision: (result.physicalDecision.accepted ? 'accept' : 'reject') as 'accept' | 'reject',
      correctness_blocking: (result.correctnessBlocking ? 'true' : 'false') as 'true' | 'false',
    };

    recordPhysicalStateShadowEvaluation(this.metrics, metricDimensions);
    recordPhysicalStateShadowClassification(this.metrics, metricDimensions);
    if (result.correctnessBlocking) {
      recordPhysicalStateShadowCorrectnessBlocker(this.metrics, metricDimensions);
    }

    this.logComparison({
      organizationId: result.scope.organizationId,
      vehicleId: result.scope.vehicleId,
      provider: result.scope.provider,
      classification: result.classification,
      correctnessBlocking: result.correctnessBlocking,
      authorityMode: String(result.authorityMode),
      legacyDecision: result.legacyDecision.accepted ? 'accept' : 'reject',
      physicalDecision: result.physicalDecision.accepted ? 'accept' : 'reject',
      observedAt: result.observedAt,
      legacyReason: result.legacyReason,
      physicalReason: result.physicalReason,
      correlationId: result.correlationId,
      evidenceReferenceId: result.evidenceReferenceId,
      bindingKey: result.bindingKey,
    });

    if (this.observationRepository) {
      await this.observationRepository.recordComparison(result);
    }
  }

  logComparison(ctx: PhysicalStateShadowLogContext): void {
    const logPayload = {
      msg: this.resolveLogMessage(ctx.classification),
      event: 'physical_state_shadow_comparison',
      organizationId: ctx.organizationId,
      vehicleId: ctx.vehicleId,
      provider: ctx.provider,
      classification: ctx.classification,
      correctnessBlocking: ctx.correctnessBlocking,
      authorityMode: ctx.authorityMode,
      legacyDecision: ctx.legacyDecision,
      physicalDecision: ctx.physicalDecision,
      observedAt: ctx.observedAt,
      legacyReason: ctx.legacyReason ?? undefined,
      physicalReason: ctx.physicalReason ?? undefined,
      correlationId: ctx.correlationId ?? undefined,
      evidenceReferenceId: ctx.evidenceReferenceId ?? undefined,
      bindingKey: ctx.bindingKey ?? undefined,
    };

    if (ctx.correctnessBlocking) {
      this.logger.warn(logPayload);
      return;
    }

    if (isExpectedFixClassification(ctx.classification)) {
      this.logger.log({ ...logPayload, msg: 'physical_state_shadow_expected_fix' });
      return;
    }

    this.logger.log(logPayload);
  }

  private resolveLogMessage(classification: PhysicalStateShadowClassification): string {
    switch (classification) {
      case PhysicalStateShadowClassification.MATCH:
        return 'physical_state_shadow_match';
      case PhysicalStateShadowClassification.EXPECTED_FIX_OLD_REJECT_NEW_ACCEPT:
        return 'physical_state_shadow_expected_fix';
      case PhysicalStateShadowClassification.UNEXPLAINED_OLD_REJECT_NEW_ACCEPT:
      case PhysicalStateShadowClassification.UNEXPLAINED_OLD_ACCEPT_NEW_REJECT:
      case PhysicalStateShadowClassification.STATE_DIVERGENCE_CORRECTNESS_UNKNOWN:
        return 'physical_state_shadow_unexplained_divergence';
      case PhysicalStateShadowClassification.CONFLICT:
        return 'physical_state_shadow_conflict';
      case PhysicalStateShadowClassification.BINDING_DIVERGENCE:
        return 'physical_state_shadow_binding_divergence';
      case PhysicalStateShadowClassification.TIMESTAMP_DIVERGENCE:
        return 'physical_state_shadow_timestamp_divergence';
      case PhysicalStateShadowClassification.OLD_ACCEPT_NEW_REJECT_EXPECTED:
        return 'physical_state_shadow_old_accept_new_reject_expected';
      default:
        return 'physical_state_shadow_comparison';
    }
  }
}
