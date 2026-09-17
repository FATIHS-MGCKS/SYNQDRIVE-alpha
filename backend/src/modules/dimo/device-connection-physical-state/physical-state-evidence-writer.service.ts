import { Injectable, Logger, Optional } from '@nestjs/common';
import {
  DeviceConnectionPhysicalAuthorityMode,
  DeviceConnectionPhysicalEvidenceSource,
  DeviceConnectionPhysicalTransitionDecision,
  DimoDeviceConnectionEventType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import { loadShadowPilotScopesFromEnv } from '@config/connectivity-physical-state-shadow-pilot-scope.config';
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
import {
  evaluatePhysicalStateTransition,
  isAcceptedPhysicalTransition,
} from './device-connection-physical-state.policy';
import type { CurrentPhysicalStateProjection } from './device-connection-physical-state.types';
import type { EffectivePhysicalStateRuntimePolicy } from './physical-state-authority.types';
import { PhysicalStateCanonicalGate } from './physical-state-authority.types';
import {
  isProvenExpectedFixForPhysicalDecision,
  type GtR1ExpectedFixProof,
} from './physical-state-gt-r1-proof';
import type { LegacyShadowDecision } from './physical-state-legacy-shadow-decision';
import { isPhysicalStateCoordinatorReconciled } from './device-connection-physical-state.types';
import { PhysicalStateReconcileCoordinator } from './physical-state-reconcile.coordinator';
import { comparePhysicalStateShadowDecisions } from './physical-state-shadow-comparator';
import { PhysicalStateShadowObservabilityService } from './physical-state-shadow-observability.service';
import {
  recordPhysicalStateEvidenceWriterResult,
  recordPhysicalStateGtR1ExpectedFix,
  recordPhysicalStateStatefulShadowEvaluation,
} from './physical-state-evidence-writer.metrics';
import {
  applyPilotGateToRuntimeFlags,
  evaluateShadowPilotScopeGate,
  isUnsafePilotShadowFlagConfiguration,
} from './physical-state-shadow-pilot-scope';
import { recordShadowPilotScopeGateObservability } from './physical-state-shadow-pilot-scope.observability';
import type { ShadowPilotScopeGateDecision } from './physical-state-shadow-pilot-scope.types';
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
    return loadConnectivityPhysicalStateRuntimeFlagConfig().masterEnabled;
  }

  /**
   * MASTER OFF => fail closed with LEGACY/disabled policy and zero DB mutations.
   */
  resolveRuntimePolicyWithoutDb(): EffectivePhysicalStateRuntimePolicy {
    const flags = loadConnectivityPhysicalStateRuntimeFlagConfig();
    return resolveEffectivePhysicalStateRuntimePolicy({
      authorityMode: DeviceConnectionPhysicalAuthorityMode.LEGACY,
      flags,
      pilotScopeAllowed: false,
      pilotGateReason: 'DENIED_NOT_CONFIGURED',
    });
  }

  async readAuthorityModeForRouting(scope: {
    organizationId: string;
    vehicleId: string;
    provider: string;
  }): Promise<DeviceConnectionPhysicalAuthorityMode> {
    return this.authorityCutoverRepository.readAuthorityModeWithoutMutation(scope);
  }

  async resolveRuntimePolicy(scope: {
    organizationId: string;
    vehicleId: string;
    provider: string;
  }): Promise<EffectivePhysicalStateRuntimePolicy> {
    const flags = loadConnectivityPhysicalStateRuntimeFlagConfig();
    const authorityMode = await this.readAuthorityModeForRouting(scope);

    if (!flags.masterEnabled) {
      if (authorityMode === DeviceConnectionPhysicalAuthorityMode.PHYSICAL) {
        return resolveEffectivePhysicalStateRuntimePolicy({
          authorityMode,
          flags: {
            masterEnabled: false,
            projectionWriteEnabled: false,
            shadowCompareEnabled: false,
            authorityCutoverEnabled: false,
            sideEffectsEnabled: false,
          },
          pilotScopeAllowed: true,
          pilotGateReason: 'BYPASSED_PHYSICAL_AUTHORITY',
        });
      }
      return this.resolveRuntimePolicyWithoutDb();
    }

    const pilotConfig = loadShadowPilotScopesFromEnv();
    const pilotGate = evaluateShadowPilotScopeGate({
      scope,
      authorityMode,
      pilotConfig,
    });
    this.recordPilotGate(scope, pilotGate);

    if (authorityMode === DeviceConnectionPhysicalAuthorityMode.PHYSICAL) {
      const ensuredMode = await this.ensureAuthorityMode(scope);
      return resolveEffectivePhysicalStateRuntimePolicy({
        authorityMode: ensuredMode,
        flags,
        pilotScopeAllowed: true,
        pilotGateReason: pilotGate.reason,
      });
    }

    const unsafeFlagReason = isUnsafePilotShadowFlagConfiguration(flags);
    if (unsafeFlagReason) {
      return resolveEffectivePhysicalStateRuntimePolicy({
        authorityMode: DeviceConnectionPhysicalAuthorityMode.LEGACY,
        flags: applyPilotGateToRuntimeFlags(flags, {
          allowed: false,
          reason: unsafeFlagReason,
        }),
        pilotScopeAllowed: false,
        pilotGateReason: unsafeFlagReason,
      });
    }

    if (!pilotGate.allowed) {
      return resolveEffectivePhysicalStateRuntimePolicy({
        authorityMode: DeviceConnectionPhysicalAuthorityMode.LEGACY,
        flags: applyPilotGateToRuntimeFlags(flags, pilotGate),
        pilotScopeAllowed: false,
        pilotGateReason: pilotGate.reason,
      });
    }

    const ensuredMode = await this.ensureAuthorityMode(scope);
    return resolveEffectivePhysicalStateRuntimePolicy({
      authorityMode: ensuredMode,
      flags,
      pilotScopeAllowed: true,
      pilotGateReason: pilotGate.reason,
    });
  }

  async shouldRoutePhysicalAuthority(scope: {
    organizationId: string;
    vehicleId: string;
    provider: string;
  }): Promise<boolean> {
    const policy = await this.resolveRuntimePolicy(scope);
    return policy.physicalGateAuthoritative;
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

    if (!this.isPhysicalWriterPathActive(policy)) {
      return this.pilotOrDisabledResult(input.legacyShadow, policy);
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
        legacyShadow: input.legacyShadow,
        physicalAccepted: false,
        physicalDecision: DeviceConnectionPhysicalTransitionDecision.INSUFFICIENT_EVIDENCE,
        skippedReason: 'insufficient_webhook_evidence',
      };
    }

    let coordinatorResult = null;
    let readOnlyDecision: DeviceConnectionPhysicalTransitionDecision | null = null;
    let readOnlyReason: string | undefined;

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

      if (!isPhysicalStateCoordinatorReconciled(coordinatorResult)) {
        throw new Error('evidence_writer_unexpected_pre_cutover_authority_block');
      }

      recordPhysicalStateReconcileDecision(coordinatorResult.reconcile);
      this.recordWriterMetrics(
        'WEBHOOK',
        coordinatorResult.reconcile.decision,
        policy,
      );
    } else if (policy.physicalGateAuthoritative) {
      const evaluation = await this.evaluateWebhookEvidenceReadOnly(
        input,
        extracted,
      );
      readOnlyDecision = evaluation.decision;
      readOnlyReason = evaluation.reason;
    }

    const rawPhysicalDecision =
      coordinatorResult && isPhysicalStateCoordinatorReconciled(coordinatorResult)
        ? coordinatorResult.reconcile.decision
        : readOnlyDecision;
    const physicalDecision = normalizeCoordinatorPhysicalDecision(rawPhysicalDecision);
    const physicalAccepted =
      physicalDecision != null && isAcceptedPhysicalTransition(physicalDecision);

    const shadowComparison = await this.maybeRecordShadowComparison({
      policy,
      scope,
      legacyShadow: input.legacyShadow,
      physicalBindingKey: extracted.binding.bindingKey,
      physicalDecision,
      physicalAccepted,
      physicalReason:
        coordinatorResult && isPhysicalStateCoordinatorReconciled(coordinatorResult)
          ? coordinatorResult.reconcile.reason
          : readOnlyReason,
      physicalEffectiveState: physicalAccepted ? extracted.candidateState : null,
      evidenceObservedAt: extracted.evidenceObservedAt,
      evidenceReferenceId: extracted.evidenceReferenceId,
      gtR1Proof: input.gtR1Proof,
      equalTimeOpposingState:
        physicalDecision === DeviceConnectionPhysicalTransitionDecision.CONFLICT,
    });

    return {
      enabled: true,
      policy,
      coordinatorResult,
      shadowComparison,
      legacyShadow: input.legacyShadow,
      physicalAccepted,
      physicalDecision: rawPhysicalDecision,
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

    if (!this.isPhysicalWriterPathActive(policy)) {
      return this.pilotOrDisabledResult(input.legacyShadow, policy);
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
        legacyShadow: input.legacyShadow,
        physicalAccepted: false,
        physicalDecision: null,
        skippedReason: 'insufficient_snapshot_obd_evidence',
      };
    }

    let coordinatorResult = null;
    let readOnlyDecision: DeviceConnectionPhysicalTransitionDecision | null = null;
    let readOnlyReason: string | undefined;

    if (policy.projectionWriteEnabled) {
      const projectionSelfHeal =
        input.projectionSelfHeal ?? extracted.candidateState === 'PLUGGED';

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

      if (!isPhysicalStateCoordinatorReconciled(coordinatorResult)) {
        throw new Error('evidence_writer_unexpected_pre_cutover_authority_block');
      }

      recordPhysicalStateReconcileDecision(coordinatorResult.reconcile);
      this.recordWriterMetrics(
        'SNAPSHOT_OBD',
        coordinatorResult.reconcile.decision,
        policy,
      );
    } else if (policy.physicalGateAuthoritative) {
      const evaluation = await this.evaluateSnapshotEvidenceReadOnly(input, extracted);
      readOnlyDecision = evaluation.decision;
      readOnlyReason = evaluation.reason;
    }

    const rawPhysicalDecision =
      coordinatorResult && isPhysicalStateCoordinatorReconciled(coordinatorResult)
        ? coordinatorResult.reconcile.decision
        : readOnlyDecision;
    const physicalDecision = normalizeCoordinatorPhysicalDecision(rawPhysicalDecision);
    const physicalAccepted =
      physicalDecision != null && isAcceptedPhysicalTransition(physicalDecision);

    const shadowComparison = await this.maybeRecordShadowComparison({
      policy,
      scope,
      legacyShadow: input.legacyShadow,
      physicalBindingKey: extracted.binding.bindingKey,
      physicalDecision,
      physicalAccepted,
      physicalReason:
        coordinatorResult && isPhysicalStateCoordinatorReconciled(coordinatorResult)
          ? coordinatorResult.reconcile.reason
          : readOnlyReason,
      physicalEffectiveState: physicalAccepted ? extracted.candidateState : null,
      evidenceObservedAt: extracted.evidenceObservedAt,
      evidenceReferenceId: extracted.evidenceReferenceId,
      gtR1Proof: input.gtR1Proof,
      equalTimeOpposingState:
        physicalDecision === DeviceConnectionPhysicalTransitionDecision.CONFLICT,
    });

    return {
      enabled: true,
      policy,
      coordinatorResult,
      shadowComparison,
      legacyShadow: input.legacyShadow,
      physicalAccepted,
      physicalDecision: rawPhysicalDecision,
    };
  }

  private async evaluateWebhookEvidenceReadOnly(
    input: WebhookEvidenceWriterInput,
    extracted: {
      binding: { bindingKey: string };
      candidateState: 'PLUGGED' | 'UNPLUGGED';
      evidenceObservedAt: Date;
      evidenceReferenceId: string;
    },
  ) {
    const projection = await this.loadProjection(
      input.vehicleId,
      input.provider,
      extracted.binding.bindingKey,
    );
    return evaluatePhysicalStateTransition({
      current: projection,
      incoming: {
        candidateState: extracted.candidateState,
        evidenceObservedAt: extracted.evidenceObservedAt,
        evidenceSource: DeviceConnectionPhysicalEvidenceSource.WEBHOOK,
        evidenceReferenceId: extracted.evidenceReferenceId,
      },
    });
  }

  private async evaluateSnapshotEvidenceReadOnly(
    input: SnapshotEvidenceWriterInput,
    extracted: {
      binding: { bindingKey: string };
      candidateState: 'PLUGGED' | 'UNPLUGGED';
      evidenceObservedAt: Date;
      evidenceReferenceId: string;
    },
  ) {
    const projection = await this.loadProjection(
      input.vehicleId,
      'DIMO',
      extracted.binding.bindingKey,
    );
    return evaluatePhysicalStateTransition({
      current: projection,
      incoming: {
        candidateState: extracted.candidateState,
        evidenceObservedAt: extracted.evidenceObservedAt,
        evidenceSource: DeviceConnectionPhysicalEvidenceSource.SNAPSHOT_OBD,
        evidenceReferenceId: extracted.evidenceReferenceId,
      },
    });
  }

  private async loadProjection(
    vehicleId: string,
    provider: string,
    bindingKey: string,
  ): Promise<CurrentPhysicalStateProjection | null> {
    const row = await this.prisma.deviceConnectionPhysicalState.findFirst({
      where: { vehicleId, provider, bindingKey },
      select: {
        effectiveState: true,
        evidenceObservedAt: true,
        evidenceSource: true,
        evidenceReferenceId: true,
        stateVersion: true,
      },
    });
    if (!row) return null;
    return {
      effectiveState: row.effectiveState,
      evidenceObservedAt: row.evidenceObservedAt,
      evidenceSource: row.evidenceSource,
      evidenceReferenceId: row.evidenceReferenceId,
      stateVersion: row.stateVersion,
    };
  }

  private async ensureAuthorityMode(scope: {
    organizationId: string;
    vehicleId: string;
    provider: string;
  }): Promise<DeviceConnectionPhysicalAuthorityMode> {
    return this.prisma.$transaction(async (tx) => {
      const row = await this.authorityCutoverRepository.ensureAuthorityRow(tx, scope);
      return row.authorityMode;
    });
  }

  private recordPilotGate(
    scope: { organizationId: string; vehicleId: string; provider: string },
    decision: ShadowPilotScopeGateDecision,
  ): void {
    recordShadowPilotScopeGateObservability(this.metrics, scope, decision);
  }

  private isPhysicalWriterPathActive(policy: EffectivePhysicalStateRuntimePolicy): boolean {
    return policy.physicalGateAuthoritative || policy.statefulShadow;
  }

  private pilotOrDisabledResult(
    legacyShadow: LegacyShadowDecision,
    policy: EffectivePhysicalStateRuntimePolicy,
  ): PhysicalEvidenceWriterResult {
    if (!policy.masterEnabled) {
      return this.disabledResult(legacyShadow);
    }

    return {
      enabled: false,
      policy,
      coordinatorResult: null,
      shadowComparison: null,
      legacyShadow,
      physicalAccepted: false,
      physicalDecision: 'DISABLED',
      skippedReason: `pilot_scope_${policy.pilotGateReason.toLowerCase()}`,
    };
  }

  private disabledResult(legacyShadow: LegacyShadowDecision): PhysicalEvidenceWriterResult {
    return {
      enabled: false,
      policy: this.resolveRuntimePolicyWithoutDb(),
      coordinatorResult: null,
      shadowComparison: null,
      legacyShadow,
      physicalAccepted: false,
      physicalDecision: 'DISABLED',
      skippedReason: 'master_disabled',
    };
  }

  private async maybeRecordShadowComparison(input: {
    policy: EffectivePhysicalStateRuntimePolicy;
    scope: { organizationId: string; vehicleId: string; provider: string };
    legacyShadow: LegacyShadowDecision;
    physicalBindingKey: string;
    physicalDecision: DeviceConnectionPhysicalTransitionDecision | null;
    physicalAccepted: boolean;
    physicalReason?: string;
    physicalEffectiveState: 'PLUGGED' | 'UNPLUGGED' | null;
    evidenceObservedAt: Date;
    evidenceReferenceId: string;
    gtR1Proof?: GtR1ExpectedFixProof | null;
    equalTimeOpposingState?: boolean;
  }): Promise<ReturnType<typeof comparePhysicalStateShadowDecisions> | null> {
    if (!input.policy.shadowCompareEnabled) return null;

    if (input.policy.statefulShadow && this.metrics) {
      recordPhysicalStateStatefulShadowEvaluation(this.metrics, {
        mode: 'stateful_shadow',
      });
    }

    const comparison = comparePhysicalStateShadowDecisions({
      scope: input.scope,
      authorityMode: input.policy.authorityMode,
      bindingKey: input.physicalBindingKey,
      legacyBindingKey: input.legacyShadow.bindingKey,
      physicalBindingKey: input.physicalBindingKey,
      legacyDecision: {
        accepted: input.legacyShadow.accepted,
        reason: input.legacyShadow.diagnosticReason,
        gate: PhysicalStateCanonicalGate.LEGACY,
      },
      physicalDecision: {
        accepted: input.physicalAccepted,
        reason: input.physicalReason,
        gate: PhysicalStateCanonicalGate.PHYSICAL,
        transitionDecision: input.physicalDecision,
        effectiveState: input.physicalEffectiveState,
      },
      legacyEffectivePlugState: input.legacyShadow.effectivePlugState,
      legacyEvidenceObservedAt: input.legacyShadow.evidenceObservedAt,
      evidenceObservedAt: input.evidenceObservedAt,
      evidenceReferenceId: input.evidenceReferenceId,
      provenExpectedFix: isProvenExpectedFixForPhysicalDecision(
        input.gtR1Proof,
        input.physicalDecision,
      ),
      equalTimeOpposingState: input.equalTimeOpposingState,
    });

    await this.shadowObservability?.recordShadowComparison(comparison);

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

function normalizeCoordinatorPhysicalDecision(
  decision: DeviceConnectionPhysicalTransitionDecision | 'DISABLED' | null,
): DeviceConnectionPhysicalTransitionDecision | null {
  if (!decision || decision === 'DISABLED') return null;
  return decision;
}
