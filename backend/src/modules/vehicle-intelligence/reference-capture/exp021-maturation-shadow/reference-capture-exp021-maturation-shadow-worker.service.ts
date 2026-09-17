import { Injectable, Logger } from '@nestjs/common';
import {
  Exp021MaturationShadowProviderOutcomeClass,
  Exp021MaturationShadowSignalLane,
  Prisma,
} from '@prisma/client';
import { ReferenceCaptureConfig } from '../reference-capture.config';
import {
  EXP021_MATURATION_SHADOW_MAX_TRANSPORT_RETRIES,
} from './reference-capture-exp021-maturation-shadow.constants';
import { Exp021MaturationShadowAttemptAuthorityError } from './reference-capture-exp021-maturation-shadow.errors';
import type { Exp021MaturationShadowJobData } from './reference-capture-exp021-maturation-shadow-job.types';
import { ReferenceCaptureExp021MaturationShadowProviderQueryAdapter } from './reference-capture-exp021-maturation-shadow-provider-query.adapter';
import { ReferenceCaptureExp021MaturationShadowRepository } from './reference-capture-exp021-maturation-shadow.repository';
import { ReferenceCaptureExp021MaturationShadowRunnerService } from './reference-capture-exp021-maturation-shadow-runner.service';
import { resolveExp021MaturationShadowRuntimeBuildSha } from './reference-capture-exp021-maturation-shadow-runtime-sha.lib';

@Injectable()
export class ReferenceCaptureExp021MaturationShadowWorkerService {
  private readonly logger = new Logger(ReferenceCaptureExp021MaturationShadowWorkerService.name);

  constructor(
    private readonly config: ReferenceCaptureConfig,
    private readonly repository: ReferenceCaptureExp021MaturationShadowRepository,
    private readonly providerQuery: ReferenceCaptureExp021MaturationShadowProviderQueryAdapter,
    private readonly runner: ReferenceCaptureExp021MaturationShadowRunnerService,
  ) {}

  async executeObservationJob(job: Exp021MaturationShadowJobData): Promise<void> {
    if (!this.config.isExp021MaturationShadowEnabled()) {
      this.logger.debug('Maturation shadow disabled — skipping job');
      return;
    }

    const slot = await this.repository.findObservationSlotById(job.observationSlotId);
    if (!slot) {
      throw new Exp021MaturationShadowAttemptAuthorityError(
        `Observation slot not found: ${job.observationSlotId}`,
      );
    }

    const { family } = slot.stratum;

    await this.repository.resolveAuthoritativeTokenId(
      family.organizationId,
      family.vehicleId,
      job.tokenId,
    );

    const laneEnabled =
      slot.stratum.signalLane === Exp021MaturationShadowSignalLane.HF_FAST_LOOP
        ? this.config.isExp021MaturationShadowHfLaneEnabled()
        : this.config.isExp021MaturationShadowSettlementLaneEnabled();
    if (!laneEnabled) {
      this.logger.debug(`Lane ${slot.stratum.signalLane} disabled — skipping slot=${slot.id}`);
      return;
    }

    if (!family.plannedAgesMsExact.includes(job.plannedAgeMs)) {
      throw new Exp021MaturationShadowAttemptAuthorityError(
        `Planned age ${job.plannedAgeMs} not on family schedule`,
      );
    }

    const priorSuccessful = slot.attempts.find(
      (attempt) =>
        attempt.providerRequestSucceeded &&
        attempt.providerOutcomeClass !== Exp021MaturationShadowProviderOutcomeClass.PROVIDER_ERROR,
    );
    if (priorSuccessful && job.transportRetryOrdinal === 0) {
      this.logger.debug(
        `Duplicate delivery converged — successful attempt exists slot=${slot.id}`,
      );
      return;
    }

    const providerResult = await this.providerQuery.executeHistoricalQuery({
      tokenId: family.tokenId,
      organizationId: family.organizationId,
      vehicleId: family.vehicleId,
      providerFields: slot.stratum.resolvedProviderFields,
      windowFrom: slot.stratum.windowFrom,
      windowTo: slot.stratum.windowTo,
      interval: slot.stratum.interval,
    });

    await this.repository.insertObservationAttempt({
      observationSlotId: slot.id,
      rawFacts: {
        plannedAgeMs: slot.plannedAgeMs,
        requestStartedAt: providerResult.requestStartedAt,
        requestCompletedAt: providerResult.requestCompletedAt,
        runtimeBuildSha: resolveExp021MaturationShadowRuntimeBuildSha(),
        querySemanticsHash: slot.stratum.querySemanticsHash,
        signalSetHash: slot.stratum.signalSetHash,
        providerRequestSucceeded: providerResult.providerRequestSucceeded,
        providerOutcomeClass: providerResult.providerOutcomeClass,
        providerStatus: providerResult.providerStatus,
        providerErrorClass: providerResult.providerErrorClass,
        uniqueBucketLocusCount: providerResult.uniqueBucketLocusCount,
        uniqueTemporalBucketStartCount: providerResult.uniqueTemporalBucketStartCount,
        perFieldRowCountJson: providerResult.perFieldRowCountJson,
        perFieldBucketLocusCountJson: providerResult.perFieldBucketLocusCountJson,
        firstProviderTimestamp: providerResult.firstProviderTimestamp,
        lastProviderTimestamp: providerResult.lastProviderTimestamp,
        bucketLocusManifestJson: providerResult.bucketLocusManifestJson,
        bucketLocusIdentityVersion: providerResult.bucketLocusIdentityVersion,
        duplicateCount: providerResult.duplicateCount,
        payloadRevisionCount: providerResult.payloadRevisionCount,
        changedPayloadLocusCount: providerResult.changedPayloadLocusCount,
        queryProvenanceJson: providerResult.queryProvenanceJson as Prisma.InputJsonValue,
      },
    });

    if (
      !providerResult.providerRequestSucceeded &&
      job.transportRetryOrdinal < EXP021_MATURATION_SHADOW_MAX_TRANSPORT_RETRIES
    ) {
      const nextOrdinal = job.transportRetryOrdinal + 1;
      await this.runner.enqueueObservationSlot({
        observationSlotId: slot.id,
        windowFamilyId: family.id,
        windowStratumId: slot.stratum.id,
        plannedAgeMs: slot.plannedAgeMs,
        canonicalWindowTo: family.canonicalWindowTo,
        organizationId: family.organizationId,
        vehicleId: family.vehicleId,
        tokenId: family.tokenId,
        transportRetryOrdinal: nextOrdinal,
      });
    }
  }
}
