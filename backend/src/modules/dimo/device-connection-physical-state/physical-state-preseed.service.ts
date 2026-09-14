import { Injectable, Logger } from '@nestjs/common';
import {
  DeviceConnectionPhysicalAuthorityMode,
  DeviceConnectionPhysicalTransitionDecision,
} from '@prisma/client';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import { PrismaService } from '@shared/database/prisma.service';
import { buildBindingScopeFromToken, normalizeConnectivityProvider } from './device-connection-physical-state.binding';
import type { CurrentPhysicalStateProjection } from './device-connection-physical-state.types';
import { discoverPhysicalStatePreseedCandidates } from './physical-state-preseed-evidence.discovery';
import {
  mapPreseedDecisionAfterApply,
  planPhysicalStatePreseed,
} from './physical-state-preseed.planner';
import { recordPhysicalStatePreseedResult } from './physical-state-preseed.metrics';
import type {
  PhysicalStatePreseedExecutionResult,
  PhysicalStatePreseedPlan,
  PhysicalStatePreseedScope,
} from './physical-state-preseed.types';
import { isPhysicalStateCoordinatorReconciled } from './device-connection-physical-state.types';
import { PhysicalStateReconcileCoordinator } from './physical-state-reconcile.coordinator';

@Injectable()
export class PhysicalStatePreseedService {
  private readonly logger = new Logger(PhysicalStatePreseedService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly coordinator: PhysicalStateReconcileCoordinator,
    private readonly metrics: TripMetricsService,
  ) {}

  async planPhysicalStatePreseed(scope: PhysicalStatePreseedScope): Promise<PhysicalStatePreseedPlan> {
    const binding = buildBindingScopeFromToken({
      provider: scope.provider,
      tokenId: scope.tokenId,
      deviceBindingId: scope.deviceBindingId ?? null,
    });
    const provider = normalizeConnectivityProvider(scope.provider);

    const [existingProjection, candidates] = await Promise.all([
      this.loadExistingProjection(scope, provider, binding.bindingKey),
      discoverPhysicalStatePreseedCandidates(this.prisma, scope),
    ]);

    return planPhysicalStatePreseed({
      scope,
      binding,
      existingProjection,
      candidates,
    });
  }

  async dryRunPhysicalStatePreseed(
    scope: PhysicalStatePreseedScope,
  ): Promise<PhysicalStatePreseedExecutionResult> {
    const plan = await this.planPhysicalStatePreseed(scope);
    const result = this.toExecutionResult(plan, {
      dryRun: true,
      reconcileDecision: null,
      episodeAction: null,
      alertAction: null,
      projectionStateVersion: plan.existingProjection?.stateVersion ?? null,
    });
    this.recordMetrics(result);
    return result;
  }

