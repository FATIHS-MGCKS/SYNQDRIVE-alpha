import { Injectable, Logger, Optional } from '@nestjs/common';
import {
  DeviceConnectionPhysicalEvidenceSource,
  DeviceConnectionPhysicalTransitionDecision,
  DimoDeviceConnectionEventType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import {
  loadConnectivityPhysicalStateRuntimeFlagConfig,
  resolveEffectivePhysicalStateRuntimePolicy,
} from '@config/connectivity-physical-state-runtime.config';
import { DeviceConnectionPhysicalAuthorityCutoverRepository } from './device-connection-physical-authority-cutover.repository';
import {
  extractSnapshotObdPhysicalEvidenceFromSignals,
  extractWebhookObdPhysicalEvidence,
} from './device-connection-physical-state.obd-evidence';
import { recordPhysicalStateReconcileDecision } from './device-connection-physical-state.observability';
import { isAcceptedPhysicalTransition } from './device-connection-physical-state.policy';
import type { EffectivePhysicalStateRuntimePolicy } from './physical-state-authority.types';
import { PhysicalStateCanonicalGate } from './physical-state-authority.types';
import { PhysicalStateReconcileCoordinator } from './physical-state-reconcile.coordinator';
import { comparePhysicalStateShadowDecisions } from './physical-state-shadow-comparator';
import { PhysicalStateShadowObservabilityService } from './physical-state-shadow-observability.service';
import {
  recordPhysicalStateEvidenceWriterResult,
  recordPhysicalStateGtR1ExpectedFix,
  recordPhysicalStateStatefulShadowEvaluation,
} from './physical-state-evidence-writer.metrics';
import type {
  PhysicalEvidenceWriterResult,
  SnapshotEvidenceWriterInput,
  WebhookEvidenceWriterInput,
} from './physical-state-evidence-writer.types';

@Injectable()
export class PhysicalStateEvidenceWriterService {
  private readonly logger = new Logger(PhysicalStateEvidenceWriterService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly coordinator: PhysicalStateReconcileCoordinator,
    private readonly authorityCutoverRepository: DeviceConnectionPhysicalAuthorityCutoverRepository,
    @Optional() private readonly shadowObservability?: PhysicalStateShadowObservabilityService,
    @Optional() private readonly metrics?: TripMetricsService,
  ) {}

  isWriterCapable(): boolean {
    const flags = loadConnectivityPhysicalStateRuntimeFlagConfig();
    return flags.masterEnabled;
  }

  async resolveRuntimePolicy(scope: {
    organizationId: string;
    vehicleId: string;
    provider: string;
  }): Promise<EffectivePhysicalStateRuntimePolicy> {
    const authorityMode = await this.prisma.$transaction(async (tx) => {
      const row = await this.authorityCutoverRepository.ensureAuthorityRow(tx, scope);
      return row.authorityMode;
    });
    return resolveEffectivePhysicalStateRuntimePolicy({
      authorityMode,
      flags: loadConnectivityPhysicalStateRuntimeFlagConfig(),
    });
  }

  async writeWebhookEvidence(
    input: WebhookEvidenceWriterInput,
  ): Promise<PhysicalEvidenceWriterResult> {
    const scope = {
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      provider: input.provider,
    };
    const policy = await this.resolveRuntimePolicy(scope);

    if (!policy.masterEnabled) {
      return this.disabledResult(policy, input.legacyGate);
    }

    const extracted = extractWebhookObdPhysicalEvidence({
      provider: input.provider,
      tokenId: input.tokenId,
      deviceBindingId: input.deviceBindingId,
      pluggedIn: input.pluggedIn,
      observedAt: input.observedAt,
      evidenceReferenceId: input.evidenceReferenceId,
    });

    if (!extracted) {
      return {
        enabled: true,
        policy,
        coordinatorResult: null,
        shadowComparison: null,
        legacyGate: input.legacyGate,
        physicalAccepted: false,
        physicalDecision: DeviceConnectionPhysicalTransitionDecision.INSUFFICIENT_EVIDENCE,
        skippedReason: 'insufficient_webhook_evidence',
      };
    }

    let coordinatorResult = null;
    if (policy.projectionWriteEnabled) {
      const eventType = input.pluggedIn
        ? DimoDeviceConnectionEventType.OBD_DEVICE_PLUGGED_IN
        : DimoDeviceConnectionEventType.OBD_DEVICE_UNPLUGGED;

      coordinatorResult = await this.coordinator.reconcileInOuterTransaction(
        {
          reconcile: {
            organizationId: input.organizationId,
            vehicleId: input.vehicleId,
            tokenId: input.tokenId,
            binding: extracted.binding,
            evidence: {
              candidateState: extracted.candidateState,
              evidenceObservedAt: extracted.evidenceObservedAt,
              evidenceSource: DeviceConnectionPhysicalEvidenceSource.WEBHOOK,
              evidenceReferenceId: extracted.evidenceReferenceId,
            },
            receivedAt: input.receivedAt,
            selfHeal: false,
          },
          webhookEventUpsert: {
            organizationId: input.organizationId,
            vehicleId: input.vehicleId,
            tokenId: input.tokenId,
            provider: input.provider,
            eventType,
            observedAt: input.observedAt,
            receivedAt: input.receivedAt,
            rawPayloadJson: input.rawPayload as Prisma.InputJsonValue,
          },
        },
        { sideEffectsEnabled: policy.sideEffectsEnabled },
      );

      recordPhysicalStateReconcileDecision(coordinatorResult.reconcile);
      this.recordWriterMetrics(
        'WEBHOOK',
        coordinatorResult.reconcile.decision,
        policy,
      );
    }

    const physicalDecision = coordinatorResult?.reconcile.decision ?? null;
    const physicalAccepted =
      physicalDecision != null &&
      physicalDecision !== 'DISABLED' &&
      isAcceptedPhysicalTransition(physicalDecision);

    const shadowComparison = this.maybeRecordShadowComparison({
      policy,
      scope,
      bindingKey: extracted.binding.bindingKey,
      legacyGate: input.legacyGate,
      physicalDecision:
        physicalDecision === 'DISABLED' ? null : physicalDecision,
      physicalAccepted,
      physicalReason: coordinatorResult?.reconcile.reason,
      candidateState: extracted.candidateState,
      evidenceObservedAt: extracted.evidenceObservedAt,
      evidenceReferenceId: extracted.evidenceReferenceId,
      provenExpectedFix: input.provenExpectedFix,
      equalTimeOpposingState:
        physicalDecision === DeviceConnectionPhysicalTransitionDecision.CONFLICT,
    });

    return {
      enabled: true,
      policy,
      coordinatorResult,
      shadowComparison,
      legacyGate: input.legacyGate,
      physicalAccepted,
      physicalDecision,
    };
  }

  async writeSnapshotEvidence(
    input: SnapshotEvidenceWriterInput,
  ): Promise<PhysicalEvidenceWriterResult> {
    const scope = {
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      provider: 'DIMO',
    };
    const policy = await this.resolveRuntimePolicy(scope);

    if (!policy.masterEnabled) {
      return this.disabledResult(policy, input.legacyGate);
    }

    const extracted = extractSnapshotObdPhysicalEvidenceFromSignals({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      tokenId: input.tokenId,
      deviceBindingId: input.deviceBindingId,
      signals: input.signals,
      evidenceReferenceId: input.evidenceReferenceId,
    });

    if (!extracted) {
      return {
        enabled: true,
        policy,
        coordinatorResult: null,
        shadowComparison: null,
        legacyGate: input.legacyGate,
        physicalAccepted: false,
        physicalDecision: null,
        skippedReason: 'insufficient_snapshot_obd_evidence',
      };
    }

    let coordinatorResult = null;
    if (policy.projectionWriteEnabled) {
      const projectionSelfHeal =
        input.projectionSelfHeal ??
        (extracted.candidateState === 'PLUGGED');

      coordinatorResult = await this.coordinator.reconcileInOuterTransaction(
        {
          reconcile: {
            organizationId: input.organizationId,
            vehicleId: input.vehicleId,
            tokenId: input.tokenId,
            binding: extracted.binding,
            evidence: {
              candidateState: extracted.candidateState,
              evidenceObservedAt: extracted.evidenceObservedAt,
              evidenceSource: DeviceConnectionPhysicalEvidenceSource.SNAPSHOT_OBD,
              evidenceReferenceId: extracted.evidenceReferenceId,
            },
            selfHeal: projectionSelfHeal,
          },
        },
        { sideEffectsEnabled: policy.sideEffectsEnabled },
      );

      recordPhysicalStateReconcileDecision(coordinatorResult.reconcile);
      this.recordWriterMetrics(
        'SNAPSHOT_OBD',
        coordinatorResult.reconcile.decision,
        policy,
      );
    }

    const physicalDecision = coordinatorResult?.reconcile.decision ?? null;
    const physicalAccepted =
      physicalDecision != null &&
      physicalDecision !== 'DISABLED' &&
      isAcceptedPhysicalTransition(physicalDecision);

    const shadowComparison = this.maybeRecordShadowComparison({
      policy,
      scope,
      bindingKey: extracted.binding.bindingKey,
      legacyGate: input.legacyGate,
      physicalDecision:
        physicalDecision === 'DISABLED' ? null : physicalDecision,
      physicalAccepted,
      physicalReason: coordinatorResult?.reconcile.reason,
      candidateState: extracted.candidateState,
      evidenceObservedAt: extracted.evidenceObservedAt,
      evidenceReferenceId: extracted.evidenceReferenceId,
      provenExpectedFix: input.provenExpectedFix,
      equalTimeOpposingState:
        physicalDecision === DeviceConnectionPhysicalTransitionDecision.CONFLICT,
    });

    return {
      enabled: true,
      policy,
      coordinatorResult,
      shadowComparison,
      legacyGate: input.legacyGate,
      physicalAccepted,
      physicalDecision,
    };
  }

  private disabledResult(
    policy: EffectivePhysicalStateRuntimePolicy,
    legacyGate: PhysicalEvidenceWriterResult['legacyGate'],
  ): PhysicalEvidenceWriterResult {
    return {
      enabled: false,
      policy,
      coordinatorResult: null,
      shadowComparison: null,
      legacyGate,
      physicalAccepted: false,
      physicalDecision: 'DISABLED',
      skippedReason: 'master_disabled',
    };
  }

  private maybeRecordShadowComparison(input: {
    policy: EffectivePhysicalStateRuntimePolicy;
    scope: { organizationId: string; vehicleId: string; provider: string };
    bindingKey: string;
    legacyGate: { accepted: boolean; reason?: string | null };
    physicalDecision: DeviceConnectionPhysicalTransitionDecision | 'DISABLED' | null;
    physicalAccepted: boolean;
    physicalReason?: string;
    candidateState: 'PLUGGED' | 'UNPLUGGED';
    evidenceObservedAt: Date;
    evidenceReferenceId: string;
    provenExpectedFix?: boolean;
    equalTimeOpposingState?: boolean;
  }) {
    if (!input.policy.shadowCompareEnabled) return null;

    if (input.policy.statefulShadow && this.metrics) {
      recordPhysicalStateStatefulShadowEvaluation(this.metrics, {
        mode: 'stateful_shadow',
      });
    }

    const physicalEffectiveState =
      input.physicalAccepted && input.physicalDecision !== 'DISABLED'
        ? input.candidateState
        : null;

    const comparison = comparePhysicalStateShadowDecisions({
      scope: input.scope,
      authorityMode: input.policy.authorityMode,
      bindingKey: input.bindingKey,
      legacyDecision: {
        accepted: input.legacyGate.accepted,
        reason: input.legacyGate.reason,
        gate: PhysicalStateCanonicalGate.LEGACY,
      },
      physicalDecision: {
        accepted: input.physicalAccepted,
        reason: input.physicalReason,
        gate: PhysicalStateCanonicalGate.PHYSICAL,
        transitionDecision:
          input.physicalDecision === 'DISABLED' ? null : input.physicalDecision,
        effectiveState: physicalEffectiveState,
      },
      legacyEffectivePlugState: input.legacyGate.accepted
        ? input.candidateState === 'PLUGGED'
          ? 'plugged'
          : 'unplugged'
        : null,
      evidenceObservedAt: input.evidenceObservedAt,
      evidenceReferenceId: input.evidenceReferenceId,
      provenExpectedFix: input.provenExpectedFix,
      equalTimeOpposingState: input.equalTimeOpposingState,
    });

    this.shadowObservability?.recordShadowComparison(comparison);

    if (comparison.classification === 'EXPECTED_FIX_OLD_REJECT_NEW_ACCEPT' && this.metrics) {
      recordPhysicalStateGtR1ExpectedFix(this.metrics, {
        source: input.scope.provider,
      });
    }

    return comparison;
  }

  private recordWriterMetrics(
    source: string,
    decision: DeviceConnectionPhysicalTransitionDecision | 'DISABLED',
    policy: EffectivePhysicalStateRuntimePolicy,
  ): void {
    if (!this.metrics) return;
    const mode = policy.statefulShadow ? 'stateful_shadow' : 'projection_write';
    recordPhysicalStateEvidenceWriterResult(this.metrics, {
      source,
      decision: String(decision),
      mode,
    });
  }
}
