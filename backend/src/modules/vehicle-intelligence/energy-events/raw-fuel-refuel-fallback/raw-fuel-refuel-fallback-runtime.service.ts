import { Injectable, Logger, Optional } from '@nestjs/common';
import { DimoSegmentsService } from '@modules/dimo/dimo-segments.service';
import {
  loadRawFuelRefuelFallbackConfig,
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
import type {
  RawFuelRefuelFallbackScanInput,
  RawFuelRefuelFallbackScanResult,
} from './raw-fuel-refuel-fallback-runtime.types';

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
    candidateOutcomes: [],
    ...partial,
  };
}

@Injectable()
export class RawFuelRefuelFallbackRuntimeService {
  private readonly logger = new Logger(RawFuelRefuelFallbackRuntimeService.name);

  constructor(
    private readonly dimoSegments: DimoSegmentsService,
    private readonly rawRefuelCandidateService: RawRefuelCandidateService,
    @Optional() private readonly metrics?: RawFuelRefuelFallbackMetricsService,
    private readonly configLoader: (
      env?: NodeJS.ProcessEnv,
    ) => RawFuelRefuelFallbackConfig = loadRawFuelRefuelFallbackConfig,
  ) {}

  /** Test hook — inject config without mutating process.env. */
  withConfigLoader(
    loader: (env?: NodeJS.ProcessEnv) => RawFuelRefuelFallbackConfig,
  ): RawFuelRefuelFallbackRuntimeService {
    return new RawFuelRefuelFallbackRuntimeService(
      this.dimoSegments,
      this.rawRefuelCandidateService,
      this.metrics,
      loader,
    );
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
      return await this.executeScan(input, config);
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
      await this.persistObservation(observation, config, result, i);
    }

    return result;
  }

  private async persistObservation(
    observation: RawRefuelCandidateObservation,
    config: RawFuelRefuelFallbackConfig,
    result: RawFuelRefuelFallbackScanResult,
    observationIndex: number,
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
}
