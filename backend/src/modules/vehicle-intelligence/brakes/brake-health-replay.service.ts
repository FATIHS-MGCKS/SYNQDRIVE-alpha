import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { BrakeHealthService } from './brake-health.service';
import { BrakeRecalculationInputLoader } from './brake-recalculation-input.loader';
import { computeBrakeRecalculationInputFingerprint } from './brake-recalculation-fingerprint';
import {
  BRAKE_WEAR_MODEL_VERSION,
  computeBrakeWearModelConfigHash,
  isBrakeWearModelConfigReproducible,
  readSnapshotPredictionPayload,
  resolveBrakeWearModelRegistryEntry,
} from './brake-wear-model-version';
import type { BrakeCondition } from './brake-status';

export type BrakeHealthReplayStatus =
  | 'REPRODUCED_FROM_SNAPSHOT'
  | 'RECOMPUTED'
  | 'NOT_REPRODUCIBLE'
  | 'NO_DATA';

export interface BrakeHealthReplayRequest {
  vehicleId: string;
  asOf: Date;
}

export interface BrakeHealthReplayResult {
  status: BrakeHealthReplayStatus;
  asOf: string;
  vehicleId: string;
  modelVersion: string | null;
  modelConfigHash: string | null;
  snapshotId: string | null;
  predictionGeneratedAt: string | null;
  inputFingerprint: string | null;
  frontPadEstimateMm: number | null;
  rearPadEstimateMm: number | null;
  frontDiscEstimateMm: number | null;
  rearDiscEstimateMm: number | null;
  condition: BrakeCondition | null;
  confidence: { score: number; label: string } | null;
  anchorEvidenceSummary: Record<string, unknown> | null;
  reason: string | null;
}

/**
 * Read-only historical brake prediction replay. Never mutates snapshots,
 * measurements, or current read-model rows. Does not substitute the current
 * formula when the stored config version is unknown.
 */