  async applyPhysicalStatePreseed(
    scope: PhysicalStatePreseedScope,
  ): Promise<PhysicalStatePreseedExecutionResult> {
    const plan = await this.planPhysicalStatePreseed(scope);

    if (plan.decision !== 'WOULD_ESTABLISH' || !plan.selectedCandidate) {
      const result = this.toExecutionResult(plan, {
        dryRun: false,
        reconcileDecision: null,
        episodeAction: null,
        alertAction: null,
        projectionStateVersion: plan.existingProjection?.stateVersion ?? null,
      });
      this.recordMetrics(result);
      return result;
    }

    const provider = normalizeConnectivityProvider(scope.provider);
    const binding = buildBindingScopeFromToken({
      provider: scope.provider,
      tokenId: scope.tokenId,
      deviceBindingId: scope.deviceBindingId ?? null,
    });

    const coordinatorResult = await this.coordinator.reconcileInOuterTransaction(
      {
        reconcile: {
          organizationId: scope.organizationId,
          vehicleId: scope.vehicleId,
          tokenId: scope.tokenId,
          binding,
          evidence: {
            candidateState: plan.selectedCandidate.candidateState,
            evidenceObservedAt: plan.selectedCandidate.evidenceObservedAt,
            evidenceSource: plan.selectedCandidate.evidenceSource,
            evidenceReferenceId: plan.selectedCandidate.evidenceReferenceId,
          },
          selfHeal: false,
        },
        webhookEventUpsert: null,
      },
      { sideEffectsEnabled: false, requireLegacyAuthorityForPreseed: true },
    );

    if (coordinatorResult.kind === 'pre_cutover_authority_blocked') {
      const blockedResult = this.toExecutionResult(plan, {
        dryRun: false,
        reconcileDecision: null,
        episodeAction: null,
        alertAction: null,
        projectionStateVersion: plan.existingProjection?.stateVersion ?? null,
      });
      const result: PhysicalStatePreseedExecutionResult = {
        ...blockedResult,
        decision: 'SKIP_NON_LEGACY_AUTHORITY',
        reason: 'authority_not_legacy',
        wouldWrite: {
          projection: false,
          transition: false,
          outbox: false,
          episode: false,
          alert: false,
          authorityMode: false,
          eventHistory: false,
        },
      };
      this.recordMetrics(result);
      return result;
    }

    if (!isPhysicalStateCoordinatorReconciled(coordinatorResult)) {
      throw new Error('preseed_expected_reconciled_coordinator_result');
    }

    const reconcile = coordinatorResult.reconcile;
    const projectionExists = Boolean(reconcile.projection);

    if (
      reconcile.decision !== DeviceConnectionPhysicalTransitionDecision.ESTABLISHED &&
      reconcile.decision !== DeviceConnectionPhysicalTransitionDecision.DUPLICATE
    ) {
      this.logger.warn(
        `preseed unexpected reconcile decision=${reconcile.decision} vehicle=${scope.vehicleId} binding=${binding.bindingKey}`,
      );
    }

    if (
      reconcile.decision === DeviceConnectionPhysicalTransitionDecision.ESTABLISHED &&
      (reconcile.episodeAction !== 'none' || reconcile.alertAction !== 'none')
    ) {
      throw new Error(
        `preseed_established_side_effect_violation episode=${reconcile.episodeAction} alert=${reconcile.alertAction}`,
      );
    }

    const finalDecision = mapPreseedDecisionAfterApply({
      plan,
      reconcileDecision: reconcile.decision,
      projectionExists,
    });

    const finalPlan: PhysicalStatePreseedPlan = {
      ...plan,
      decision: finalDecision,
      reason:
        finalDecision === 'ESTABLISHED'
          ? 'established_projection'
          : finalDecision === 'SKIPPED_ALREADY_ESTABLISHED'
            ? 'already_established_duplicate'
            : 'unexpected_reconcile_decision',
      wouldWrite: plan.wouldWrite,
    };

    const result = this.toExecutionResult(finalPlan, {
      dryRun: false,
      reconcileDecision: reconcile.decision,
      episodeAction: reconcile.episodeAction,
      alertAction: reconcile.alertAction,
      projectionStateVersion: reconcile.projection?.stateVersion ?? null,
    });
    this.recordMetrics(result);
    return result;
  }

  async readAuthorityMode(scope: {
    organizationId: string;
    vehicleId: string;
    provider: string;
  }): Promise<DeviceConnectionPhysicalAuthorityMode> {
    const provider = normalizeConnectivityProvider(scope.provider);
    const row = await this.prisma.deviceConnectionPhysicalAuthorityCutover.findFirst({
      where: {
        organizationId: scope.organizationId,
        vehicleId: scope.vehicleId,
        provider,
      },
      select: { authorityMode: true },
    });
    return row?.authorityMode ?? DeviceConnectionPhysicalAuthorityMode.LEGACY;
  }

  private async loadExistingProjection(
    scope: PhysicalStatePreseedScope,
    provider: string,
    bindingKey: string,
  ): Promise<CurrentPhysicalStateProjection | null> {
    const row = await this.prisma.deviceConnectionPhysicalState.findFirst({
      where: {
        organizationId: scope.organizationId,
        vehicleId: scope.vehicleId,
        provider,
        bindingKey,
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

  private toExecutionResult(
    plan: PhysicalStatePreseedPlan,
    tail: {
      dryRun: boolean;
      reconcileDecision: string | null;
      episodeAction: string | null;
      alertAction: string | null;
      projectionStateVersion: number | null;
    },
  ): PhysicalStatePreseedExecutionResult {
    return {
      ...plan,
      ...tail,
    };
  }

  private recordMetrics(result: PhysicalStatePreseedExecutionResult): void {
    recordPhysicalStatePreseedResult(this.metrics, {
      result: result.decision,
      provider: normalizeConnectivityProvider(result.scope.provider),
      dry_run: result.dryRun ? 'true' : 'false',
    });
  }
}
