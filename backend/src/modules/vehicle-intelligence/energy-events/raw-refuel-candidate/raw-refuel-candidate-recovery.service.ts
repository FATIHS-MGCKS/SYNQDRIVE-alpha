import { Injectable, Logger, Optional } from '@nestjs/common';
import type {
  FuelType,
  RawRefuelCandidate,
} from '@prisma/client';
import {
  canExecuteRawRefuelCandidateRecovery,
  loadRawFuelRefuelFallbackConfig,
  type RawFuelRefuelFallbackConfig,
} from '@config/raw-fuel-refuel-fallback.config';
import { DimoSegmentsService } from '@modules/dimo/dimo-segments.service';
import { PrismaService } from '@shared/database/prisma.service';
import { detectRawFuelRisesForPersistedSignalChannel } from '../raw-fuel-rise-detector/raw-fuel-rise-detector';
import {
  RFRF_RISE_DETECTION_VERSION,
  RFRF_RISE_DETECTOR_VERSION,
} from '../raw-fuel-rise-detector/raw-fuel-rise-detector.config';
import type { RawFuelRiseDetectionContext } from '../raw-fuel-rise-detector/raw-fuel-signal-sample.types';
import { evaluateRawRefuelCandidateReadiness } from '../raw-fuel-refuel-fallback/raw-refuel-candidate-readiness.evaluator';
import { RawRefuelConvergenceService } from '../raw-fuel-refuel-fallback/raw-refuel-convergence.service';
import { resolveRawFuelCapability } from '../raw-fuel-refuel-fallback/raw-fuel-capability.resolver';
import { resolveRawFuelSignalTrust } from '../raw-fuel-refuel-fallback/raw-fuel-signal-trust.resolver';
import { RawFuelRefuelFallbackMetricsService } from '../raw-fuel-refuel-fallback/raw-fuel-refuel-fallback-metrics.service';
import type { RawFuelAbsoluteDetectionAdmissibility } from '../raw-fuel-refuel-fallback/raw-fuel-refuel-fallback.types';
import { isRawRefuelCandidateTerminal } from './raw-refuel-candidate-lifecycle';
import { classifyRawRefuelCandidateOverlap } from './raw-refuel-candidate.matcher';
import {
  scheduleRecoveryNextAttemptAt,
  type RawRefuelCandidateRecoveryOutcome,
} from './raw-refuel-candidate-recovery-backoff';
import { computeRawRefuelCandidateRecoveryWindow } from './raw-refuel-candidate-recovery-window';
import {
  RawRefuelCandidateRecoveryRepository,
  type ClaimedRawRefuelCandidateRecoveryRow,
} from './raw-refuel-candidate-recovery.repository';
import {
  completeRecoveryAttemptFenced,
  type RawRefuelCandidateRecoveryClaimFence,
} from './raw-refuel-candidate-recovery-fencing';
import { RawRefuelCandidateService } from './raw-refuel-candidate.service';
import type { RawRefuelCandidateObservation } from './raw-refuel-candidate.types';

export interface RawRefuelCandidateRecoveryAttemptResult {
  candidateId: string;
  outcome: RawRefuelCandidateRecoveryOutcome;
  dimoFetchPerformed: boolean;
  convergenceStatus?: string;
  detail?: string;
}

export interface RawRefuelCandidateRecoveryBatchResult {
  claimed: number;
  processed: number;
  outcomes: RawRefuelCandidateRecoveryAttemptResult[];
}

export type RawRefuelCandidateRecoverySampleFetcher = (input: {
  tokenId: number;
  windowFrom: Date;
  windowTo: Date;
  vehicleId: string;
}) => Promise<
  | { status: 'OK'; samples: Array<{ timestamp: Date; absoluteLiters: number | null; relativePercent: number | null }> }
  | { status: 'ERROR'; errorClass: string; message: string }
  | { status: 'EMPTY' }
>;