@Injectable()
export class BrakeHealthReplayService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inputLoader: BrakeRecalculationInputLoader,
    private readonly brakeHealth: BrakeHealthService,
  ) {}

  async replay(request: BrakeHealthReplayRequest): Promise<BrakeHealthReplayResult> {
    const asOf = request.asOf;

    const snapshot = await this.prisma.brakeHealthSnapshot.findFirst({
      where: {
        vehicleId: request.vehicleId,
        generatedAt: { lte: asOf },
      },
      orderBy: { generatedAt: 'desc' },
    });

    if (snapshot) {
      const reproducible = isBrakeWearModelConfigReproducible(
        snapshot.modelVersion,
        snapshot.modelConfigHash,
      );
      const payload = readSnapshotPredictionPayload(snapshot.anchorEvidenceSummary);

      if (!reproducible) {
        return {
          status: 'NOT_REPRODUCIBLE',
          asOf: asOf.toISOString(),
          vehicleId: request.vehicleId,
          modelVersion: snapshot.modelVersion,
          modelConfigHash: snapshot.modelConfigHash,
          snapshotId: snapshot.id,
          predictionGeneratedAt: snapshot.generatedAt.toISOString(),
          inputFingerprint: snapshot.inputFingerprint,
          frontPadEstimateMm: payload?.frontPadEstimateMm ?? snapshot.frontPadEstimateMm,
          rearPadEstimateMm: payload?.rearPadEstimateMm ?? snapshot.rearPadEstimateMm,
          frontDiscEstimateMm: payload?.frontDiscEstimateMm ?? snapshot.frontDiscEstimateMm,
          rearDiscEstimateMm: payload?.rearDiscEstimateMm ?? snapshot.rearDiscEstimateMm,
          condition: (snapshot.condition as BrakeCondition | null) ?? null,
          confidence:
            snapshot.confidence != null &&
            typeof snapshot.confidence === 'object' &&
            !Array.isArray(snapshot.confidence)
              ? (snapshot.confidence as { score: number; label: string })
              : null,
          anchorEvidenceSummary:
            snapshot.anchorEvidenceSummary != null &&
            typeof snapshot.anchorEvidenceSummary === 'object' &&
            !Array.isArray(snapshot.anchorEvidenceSummary)
              ? (snapshot.anchorEvidenceSummary as Record<string, unknown>)
              : null,
          reason: 'stored_config_not_executable',
        };
      }

      return {
        status: 'REPRODUCED_FROM_SNAPSHOT',
        asOf: asOf.toISOString(),
        vehicleId: request.vehicleId,
        modelVersion: snapshot.modelVersion,
        modelConfigHash: snapshot.modelConfigHash,
        snapshotId: snapshot.id,
        predictionGeneratedAt: snapshot.generatedAt.toISOString(),
        inputFingerprint: snapshot.inputFingerprint,
        frontPadEstimateMm: payload?.frontPadEstimateMm ?? snapshot.frontPadEstimateMm,
        rearPadEstimateMm: payload?.rearPadEstimateMm ?? snapshot.rearPadEstimateMm,
        frontDiscEstimateMm: payload?.frontDiscEstimateMm ?? snapshot.frontDiscEstimateMm,
        rearDiscEstimateMm: payload?.rearDiscEstimateMm ?? snapshot.rearDiscEstimateMm,
        condition: (snapshot.condition as BrakeCondition | null) ?? null,
        confidence:
          snapshot.confidence != null &&
          typeof snapshot.confidence === 'object' &&
          !Array.isArray(snapshot.confidence)
            ? (snapshot.confidence as { score: number; label: string })
            : null,
        anchorEvidenceSummary:
          snapshot.anchorEvidenceSummary != null &&
          typeof snapshot.anchorEvidenceSummary === 'object' &&
          !Array.isArray(snapshot.anchorEvidenceSummary)
            ? (snapshot.anchorEvidenceSummary as Record<string, unknown>)
            : null,
        reason: null,
      };
    }

    const registryEntry = resolveBrakeWearModelRegistryEntry(
      BRAKE_WEAR_MODEL_VERSION,
      computeBrakeWearModelConfigHash(),
    );
    if (!registryEntry) {
      return this.emptyResult(request, 'NOT_REPRODUCIBLE', 'no_registry_entry');
    }

    const historicalContext = await this.inputLoader.loadAsOf(request.vehicleId, asOf);
    if (!historicalContext) {
      return this.emptyResult(request, 'NO_DATA', 'no_anchor_at_as_of');
    }

    const fingerprint = computeBrakeRecalculationInputFingerprint(historicalContext, {
      modelVersion: BRAKE_WEAR_MODEL_VERSION,
      modelConfigHash: computeBrakeWearModelConfigHash(),
    });

    const preview = await this.brakeHealth.previewRecalculationAtAsOf(
      request.vehicleId,
      asOf,
      historicalContext,
    );
    if (!preview) {
      return this.emptyResult(request, 'NO_DATA', 'preview_unavailable');
    }

    return {
      status: 'RECOMPUTED',
      asOf: asOf.toISOString(),
      vehicleId: request.vehicleId,
      modelVersion: fingerprint.modelVersion,
      modelConfigHash: fingerprint.modelConfigHash,
      snapshotId: null,
      predictionGeneratedAt: asOf.toISOString(),
      inputFingerprint: fingerprint.inputFingerprint,
      frontPadEstimateMm: preview.frontPadEstimateMm,
      rearPadEstimateMm: preview.rearPadEstimateMm,
      frontDiscEstimateMm: preview.frontDiscEstimateMm,
      rearDiscEstimateMm: preview.rearDiscEstimateMm,
      condition: preview.condition,
      confidence: preview.confidence,
      anchorEvidenceSummary: null,
      reason: 'recomputed_from_historical_inputs',
    };
  }

  private emptyResult(
    request: BrakeHealthReplayRequest,
    status: BrakeHealthReplayStatus,
    reason: string,
  ): BrakeHealthReplayResult {
    return {
      status,
      asOf: request.asOf.toISOString(),
      vehicleId: request.vehicleId,
      modelVersion: null,
      modelConfigHash: null,
      snapshotId: null,
      predictionGeneratedAt: null,
      inputFingerprint: null,
      frontPadEstimateMm: null,
      rearPadEstimateMm: null,
      frontDiscEstimateMm: null,
      rearDiscEstimateMm: null,
      condition: null,
      confidence: null,
      anchorEvidenceSummary: null,
      reason,
    };
  }
}
