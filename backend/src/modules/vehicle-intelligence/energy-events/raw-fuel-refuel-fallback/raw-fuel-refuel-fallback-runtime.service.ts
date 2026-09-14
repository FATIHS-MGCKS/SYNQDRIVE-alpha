import { Injectable, Logger, Optional } from '@nestjs/common';
import { DimoSegmentsService } from '@modules/dimo/dimo-segments.service';
import {
  loadRawFuelRefuelFallbackConfig,
  evaluateFallbackPromotionAuthority,
  type RawFuelRefuelFallbackConfig,
} from '@config/raw-fuel-refuel-fallback.config';
import { resolveRawFuelCapability } from './raw-fuel-capability.resolver';
import { resolveRawFuelSignalTrust } from './raw-fuel-signal-trust.resolver';
import { detectRawFuelRises } from '../raw-fuel-rise-detector/raw-fuel-rise-detector';
import {
  RFRF_RISE_DETECTION_VERSION,
  RFRF_RISE_DETECTOR_VERSION,
} from '../raw-fuel-rise-detector/raw-fuel-rise-detector.config';
import type { RawFuelRiseDetectionContext } from '../raw-fuel-rise-detector/raw-fuel-signal-sample.types';
import { RawRefuelCandidateService } from '../raw-refuel-candidate/raw-refuel-candidate.service';
import type { RawRefuelCandidateObservation } from '../raw-refuel-candidate/raw-refuel-candidate.types';
import { RawFuelRefuelFallbackMetricsService } from './raw-fuel-refuel-fallback-metrics.service';
import { RawRefuelConvergenceService } from './raw-refuel-convergence.service';
import { RawRefuelPromotionPreparationService } from './raw-refuel-promotion-preparation.service';
import { RawRefuelPromotionService } from './raw-refuel-promotion.service';
import type {
  RawFuelRefuelFallbackScanInput,
  RawFuelRefuelFallbackScanResult,
} from './raw-fuel-refuel-fallback-runtime.types';
import type { RawFuelCapability } from './raw-fuel-refuel-fallback.types';
import type { RawFuelAbsoluteDetectionAdmissibility } from './raw-fuel-refuel-fallback.types';

function resolveRuntimePromotionTrust(
  observationTrust: RawRefuelCandidateObservation['absoluteSignalTrust'],
): RawRefuelCandidateObservation['absoluteSignalTrust'] | undefined {
  if (observationTrust == null || observationTrust === 'UNKNOWN') {
    return undefined;
  }
  return observationTrust;
}

function emptyResult(
  partial: Partial<RawFuelRefuelFallbackScanResult> &
    Pick<RawFuelRefuelFallbackScanResult, 'masterEnabled' | 'persistEnabled'>,
): RawFuelRefuelFallbackScanResult {
  return {
    invoked: false,
    samplesFetched: 0,
    detectorInvoked: false,
    observationsEmitted: 0,
    persistAttempted: 0,
    candidatesCreated: 0,
    candidatesRediscovered: 0,
    persistSkippedBecauseFlagOff: 0,
    promotionPreparationAttempted: 0,
    promotionDraftsConstructed: 0,
    promotionBlockedByF5Gate: 0,
    convergenceEvaluationAttempted: 0,
    convergenceConvergedNative: 0,
    convergenceFailClosed: 0,
    convergenceSkippedNotAuthorized: 0,
    promotionExecutionAttempted: 0,
    promotionCommitted: 0,
    promotionFailClosed: 0,
    promotionSkippedNotAuthorized: 0,
    promotionBlockedByCutover: 0,
    candidateOutcomes: [],
    ...partial,
  };
}

@Injectable()
export class RawFuelRefuelFallbackRuntimeService {
  private readonly logger = new Logger(RawFuelRefuelFallbackRuntimeService.name);
  private configLoader: (
    env?: NodeJS.ProcessEnv,
  ) => RawFuelRefuelFallbackConfig = loadRawFuelRefuelFallbackConfig;

  constructor(
    private readonly dimoSegments: DimoSegmentsService,
    private readonly rawRefuelCandidateService: RawRefuelCandidateService,
    @Optional() private readonly promotionPreparation?: RawRefuelPromotionPreparationService,
    @Optional() private readonly convergenceService?: RawRefuelConvergenceService,
    @Optional() private readonly promotionService?: RawRefuelPromotionService,
    @Optional() private readonly metrics?: RawFuelRefuelFallbackMetricsService,
  ) {}

  /** Test hook — inject config without mutating process.env. */
  withConfigLoader(
    loader: (env?: NodeJS.ProcessEnv) => RawFuelRefuelFallbackConfig,
  ): RawFuelRefuelFallbackRuntimeService {
    const service = new RawFuelRefuelFallbackRuntimeService(
      this.dimoSegments,
      this.rawRefuelCandidateService,
      this.promotionPreparation,
      this.convergenceService,
      this.promotionService,
      this.metrics,
    );
    service.configLoader = loader;
    return service;
  }