@Injectable()
export class RawRefuelCandidateRecoveryService {
  private readonly logger = new Logger(RawRefuelCandidateRecoveryService.name);
  private readonly recoveryRepository: RawRefuelCandidateRecoveryRepository;
  private configLoader: (
    env?: NodeJS.ProcessEnv,
  ) => RawFuelRefuelFallbackConfig = loadRawFuelRefuelFallbackConfig;
  private sampleFetcherOverride: RawRefuelCandidateRecoverySampleFetcher | null = null;
  private leaseMs = 5 * 60 * 1000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly candidateService: RawRefuelCandidateService,
    private readonly convergenceService: RawRefuelConvergenceService,
    @Optional() private readonly dimoSegments?: DimoSegmentsService,
    @Optional() private readonly metrics?: RawFuelRefuelFallbackMetricsService,
  ) {
    this.recoveryRepository = new RawRefuelCandidateRecoveryRepository(prisma);
  }

  withConfigLoader(
    loader: (env?: NodeJS.ProcessEnv) => RawFuelRefuelFallbackConfig,
  ): this {
    this.configLoader = loader;
    return this;
  }

  withSampleFetcher(fetcher: RawRefuelCandidateRecoverySampleFetcher): this {
    this.sampleFetcherOverride = fetcher;
    return this;
  }

  withLeaseMs(leaseMs: number): this {
    this.leaseMs = leaseMs;
    return this;
  }

  async runRecoveryBatch(
    limit: number,
    now: Date,
    env: NodeJS.ProcessEnv = process.env,
  ): Promise<RawRefuelCandidateRecoveryBatchResult> {
    if (!canExecuteRawRefuelCandidateRecovery(env)) {
      this.metrics?.recordCandidateRecoverySkippedDisabled();
      return { claimed: 0, processed: 0, outcomes: [] };
    }

    const leaseExpiresAt = new Date(now.getTime() + this.leaseMs);
    const claimed = await this.recoveryRepository.claimDueCandidates(
      limit,
      now,
      leaseExpiresAt,
    );
    this.metrics?.recordCandidateRecoveryClaimed(claimed.length);

    const outcomes: RawRefuelCandidateRecoveryAttemptResult[] = [];
    for (const row of claimed) {
      const result = await this.recoverClaimedCandidate(row, now, env);
      outcomes.push(result);
    }

    return { claimed: claimed.length, processed: outcomes.length, outcomes };
  }

  async recoverCandidateById(
    candidateId: string,
    now: Date,
    env: NodeJS.ProcessEnv = process.env,
  ): Promise<RawRefuelCandidateRecoveryAttemptResult> {
    const candidate = await this.prisma.rawRefuelCandidate.findUnique({
      where: { id: candidateId },
    });
    if (!candidate) {
      return {
        candidateId,
        outcome: 'TERMINAL_NO_ACTION',
        dimoFetchPerformed: false,
        detail: 'candidate_not_found',
      };
    }
    return this.recoverLoadedCandidate(candidate, now, env, {
      expectedClaimGeneration: candidate.recoveryAttemptCount,
      now,
      requireActiveLease: candidate.recoveryLeaseExpiresAt != null,
      leaseExpiresAt: candidate.recoveryLeaseExpiresAt,
    });
  }

  private buildClaimFence(
    row: ClaimedRawRefuelCandidateRecoveryRow,
    now: Date,
  ): RawRefuelCandidateRecoveryClaimFence {
    return {
      expectedClaimGeneration: row.recoveryAttemptCount,
      now,
      requireActiveLease: true,
      leaseExpiresAt: row.recoveryLeaseExpiresAt,
    };
  }

  private isLeaseExpiredForMutation(fence: RawRefuelCandidateRecoveryClaimFence): boolean {
    if (!fence.requireActiveLease) return false;
    if (!fence.leaseExpiresAt) return true;
    return Date.now() >= fence.leaseExpiresAt.getTime();
  }

  private mutationFence(
    fence: RawRefuelCandidateRecoveryClaimFence,
  ): RawRefuelCandidateRecoveryClaimFence {
    return { ...fence, now: new Date() };
  }

  private staleClaimAttempt(
    candidateId: string,
    dimoFetchPerformed: boolean,
  ): RawRefuelCandidateRecoveryAttemptResult {
    this.metrics?.recordCandidateRecoveryStaleClaimRejected();
    return {
      candidateId,
      outcome: 'TERMINAL_NO_ACTION',
      dimoFetchPerformed,
      detail: 'stale_claim',
    };
  }

  private async recoverClaimedCandidate(
    row: ClaimedRawRefuelCandidateRecoveryRow,
    now: Date,
    env: NodeJS.ProcessEnv,
  ): Promise<RawRefuelCandidateRecoveryAttemptResult> {
    const fence = this.buildClaimFence(row, now);
    const candidate = await this.prisma.rawRefuelCandidate.findUnique({
      where: { id: row.id },
    });
    if (!candidate) {
      const completion = await completeRecoveryAttemptFenced(
        this.prisma,
        row.id,
        row.recoveryAttemptCount,
        {
          recoveryNextAttemptAt: scheduleRecoveryNextAttemptAt(now, row.recoveryAttemptCount),
          recoveryLastOutcome: 'TERMINAL_NO_ACTION',
        },
      );
      if (completion === 'STALE_CLAIM') {
        return this.staleClaimAttempt(row.id, false);
      }
      return {
        candidateId: row.id,
        outcome: 'TERMINAL_NO_ACTION',
        dimoFetchPerformed: false,
        detail: 'candidate_not_found_after_claim',
      };
    }
    return this.recoverLoadedCandidate(candidate, now, env, fence);
  }

  private async recoverLoadedCandidate(
    candidate: RawRefuelCandidate,
    now: Date,
    env: NodeJS.ProcessEnv,
    claimFence: RawRefuelCandidateRecoveryClaimFence,
  ): Promise<RawRefuelCandidateRecoveryAttemptResult> {
    this.metrics?.recordCandidateRecoveryAttempt();

    if (isRawRefuelCandidateTerminal(candidate.lifecycleState)) {
      await this.finishRecovery(candidate.id, now, claimFence, 'TERMINAL_NO_ACTION');
      this.metrics?.recordCandidateRecoveryTerminalSkip();
      return {
        candidateId: candidate.id,
        outcome: 'TERMINAL_NO_ACTION',
        dimoFetchPerformed: false,
        detail: 'terminal_lifecycle',
      };
    }

    if (candidate.lifecycleState === 'READY_FOR_PERSIST') {
      return this.recoverReadyCandidate(candidate, now, env, claimFence);
    }

    return this.recoverEvidenceMaturityCandidate(candidate, now, env, claimFence);
  }

  private async recoverReadyCandidate(
    candidate: RawRefuelCandidate,
    now: Date,
    env: NodeJS.ProcessEnv,
    claimFence: RawRefuelCandidateRecoveryClaimFence,
  ): Promise<RawRefuelCandidateRecoveryAttemptResult> {
    const mutationFence = this.mutationFence(claimFence);
    if (this.isLeaseExpiredForMutation(mutationFence)) {
      return this.staleClaimAttempt(candidate.id, false);
    }
    const vehicleContext = await this.loadVehicleRecoveryContext(candidate.vehicleId);
    if (!vehicleContext.ok) {
      const outcome = vehicleContext.outcome;
      await this.finishRecovery(candidate.id, now, claimFence, outcome);
      return {
        candidateId: candidate.id,
        outcome,
        dimoFetchPerformed: false,
        detail: vehicleContext.detail,
      };
    }

    const readiness = evaluateRawRefuelCandidateReadiness(candidate, {
      capability: vehicleContext.capability,
      absoluteDetectionAdmissibility: vehicleContext.absoluteDetectionAdmissibility,
    });
    if (!readiness.ready) {
      await this.finishRecovery(candidate.id, now, claimFence, 'NO_NEW_EVIDENCE');
      return {
        candidateId: candidate.id,
        outcome: 'NO_NEW_EVIDENCE',
        dimoFetchPerformed: false,
        detail: readiness.detail,
      };
    }

    const convergence = await this.convergenceService.evaluateAndApplyConvergenceById(
      candidate.id,
      {
        capability: vehicleContext.capability,
        absoluteDetectionAdmissibility: vehicleContext.absoluteDetectionAdmissibility,
      },
      env,
      mutationFence,
    );

    if (convergence.detail === 'recovery_claim_stale') {
      return this.staleClaimAttempt(candidate.id, false);
    }

    if (convergence.status === 'CONVERGED_NATIVE') {
      const applied = await this.finishRecovery(
        candidate.id,
        now,
        mutationFence,
        'SUCCESS_CONVERGED',
        null,
      );
      if (!applied) {
        return this.staleClaimAttempt(candidate.id, false);
      }
      this.metrics?.recordCandidateRecoveryConvergedNative();
      return {
        candidateId: candidate.id,
        outcome: 'SUCCESS_CONVERGED',
        dimoFetchPerformed: false,
        convergenceStatus: convergence.status,
        detail: convergence.detail ?? undefined,
      };
    }

    if (
      convergence.detail?.includes('pending') ||
      convergence.detail?.includes('reconciliation') ||
      convergence.evaluation?.detail === 'pending_physical_reconciliation'
    ) {
      const applied = await this.finishRecovery(
        candidate.id,
        now,
        mutationFence,
        'PENDING_NATIVE_RECONCILIATION',
      );
      if (!applied) {
        return this.staleClaimAttempt(candidate.id, false);
      }
      this.metrics?.recordCandidateRecoveryPendingNative();
      return {
        candidateId: candidate.id,
        outcome: 'PENDING_NATIVE_RECONCILIATION',
        dimoFetchPerformed: false,
        convergenceStatus: convergence.status,
        detail: convergence.detail ?? undefined,
      };
    }

    const appliedPending = await this.finishRecovery(
      candidate.id,
      now,
      mutationFence,
      'PENDING_NATIVE_RECONCILIATION',
    );
    if (!appliedPending) {
      return this.staleClaimAttempt(candidate.id, false);
    }
    return {
      candidateId: candidate.id,
      outcome: 'PENDING_NATIVE_RECONCILIATION',
      dimoFetchPerformed: false,
      convergenceStatus: convergence.status,
      detail: convergence.detail ?? undefined,
    };
  }

  private async recoverEvidenceMaturityCandidate(
    candidate: RawRefuelCandidate,
    now: Date,
    env: NodeJS.ProcessEnv,
    claimFence: RawRefuelCandidateRecoveryClaimFence,
  ): Promise<RawRefuelCandidateRecoveryAttemptResult> {
    const vehicleContext = await this.loadVehicleRecoveryContext(candidate.vehicleId);
    if (!vehicleContext.ok) {
      await this.finishRecovery(candidate.id, now, claimFence, vehicleContext.outcome);
      return {
        candidateId: candidate.id,
        outcome: vehicleContext.outcome,
        dimoFetchPerformed: false,
        detail: vehicleContext.detail,
      };
    }

    if (vehicleContext.capability !== 'FUEL_CAPABLE') {
      await this.finishRecovery(
        candidate.id,
        now,
        claimFence,
        'CAPABILITY_NOT_SUPPORTED',
      );
      return {
        candidateId: candidate.id,
        outcome: 'CAPABILITY_NOT_SUPPORTED',
        dimoFetchPerformed: false,
      };
    }

    const window = computeRawRefuelCandidateRecoveryWindow(candidate, now);
    const fetch = await this.fetchHistoricalSamples(
      vehicleContext.tokenId,
      window.start,
      window.end,
      candidate.vehicleId,
    );

    const mutationFence = this.mutationFence(claimFence);

    if (this.isLeaseExpiredForMutation(mutationFence)) {
      return this.staleClaimAttempt(candidate.id, fetch.status !== 'ERROR');
    }

    if (fetch.status === 'ERROR') {
      this.metrics?.recordCandidateRecoverySampleFetchFailure(fetch.errorClass);
      await this.finishRecovery(candidate.id, now, claimFence, 'SAMPLE_FETCH_FAILED');
      return {
        candidateId: candidate.id,
        outcome: 'SAMPLE_FETCH_FAILED',
        dimoFetchPerformed: true,
        detail: fetch.message,
      };
    }

    this.metrics?.recordCandidateRecoverySampleFetchSuccess();

    if (fetch.status === 'EMPTY' || fetch.samples.length === 0) {
      this.metrics?.recordCandidateRecoveryNoMatchingObservation();
      await this.finishRecovery(candidate.id, now, claimFence, 'NO_MATCHING_OBSERVATION');
      return {
        candidateId: candidate.id,
        outcome: 'NO_MATCHING_OBSERVATION',
        dimoFetchPerformed: true,
      };
    }

    const trust = resolveRawFuelSignalTrust({
      samples: fetch.samples,
      scanWindowStart: window.start,
      scanWindowEnd: window.end,
      fuelType: vehicleContext.fuelType,
    });

    const context: RawFuelRiseDetectionContext = {
      organizationId: candidate.organizationId,
      vehicleId: candidate.vehicleId,
      scanWindowStart: window.start,
      scanWindowEnd: window.end,
      absoluteSignalTrust: trust.absoluteSignalTrust,
      absoluteDetectionAdmissibility: trust.absoluteDetectionAdmissibility,
      relativeSignalAvailable: trust.relativeSignalAvailable,
      signalProvider: 'DIMO',
      detectionVersion: RFRF_RISE_DETECTION_VERSION,
      detectorVersion: RFRF_RISE_DETECTOR_VERSION,
      routeEvidenceAvailable: candidate.routeEvidenceAvailable ?? false,
      stationaryEvidenceAvailable: candidate.stationaryEvidenceAvailable ?? false,
    };

    const detection = detectRawFuelRisesForPersistedSignalChannel(
      { context, samples: fetch.samples },
      candidate.signalChannel,
    );

    const match = selectRecoverySameObservation(candidate, detection.candidates);
    if (match.kind === 'NONE') {
      this.metrics?.recordCandidateRecoveryNoMatchingObservation();
      await this.finishRecovery(candidate.id, now, claimFence, 'NO_MATCHING_OBSERVATION');
      return {
        candidateId: candidate.id,
        outcome: 'NO_MATCHING_OBSERVATION',
        dimoFetchPerformed: true,
      };
    }
    if (match.kind === 'AMBIGUOUS') {
      this.metrics?.recordCandidateRecoveryAmbiguousObservation();
      await this.finishRecovery(
        candidate.id,
        now,
        claimFence,
        'AMBIGUOUS_RECOVERY_OBSERVATION',
      );
      return {
        candidateId: candidate.id,
        outcome: 'AMBIGUOUS_RECOVERY_OBSERVATION',
        dimoFetchPerformed: true,
      };
    }

    this.metrics?.recordCandidateRecoverySameObservationMatched();
    const reconcile = await this.candidateService.reconcileExistingCandidateByIdForRecoveryClaim(
      candidate.id,
      match.observation,
      mutationFence,
    );
    if (reconcile.kind === 'STALE_CLAIM') {
      return this.staleClaimAttempt(candidate.id, true);
    }
    const resolveResult = reconcile.result;

    const refreshed = await this.prisma.rawRefuelCandidate.findUniqueOrThrow({
      where: { id: candidate.id },
    });

    if (!resolveResult.updated) {
      await this.finishRecovery(candidate.id, now, claimFence, 'NO_NEW_EVIDENCE');
      return {
        candidateId: candidate.id,
        outcome: 'NO_NEW_EVIDENCE',
        dimoFetchPerformed: true,
      };
    }

    this.metrics?.recordCandidateRecoveryEvidenceMatured();

    const readiness = evaluateRawRefuelCandidateReadiness(refreshed, {
      capability: vehicleContext.capability,
      absoluteDetectionAdmissibility: vehicleContext.absoluteDetectionAdmissibility,
    });

    if (readiness.ready && refreshed.lifecycleState === 'READY_FOR_PERSIST') {
      this.metrics?.recordCandidateRecoveryBecameReady();
      const convergence = await this.convergenceService.evaluateAndApplyConvergenceById(
        refreshed.id,
        {
          capability: vehicleContext.capability,
          absoluteDetectionAdmissibility: vehicleContext.absoluteDetectionAdmissibility,
        },
        env,
        mutationFence,
      );
      if (convergence.detail === 'recovery_claim_stale') {
        return this.staleClaimAttempt(candidate.id, true);
      }
      if (convergence.status === 'CONVERGED_NATIVE') {
        const applied = await this.finishRecovery(
          candidate.id,
          now,
          mutationFence,
          'SUCCESS_CONVERGED',
          null,
        );
        if (!applied) {
          return this.staleClaimAttempt(candidate.id, true);
        }
        this.metrics?.recordCandidateRecoveryConvergedNative();
        return {
          candidateId: candidate.id,
          outcome: 'SUCCESS_CONVERGED',
          dimoFetchPerformed: true,
          convergenceStatus: convergence.status,
        };
      }
      if (convergence.status === 'SKIPPED_NO_ACTION') {
        const applied = await this.finishRecovery(
          candidate.id,
          now,
          mutationFence,
          'PENDING_NATIVE_RECONCILIATION',
        );
        if (!applied) {
          return this.staleClaimAttempt(candidate.id, true);
        }
        this.metrics?.recordCandidateRecoveryPendingNative();
        return {
          candidateId: candidate.id,
          outcome: 'PENDING_NATIVE_RECONCILIATION',
          dimoFetchPerformed: true,
          convergenceStatus: convergence.status,
          detail: convergence.detail ?? undefined,
        };
      }
      const appliedReady = await this.finishRecovery(
        candidate.id,
        now,
        mutationFence,
        'SUCCESS_MATURED_READY',
      );
      if (!appliedReady) {
        return this.staleClaimAttempt(candidate.id, true);
      }
      return {
        candidateId: candidate.id,
        outcome: 'SUCCESS_MATURED_READY',
        dimoFetchPerformed: true,
        convergenceStatus: convergence.status,
      };
    }

    await this.finishRecovery(candidate.id, now, claimFence, 'NO_NEW_EVIDENCE');
    return {
      candidateId: candidate.id,
      outcome: 'NO_NEW_EVIDENCE',
      dimoFetchPerformed: true,
      detail: refreshed.lifecycleState,
    };
  }

  private async finishRecovery(
    candidateId: string,
    now: Date,
    claimFence: RawRefuelCandidateRecoveryClaimFence,
    outcome: RawRefuelCandidateRecoveryOutcome,
    nextAttemptOverride: Date | null | undefined = undefined,
  ): Promise<boolean> {
    const terminalSuccess =
      outcome === 'SUCCESS_CONVERGED' ||
      outcome === 'TERMINAL_NO_ACTION';
    const nextAttempt =
      nextAttemptOverride !== undefined
        ? nextAttemptOverride
        : terminalSuccess
          ? null
          : scheduleRecoveryNextAttemptAt(
              now,
              claimFence.expectedClaimGeneration,
            );

    const completion = await completeRecoveryAttemptFenced(
      this.prisma,
      candidateId,
      claimFence.expectedClaimGeneration,
      {
        recoveryNextAttemptAt: nextAttempt,
        recoveryLastOutcome: outcome,
      },
    );
    if (completion === 'STALE_CLAIM') {
      this.metrics?.recordCandidateRecoveryStaleClaimRejected();
      return false;
    }
    if (nextAttempt) {
      this.metrics?.recordCandidateRecoveryRetryScheduled();
    }
    return true;
  }

  private async fetchHistoricalSamples(
    tokenId: number,
    windowFrom: Date,
    windowTo: Date,
    vehicleId: string,
  ): Promise<
    | {
        status: 'OK';
        samples: Array<{
          timestamp: Date;
          absoluteLiters: number | null;
          relativePercent: number | null;
        }>;
      }
    | { status: 'ERROR'; errorClass: string; message: string }
    | { status: 'EMPTY' }
  > {
    if (this.sampleFetcherOverride) {
      return this.sampleFetcherOverride({ tokenId, windowFrom, windowTo, vehicleId });
    }
    if (!this.dimoSegments) {
      return { status: 'ERROR', errorClass: 'NO_FETCHER', message: 'dimo_segments_unavailable' };
    }
    const outcome = await this.dimoSegments.fetchFuelLevelSamplesWithOutcome(
      tokenId,
      windowFrom,
      windowTo,
    );
    if (outcome.status === 'ERROR') {
      return {
        status: 'ERROR',
        errorClass: outcome.errorClass,
        message: outcome.message,
      };
    }
    if (outcome.samples.length === 0) {
      return { status: 'EMPTY' };
    }
    return {
      status: 'OK',
      samples: outcome.samples.map((sample) => ({
        timestamp: sample.timestamp,
        absoluteLiters: sample.absoluteLiters,
        relativePercent: sample.relativePercent,
      })),
    };
  }

  private async loadVehicleRecoveryContext(vehicleId: string): Promise<
    | {
        ok: true;
        tokenId: number;
        fuelType: FuelType;
        capability: 'FUEL_CAPABLE' | 'NON_FUEL_CAPABLE' | 'UNKNOWN';
        absoluteDetectionAdmissibility: RawFuelAbsoluteDetectionAdmissibility;
      }
    | { ok: false; outcome: RawRefuelCandidateRecoveryOutcome; detail?: string }
  > {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      include: { dimoVehicle: true },
    });
    if (!vehicle) {
      return { ok: false, outcome: 'TERMINAL_NO_ACTION', detail: 'vehicle_not_found' };
    }
    const tokenId = vehicle.dimoVehicle?.tokenId ?? 0;
    if (tokenId <= 0) {
      return { ok: false, outcome: 'NO_DIMO_TOKEN' };
    }
    const capability = resolveRawFuelCapability({
      fuelType: vehicle.fuelType,
      dimoPowertrainType: vehicle.dimoVehicle?.powertrainType ?? null,
      dimoFuelType: vehicle.dimoVehicle?.fuelType ?? null,
    });
    if (capability === 'NON_FUEL_CAPABLE' || capability === 'UNKNOWN') {
      return { ok: false, outcome: 'CAPABILITY_NOT_SUPPORTED' };
    }
    return {
      ok: true,
      tokenId,
      fuelType: vehicle.fuelType,
      capability,
      absoluteDetectionAdmissibility: 'ADMISSIBLE',
    };
  }
}

function selectRecoverySameObservation(
  target: RawRefuelCandidate,
  observations: RawRefuelCandidateObservation[],
): | { kind: 'NONE' }
  | { kind: 'AMBIGUOUS' }
  | { kind: 'MATCH'; observation: RawRefuelCandidateObservation } {
  const same: RawRefuelCandidateObservation[] = [];
  const insufficient: RawRefuelCandidateObservation[] = [];

  for (const observation of observations) {
    if (observation.vehicleId !== target.vehicleId) {
      continue;
    }
    if (observation.signalChannel !== target.signalChannel) {
      continue;
    }
    const overlap = classifyRawRefuelCandidateOverlap(
      { ...observation, organizationId: target.organizationId },
      target,
    );
    if (overlap === 'SAME_PHYSICAL_RISE') {
      same.push(observation);
    } else if (overlap === 'INSUFFICIENT_EVIDENCE') {
      insufficient.push(observation);
    }
  }

  if (same.length === 0) {
    return { kind: 'NONE' };
  }
  if (same.length > 1 || insufficient.length > 0) {
    return { kind: 'AMBIGUOUS' };
  }
  return { kind: 'MATCH', observation: same[0] };
}

export { selectRecoverySameObservation };
