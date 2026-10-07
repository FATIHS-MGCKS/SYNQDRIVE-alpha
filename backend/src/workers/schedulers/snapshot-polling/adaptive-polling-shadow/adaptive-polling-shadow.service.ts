import { Injectable, Logger, Optional } from '@nestjs/common';
import { TripDetectionState } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { P25_APD_B2_V1, P25_APD_B4_V1 } from '../adaptive-polling-policy/p25-apd-policy-versions';
import {
  evaluateP25ApdB4V1Core,
  evaluateP25ApdB2V1Core,
} from '../adaptive-polling-policy/p25-apd-policy-engine';
import { evaluateP25ApdProfile } from '../adaptive-polling-policy/p25-apd-profile-evaluator';
import { applyP25ApdShadowSafetyOverlay } from '../adaptive-polling-policy/p25-apd-shadow-overlay';
import type { P25ApdShadowPrePollInput } from '../adaptive-polling-policy/p25-apd-shadow-decision.types';
import { isApdShadowEnabled } from './adaptive-polling-shadow.config';
import {
  buildApdShadowTenantMemoryKey,
  cohortExcludedReasonForRuntime,
  isApdShadowCohortMember,
  parseApdShadowCohortRuntime,
  type ApdShadowCohortExcludedReason,
  type ApdShadowCohortRuntime,
} from './adaptive-polling-shadow-cohort.config';
import { AdaptivePollingShadowMetricsService } from './adaptive-polling-shadow-metrics.service';
import { AdaptivePollingShadowRepository } from './adaptive-polling-shadow.repository';
import { buildApdShadowOpportunityId } from './apd-shadow-opportunity.util';
import type {
  AdaptivePollingShadowPostPollContext,
  AdaptivePollingShadowPrePollContext,
  AdaptivePollingShadowPrePollResult,
} from './adaptive-polling-shadow.types';