  async scanIfEnabled(
    input: RawFuelRefuelFallbackScanInput,
    env: NodeJS.ProcessEnv = process.env,
  ): Promise<RawFuelRefuelFallbackScanResult> {
    const config = this.configLoader(env);

    if (!config.masterEnabled && config.persistEnabled) {
      this.metrics?.recordPersistWithoutMaster();
      this.logger.warn(
        `RFRF persist flag set without master — fail closed vehicle=${input.vehicleId}`,
      );
      return emptyResult({
        masterEnabled: false,
        persistEnabled: true,
        skipReason: 'persist_without_master',
      });
    }

    if (!config.masterEnabled) {
      this.metrics?.recordMasterDisabled();
      return emptyResult({
        masterEnabled: false,
        persistEnabled: config.persistEnabled,
        skipReason: 'master_disabled',
      });
    }

    try {
      return await this.executeScan(input, config, env);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `RFRF dark branch isolated failure vehicle=${input.vehicleId}: ${message}`,
      );
      this.metrics?.recordBranchError();
      return emptyResult({
        masterEnabled: true,
        persistEnabled: config.persistEnabled,
        invoked: true,
        branchError: message,
      });
    }
  }

  private async executeScan(
    input: RawFuelRefuelFallbackScanInput,
    config: RawFuelRefuelFallbackConfig,
    env: NodeJS.ProcessEnv = process.env,
  ): Promise<RawFuelRefuelFallbackScanResult> {
    this.metrics?.recordBranchInvocation();

    if (input.tokenId <= 0) {
      return emptyResult({
        masterEnabled: true,
        persistEnabled: config.persistEnabled,
        invoked: true,
        skipReason: 'no_dimo_token',
      });
    }

    const capability = resolveRawFuelCapability({
      fuelType: input.fuelType,
      dimoPowertrainType: input.dimoPowertrainType ?? null,
      dimoFuelType: input.dimoFuelType ?? null,
    });

    if (capability === 'NON_FUEL_CAPABLE') {
      this.metrics?.recordCapabilitySkip(capability);
      return emptyResult({
        masterEnabled: true,
        persistEnabled: config.persistEnabled,
        invoked: true,
        skipReason: 'capability_non_fuel',
        capability,
      });
    }

    if (capability === 'UNKNOWN') {
      this.metrics?.recordCapabilitySkip(capability);
      return emptyResult({
        masterEnabled: true,
        persistEnabled: config.persistEnabled,
        invoked: true,
        skipReason: 'capability_unknown',
        capability,
      });
    }

    const fetchOutcome = await this.dimoSegments.fetchFuelLevelSamplesWithOutcome(
      input.tokenId,
      input.windowFrom,
      input.windowTo,
      input.requestContext,
    );

    if (fetchOutcome.status === 'ERROR') {
      this.logger.warn(
        `RFRF fuel sample fetch failed vehicle=${input.vehicleId} class=${fetchOutcome.errorClass}: ${fetchOutcome.message}`,
      );
      this.metrics?.recordSampleFetchFailure(fetchOutcome.errorClass);
      return emptyResult({
        masterEnabled: true,
        persistEnabled: config.persistEnabled,
        invoked: true,
        skipReason: 'sample_fetch_failed',
        capability,
        fetchErrorClass: fetchOutcome.errorClass,
      });
    }

    this.metrics?.recordSampleFetchSuccess();
    const samples = fetchOutcome.samples;

    if (samples.length === 0) {
      return emptyResult({
        masterEnabled: true,
        persistEnabled: config.persistEnabled,
        invoked: true,
        skipReason: 'no_samples',
        capability,
        samplesFetched: 0,
      });
    }

    const mappedSamples = samples.map((sample) => ({
      timestamp: sample.timestamp,
      absoluteLiters: sample.absoluteLiters,
      relativePercent: sample.relativePercent,
    }));

    const trust = resolveRawFuelSignalTrust({
      samples: mappedSamples,
      scanWindowStart: input.windowFrom,
      scanWindowEnd: input.windowTo,
      fuelType: input.fuelType,
    });

    const context: RawFuelRiseDetectionContext = {
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      scanWindowStart: input.windowFrom,
      scanWindowEnd: input.windowTo,
      absoluteSignalTrust: trust.absoluteSignalTrust,
      absoluteDetectionAdmissibility: trust.absoluteDetectionAdmissibility,
      relativeSignalAvailable: trust.relativeSignalAvailable,
      signalProvider: 'DIMO',
      detectionVersion: RFRF_RISE_DETECTION_VERSION,
      detectorVersion: RFRF_RISE_DETECTOR_VERSION,
      routeEvidenceAvailable: false,
      stationaryEvidenceAvailable: false,
    };

    this.metrics?.recordDetectorInvocation();
    const detection = detectRawFuelRises({ context, samples: mappedSamples });

    const invalidSampleRejections =
      detection.rejectedOrHeld.filter((item) => item.reason === 'invalid_sample').length;
    this.metrics?.recordNonFiniteSampleExclusion(invalidSampleRejections);

    if (detection.candidates.length === 0) {
      this.metrics?.recordZeroObservations();
    }

    const result = emptyResult({
      masterEnabled: true,
      persistEnabled: config.persistEnabled,
      invoked: true,
      capability,
      samplesFetched: samples.length,
      detectorInvoked: true,
      observationsEmitted: detection.candidates.length,
    });

    for (let i = 0; i < detection.candidates.length; i++) {
      const observation = detection.candidates[i];
      this.metrics?.recordObservation(observation.lifecycleState);
      await this.persistObservation(
        observation,
        config,
        result,
        i,
        capability,
        trust.absoluteDetectionAdmissibility,
        env,
      );
    }

    return result;
  }

  private async persistObservation(
    observation: RawRefuelCandidateObservation,
    config: RawFuelRefuelFallbackConfig,
    result: RawFuelRefuelFallbackScanResult,
    observationIndex: number,
    capability: RawFuelCapability,
    absoluteDetectionAdmissibility: RawFuelAbsoluteDetectionAdmissibility,
    env: NodeJS.ProcessEnv = process.env,
  ): Promise<void> {
    if (!config.persistEnabled) {
      result.persistSkippedBecauseFlagOff += 1;
      this.metrics?.recordPersistSkippedFlagOff();
      result.candidateOutcomes.push({
        observationIndex,
        lifecycleState: observation.lifecycleState,
        persisted: false,
        created: false,
        rediscovered: false,
      });
      return;
    }

    if (observation.lifecycleState === 'REJECTED') {
      result.candidateOutcomes.push({
        observationIndex,
        lifecycleState: observation.lifecycleState,
        persisted: false,
        created: false,
        rediscovered: false,
      });
      return;
    }

    result.persistAttempted += 1;
    this.metrics?.recordPersistAttempt();

    try {
      const resolved =
        await this.rawRefuelCandidateService.resolveOrCreateCandidate(observation);
      if (resolved.created) {
        result.candidatesCreated += 1;
        this.metrics?.recordPersistCreated();
      } else {
        result.candidatesRediscovered += 1;
        this.metrics?.recordPersistRediscovered();
      }
      result.candidateOutcomes.push({
        observationIndex,
        lifecycleState: observation.lifecycleState,
        persisted: true,
        created: resolved.created,
        rediscovered: !resolved.created,
        candidateId: resolved.candidateId,
      });
      await this.runPromotionPreparationIfPersisted(
        resolved.candidateId,
        result,
        observationIndex,
        capability,
        absoluteDetectionAdmissibility,
        observation.absoluteSignalTrust ?? null,
        env,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `RFRF candidate persist isolated failure vehicle=${observation.vehicleId} index=${observationIndex}: ${message}`,
      );
      this.metrics?.recordCandidateError();
      result.candidateOutcomes.push({
        observationIndex,
        lifecycleState: observation.lifecycleState,
        persisted: false,
        created: false,
        rediscovered: false,
        error: message,
      });
    }
  }

  private async runPromotionPreparationIfPersisted(
    candidateId: string,
    result: RawFuelRefuelFallbackScanResult,
    observationIndex: number,
    capability: RawFuelCapability,
    absoluteDetectionAdmissibility: RawFuelAbsoluteDetectionAdmissibility,
    absoluteSignalTrust: RawRefuelCandidateObservation['absoluteSignalTrust'],
    env: NodeJS.ProcessEnv = process.env,
  ): Promise<void> {
    if (!this.promotionPreparation) {
      return;
    }

    result.promotionPreparationAttempted += 1;
    const outcome = result.candidateOutcomes.find(
      (item) => item.observationIndex === observationIndex,
    );
    if (!outcome) {
      return;
    }

    try {
      const preparation = await this.promotionPreparation.preparePromotionById(candidateId, {
        capability,
        absoluteDetectionAdmissibility,
        absoluteSignalTrust: resolveRuntimePromotionTrust(absoluteSignalTrust),
      });
      if (!preparation) {
        outcome.promotionPreparationError = 'candidate_not_found_after_persist';
        return;
      }
      outcome.promotionPreparation = preparation;

      if (preparation.promotionDraft) {
        result.promotionDraftsConstructed += 1;
      }
      if (preparation.blockedByF5Gate) {
        result.promotionBlockedByF5Gate += 1;
      }

      await this.runConvergenceEvaluationIfPrepared(
        candidateId,
        result,
        observationIndex,
        capability,
        absoluteDetectionAdmissibility,
        resolveRuntimePromotionTrust(absoluteSignalTrust),
        env,
      );
      await this.runPromotionExecutionIfPrepared(
        candidateId,
        result,
        observationIndex,
        capability,
        absoluteDetectionAdmissibility,
        resolveRuntimePromotionTrust(absoluteSignalTrust),
        env,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `RFRF promotion preparation isolated failure candidate=${candidateId}: ${message}`,
      );
      outcome.promotionPreparationError = message;
    }
  }

  private async runConvergenceEvaluationIfPrepared(
    candidateId: string,
    result: RawFuelRefuelFallbackScanResult,
    observationIndex: number,
    capability: RawFuelCapability,
    absoluteDetectionAdmissibility: RawFuelAbsoluteDetectionAdmissibility,
    absoluteSignalTrust: RawRefuelCandidateObservation['absoluteSignalTrust'],
    env: NodeJS.ProcessEnv = process.env,
  ): Promise<void> {
    if (!this.convergenceService) {
      return;
    }

    const outcome = result.candidateOutcomes.find(
      (item) => item.observationIndex === observationIndex,
    );
    if (!outcome?.promotionPreparation?.readiness.ready) {
      return;
    }

    result.convergenceEvaluationAttempted += 1;
    this.metrics?.recordConvergenceEvaluationAttempted();

    try {
      const applyResult = await this.convergenceService.evaluateAndApplyConvergenceById(
        candidateId,
        {
          capability,
          absoluteDetectionAdmissibility,
          absoluteSignalTrust,
        },
        env,
      );
      outcome.convergenceApply = applyResult;

      switch (applyResult.status) {
        case 'CONVERGED_NATIVE':
          result.convergenceConvergedNative += 1;
          break;
        case 'FAIL_CLOSED':
        case 'FAIL_CLOSED_TERMINAL_PROMOTED':
          result.convergenceFailClosed += 1;
          break;
        case 'SKIPPED_NOT_AUTHORIZED':
          result.convergenceSkippedNotAuthorized += 1;
          break;
        default:
          break;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `RFRF convergence isolated failure candidate=${candidateId}: ${message}`,
      );
      outcome.convergenceApplyError = message;
    }
  }

  private async runPromotionExecutionIfPrepared(
    candidateId: string,
    result: RawFuelRefuelFallbackScanResult,
    observationIndex: number,
    capability: RawFuelCapability,
    absoluteDetectionAdmissibility: RawFuelAbsoluteDetectionAdmissibility,
    absoluteSignalTrust: RawRefuelCandidateObservation['absoluteSignalTrust'],
    env: NodeJS.ProcessEnv = process.env,
  ): Promise<void> {
    if (!this.promotionService) {
      return;
    }

    const outcome = result.candidateOutcomes.find(
      (item) => item.observationIndex === observationIndex,
    );
    if (!outcome?.promotionPreparation?.readiness.ready) {
      return;
    }

    const authority = evaluateFallbackPromotionAuthority(env);
    if (!authority.authorized) {
      result.promotionSkippedNotAuthorized += 1;
      outcome.promotionApply = {
        status: 'SKIPPED_NOT_AUTHORIZED',
        evaluation: null,
        candidateId,
        fallbackVehicleEnergyEventId: null,
        convergedNativeEventId: null,
        detail: authority.detail,
      };
      return;
    }

    result.promotionExecutionAttempted += 1;

    try {
      const applyResult = await this.promotionService.evaluateAndApplyPromotionById(
        candidateId,
        {
          capability,
          absoluteDetectionAdmissibility,
          absoluteSignalTrust,
        },
        env,
      );
      outcome.promotionApply = applyResult;

      switch (applyResult.status) {
        case 'PROMOTED':
          result.promotionCommitted += 1;
          break;
        case 'FAIL_CLOSED':
        case 'BLOCKED_PROMOTION_TRUST':
          result.promotionFailClosed += 1;
          break;
        case 'BLOCKED_CUTOVER':
          result.promotionFailClosed += 1;
          result.promotionBlockedByCutover += 1;
          break;
        case 'SKIPPED_NOT_AUTHORIZED':
          result.promotionSkippedNotAuthorized += 1;
          break;
        case 'CONVERGED_NATIVE':
          result.convergenceConvergedNative += 1;
          break;
        default:
          break;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `RFRF promotion isolated failure candidate=${candidateId}: ${message}`,
      );
      outcome.promotionApplyError = message;
    }
  }
}