@Injectable()
export class AdaptivePollingShadowService {
  private readonly logger = new Logger(AdaptivePollingShadowService.name);
  private readonly shadowLastAllowedMs = new Map<
    string,
    { b2: number; b4: number }
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: AdaptivePollingShadowRepository,
    @Optional() private readonly metrics?: AdaptivePollingShadowMetricsService,
  ) {
    this.refreshRuntimeMetrics();
  }

  /** Global flag only — prefer {@link isEnabledForVehicle} at call sites. */
  isEnabled(): boolean {
    return isApdShadowEnabled();
  }

  getCohortRuntime(): ApdShadowCohortRuntime {
    return parseApdShadowCohortRuntime();
  }

  isEnabledForVehicle(organizationId: string, vehicleId: string): boolean {
    if (!isApdShadowEnabled()) return false;
    const runtime = this.getCohortRuntime();
    if (runtime.state !== 'READY' || !runtime.config) return false;
    return isApdShadowCohortMember(runtime.config, organizationId, vehicleId);
  }

  getCohortVerificationSummary(): {
    cohortState: string;
    cohortMemberCount: number;
    cohortConfigFingerprintSha256: string | null;
  } {
    const runtime = this.getCohortRuntime();
    return {
      cohortState: runtime.state,
      cohortMemberCount: runtime.config?.members.length ?? 0,
      cohortConfigFingerprintSha256: runtime.configFingerprintSha256,
    };
  }

  private refreshRuntimeMetrics(): void {
    const runtime = this.getCohortRuntime();
    this.metrics?.setEnabled(isApdShadowEnabled() && runtime.state === 'READY');
    if (runtime.configFingerprintSha256) {
      this.metrics?.setCohortConfigFingerprint(runtime.configFingerprintSha256);
    }
    if (runtime.config) {
      this.metrics?.setCohortMemberCount(runtime.config.members.length);
    }
  }

  private recordCohortGateBlocked(reason: ApdShadowCohortExcludedReason): void {
    this.metrics?.recordCohortExcluded(reason);
  }

  private assertCohortVehicleAllowed(
    organizationId: string,
    vehicleId: string,
  ): boolean {
    if (!isApdShadowEnabled()) return false;
    const runtime = this.getCohortRuntime();
    if (runtime.state !== 'READY' || !runtime.config) {
      const reason = cohortExcludedReasonForRuntime(runtime);
      if (reason) this.recordCohortGateBlocked(reason);
      return false;
    }
    if (!isApdShadowCohortMember(runtime.config, organizationId, vehicleId)) {
      this.recordCohortGateBlocked('NOT_ALLOWLISTED');
      return false;
    }
    return true;
  }

  /**
   * Observe-only pre-poll evaluation. Fail-open: never throws to caller.
   */
  async observePrePoll(
    ctx: AdaptivePollingShadowPrePollContext,
  ): Promise<AdaptivePollingShadowPrePollResult | null> {
    if (!this.assertCohortVehicleAllowed(ctx.organizationId, ctx.vehicleId)) {
      return null;
    }
    try {
      return await this.observePrePollInner(ctx);
    } catch (err) {
      this.metrics?.recordFailure('pre_poll');
      this.logger.warn(
        `APD shadow pre-poll failed (non-blocking): ${err instanceof Error ? err.message : err}`,
      );
      return null;
    }
  }

  async observePostPoll(ctx: AdaptivePollingShadowPostPollContext): Promise<void> {
    if (!this.assertCohortVehicleAllowed(ctx.organizationId, ctx.vehicleId)) {
      return;
    }
    try {
      await this.observePostPollInner(ctx);
    } catch (err) {
      this.metrics?.recordFailure('post_poll');
      this.logger.warn(
        `APD shadow post-poll failed (non-blocking): ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  private async observePrePollInner(
    ctx: AdaptivePollingShadowPrePollContext,
  ): Promise<AdaptivePollingShadowPrePollResult> {
    const opportunityId = buildApdShadowOpportunityId({
      organizationId: ctx.organizationId,
      vehicleId: ctx.vehicleId,
      decisionAtMs: ctx.decisionAtMs,
      origin: ctx.origin,
    });

    const tripActive =
      ctx.tripDetectionState === TripDetectionState.ACTIVE_TRIP ||
      ctx.tripDetectionState === TripDetectionState.POSSIBLE_START;

    const lvTimestamps =
      ctx.lvProviderTimestampsMs.length > 0
        ? ctx.lvProviderTimestampsMs
        : await this.loadRecentLvProviderTimestampsMs(ctx.vehicleId);

    const profile = evaluateP25ApdProfile({
      nowMs: ctx.decisionAtMs,
      lvProviderTimestampsMs: lvTimestamps,
      providerGapOpen: ctx.providerGapOpen,
      tripActive,
      r9WakeRecent: ctx.r9WakeKnown,
      deviceReconnectRecent: ctx.deviceReconnectRecent,
      providerReconnectRecent: ctx.providerReconnectRecent,
      earlyAdvanceDetected: false,
      lateAdvanceDetected: false,
      phaseDriftDetected: false,
      capabilityChanged: false,
    });

    if (profile.invalidated && profile.invalidationReason) {
      this.metrics?.recordProfileInvalidated(profile.invalidationReason);
    }

    const memoryKey = buildApdShadowTenantMemoryKey(
      ctx.organizationId,
      ctx.vehicleId,
    );
    const last = this.shadowLastAllowedMs.get(memoryKey) ?? { b2: 0, b4: 0 };
    const medianIntervalMs =
      profile.medianCadenceMs > 0 ? profile.medianCadenceMs : 8 * 3600 * 1000;

    const baseInput: Omit<P25ApdShadowPrePollInput, 'profileClass' | 'lastAllowedReconciliationPollMs'> = {
      organizationId: ctx.organizationId,
      vehicleId: ctx.vehicleId,
      decisionAtMs: ctx.decisionAtMs,
      reconciliation: ctx.reconciliation,
      lastTrustworthyLvSourceMs: ctx.lastTrustworthyLvSourceMs,
      lastProviderFetchedAtMs: ctx.lastProviderFetchedAtMs,
      profileVersion: profile.profileVersion,
      medianIntervalMs,
      tripFsmActive: tripActive,
      providerGapOpen: ctx.providerGapOpen,
      r9WakePending: ctx.r9WakeKnown,
    };

    const overlay = {
      r9WakeKnown: ctx.r9WakeKnown,
      profileInvalidated: profile.invalidated,
      invalidationReason: profile.invalidationReason,
      providerGapOpen: ctx.providerGapOpen,
      sourceTimestampMissing: ctx.lastTrustworthyLvSourceMs == null,
      reconnectPending: ctx.deviceReconnectRecent || ctx.providerReconnectRecent,
    };

    const policies = [
      { version: P25_APD_B2_V1, lastAllowed: last.b2, evaluate: evaluateP25ApdB2V1Core },
      { version: P25_APD_B4_V1, lastAllowed: last.b4, evaluate: evaluateP25ApdB4V1Core },
    ] as const;

    const nextLast = { ...last };
    for (const p of policies) {
      const input: P25ApdShadowPrePollInput = {
        ...baseInput,
        profileClass: profile.profileClass,
        lastAllowedReconciliationPollMs: p.lastAllowed,
      };
      const core = p.evaluate(input);
      const decision = applyP25ApdShadowSafetyOverlay(core, overlay);
      this.metrics?.recordDecision(p.version, decision.decision, decision.reason);

      if (
        decision.decision === 'WOULD_POLL' ||
        decision.decision === 'FORCED_TRIP_SAFETY' ||
        decision.decision === 'IMMEDIATE_SNAPSHOT_REQUIRED'
      ) {
        if (p.version === P25_APD_B2_V1) nextLast.b2 = ctx.decisionAtMs;
        if (p.version === P25_APD_B4_V1) nextLast.b4 = ctx.decisionAtMs;
      }

      await this.repository.upsertPrePollDecision({
        organizationId: ctx.organizationId,
        vehicleId: ctx.vehicleId,
        opportunityId,
        decisionAt: new Date(ctx.decisionAtMs),
        policyVersion: p.version,
        profileVersion: profile.profileVersion,
        profileClass: profile.profileClass,
        decision: decision.decision,
        reason: decision.reason,
        lastLvSourceAt: ctx.lastTrustworthyLvSourceMs
          ? new Date(ctx.lastTrustworthyLvSourceMs)
          : null,
        lastProviderFetchedAt: ctx.lastProviderFetchedAtMs
          ? new Date(ctx.lastProviderFetchedAtMs)
          : null,
        expectedWindowStart: decision.expectedWindowStartMs
          ? new Date(decision.expectedWindowStartMs)
          : null,
        expectedWindowEnd: decision.expectedWindowEndMs
          ? new Date(decision.expectedWindowEndMs)
          : null,
        providerGapState: ctx.providerGapOpen ? 'OPEN' : 'CLOSED',
        connectivityState: ctx.connectivityState,
        wakeCorrelationId: ctx.wakeCorrelationId,
      });
    }
    this.shadowLastAllowedMs.set(memoryKey, nextLast);

    return { opportunityId };
  }

  private async loadRecentLvProviderTimestampsMs(
    vehicleId: string,
  ): Promise<number[]> {
    const rows = await this.prisma.batteryMeasurement.findMany({
      where: {
        vehicleId,
        type: 'LIVE_VOLTAGE',
        quality: 'VALID',
        providerTimestamp: { not: null },
      },
      orderBy: { providerTimestamp: 'desc' },
      take: 24,
      select: { providerTimestamp: true },
    });
    return rows
      .map((r) => r.providerTimestamp?.getTime())
      .filter((t): t is number => t != null)
      .sort((a, b) => a - b);
  }

  private async observePostPollInner(
    ctx: AdaptivePollingShadowPostPollContext,
  ): Promise<void> {
    const newLv =
      ctx.newLvSourceMs != null &&
      (ctx.previousLvSourceMs == null || ctx.newLvSourceMs > ctx.previousLvSourceMs);
    const newTop =
      ctx.newTopLevelSourceMs != null &&
      (ctx.previousTopLevelSourceMs == null ||
        ctx.newTopLevelSourceMs > ctx.previousTopLevelSourceMs);

    if (newLv) this.metrics?.recordInformativeRealPoll('lv');
    if (newTop) this.metrics?.recordInformativeRealPoll('top_level');

    const patch = {
      realPollCompletedAt: new Date(ctx.pollCompletedAtMs),
      newLvSourceObserved: newLv,
      newLvSourceAt: newLv && ctx.newLvSourceMs ? new Date(ctx.newLvSourceMs) : null,
      newTopLevelSourceObserved: newTop,
      legacyAssessmentImpact: 'NONE',
      legacyPublicationImpact: 'NONE',
      legacyCustomerImpact: 'NONE',
    };

    for (const policyVersion of [P25_APD_B2_V1, P25_APD_B4_V1]) {
      await this.repository.updateOutcome({
        organizationId: ctx.organizationId,
        vehicleId: ctx.vehicleId,
        opportunityId: ctx.opportunityId,
        policyVersion,
        patch,
      });
    }
  }
}
