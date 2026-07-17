import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { TireEvidenceSource } from '@prisma/client';
import {
  hasValidGroundTruthMeasurement,
  resolveAxleGroundTruthTreadMm,
  type TireAxle,
} from './tire-ground-truth.util';
import { buildWearDataPointProvenance } from './tire-provenance.repository';
import { mapLegacyMeasurementSourceToEvidence } from './tire-evidence-source';
import {
  readSnapshotPredictionPayload,
} from './tire-wear-model-version';
import { TireHealthObservabilityService } from './tire-health-observability.service';

export interface ValidationLinkResult {
  measurementId: string;
  axle: TireAxle;
  predictionSnapshotId: string;
  predictedTreadMm: number;
  actualTreadMm: number;
  skipped?: boolean;
  skipReason?: string;
}

/**
 * Links ground-truth measurements to the prediction snapshot that existed
 * **before** the measurement — never the operative snapshot from the same pass.
 */
@Injectable()
export class TirePredictionValidationService {
  private readonly logger = new Logger(TirePredictionValidationService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly observability?: TireHealthObservabilityService,
  ) {}

  /**
   * Find the latest prediction snapshot strictly before `measuredAt`.
   * Measurements must not retroactively bind to snapshots generated later.
   */
  async findPreMeasurementSnapshot(
    tireSetupId: string,
    measuredAt: Date,
  ): Promise<{
    id: string;
    predictionGeneratedAt: Date | null;
    snapshotDate: Date;
    modelVersion: string | null;
    modelConfigHash: string | null;
    evidenceSummary: unknown;
  } | null> {
    return this.prisma.tireHealthSnapshot.findFirst({
      where: {
        tireSetId: tireSetupId,
        OR: [
          { predictionGeneratedAt: { lt: measuredAt } },
          {
            predictionGeneratedAt: null,
            snapshotDate: { lt: measuredAt },
          },
        ],
      },
      orderBy: [
        { predictionGeneratedAt: 'desc' },
        { snapshotDate: 'desc' },
      ],
      select: {
        id: true,
        predictionGeneratedAt: true,
        snapshotDate: true,
        modelVersion: true,
        modelConfigHash: true,
        evidenceSummary: true,
      },
    });
  }

  resolvePredictedAxleTreadMm(
    snapshotEvidence: unknown,
    axle: TireAxle,
  ): number | null {
    const payload = readSnapshotPredictionPayload(snapshotEvidence);
    if (!payload) return null;
    return payload.predictedTreadByAxle[axle] ?? null;
  }

  /**
   * Create validation wear rows for measurements that do not yet have linked
   * ground-truth data points. Uses only pre-measurement snapshot predictions.
   */
  async linkPendingValidationDataPoints(args: {
    organizationId: string;
    vehicleId: string;
    tireSetupId: string;
    tireSeason: string | null;
    installedOdometerKm: number | null;
    currentOdometerKm: number | null;
    referenceNewTreadFront: number;
    referenceNewTreadRear: number;
    frontTireWidthMm: number | null;
    rearTireWidthMm: number | null;
    climateFactor: number;
    usageFactor: number;
    behaviorFactor: number;
    regenFactor: number;
    asOf?: Date;
  }): Promise<ValidationLinkResult[]> {
    const asOf = args.asOf ?? new Date();
    const results: ValidationLinkResult[] = [];

    if (
      args.currentOdometerKm == null ||
      args.installedOdometerKm == null ||
      args.currentOdometerKm <= args.installedOdometerKm
    ) {
      return results;
    }

    const distanceKm = args.currentOdometerKm - args.installedOdometerKm;

    const measurements = await this.prisma.vehicleTireTreadMeasurement.findMany({
      where: {
        vehicleId: args.vehicleId,
        tireSetupId: args.tireSetupId,
        measuredAt: { lte: asOf },
      },
      orderBy: { measuredAt: 'asc' },
    });

    const linkedResults: ValidationLinkResult[] = [];

    for (const measurement of measurements) {
      const gtInput = {
        tireSetupId: args.tireSetupId,
        source: measurement.source,
        measuredAt: measurement.measuredAt,
        frontLeftMm: measurement.frontLeftMm,
        frontRightMm: measurement.frontRightMm,
        rearLeftMm: measurement.rearLeftMm,
        rearRightMm: measurement.rearRightMm,
      };

      const predictionSnapshot = await this.findPreMeasurementSnapshot(
        args.tireSetupId,
        measurement.measuredAt,
      );

      if (!predictionSnapshot) {
        results.push({
          measurementId: measurement.id,
          axle: 'front',
          predictionSnapshotId: '',
          predictedTreadMm: 0,
          actualTreadMm: 0,
          skipped: true,
          skipReason: 'no_pre_measurement_snapshot',
        });
        this.observability?.recordPredictionValidation({
          errorMm: 0,
          linked: false,
        });
        continue;
      }

      const predictionPayload = readSnapshotPredictionPayload(
        predictionSnapshot.evidenceSummary,
      );
      if (!predictionPayload) {
        results.push({
          measurementId: measurement.id,
          axle: 'front',
          predictionSnapshotId: predictionSnapshot.id,
          predictedTreadMm: 0,
          actualTreadMm: 0,
          skipped: true,
          skipReason: 'snapshot_missing_prediction_payload',
        });
        continue;
      }

      for (const axle of ['front', 'rear'] as const) {
        if (
          !hasValidGroundTruthMeasurement({
            measurement: gtInput,
            tireSetupId: args.tireSetupId,
            axle,
            asOf: measurement.measuredAt,
          })
        ) {
          continue;
        }

        const existing = await this.prisma.tireWearDataPoint.findFirst({
          where: {
            tireSetId: args.tireSetupId,
            actualMeasurementId: measurement.id,
            axle,
          },
          select: { id: true },
        });
        if (existing) continue;

        const actualTreadMm = resolveAxleGroundTruthTreadMm(gtInput, axle);
        const predictedTreadMm = this.resolvePredictedAxleTreadMm(
          predictionSnapshot.evidenceSummary,
          axle,
        );
        if (actualTreadMm == null || predictedTreadMm == null) continue;

        const provenance = buildWearDataPointProvenance({
          predictedTreadMm,
          actualTreadMm,
          measurementId: measurement.id,
          measurementSource: measurement.source,
          evidenceSource:
            measurement.evidenceSource ??
            mapLegacyMeasurementSourceToEvidence(measurement.source),
          measuredAt: measurement.measuredAt,
          predictionGeneratedAt:
            predictionSnapshot.predictionGeneratedAt ??
            predictionSnapshot.snapshotDate,
          modelVersion: predictionSnapshot.modelVersion,
          modelConfigHash: predictionSnapshot.modelConfigHash,
          predictionSnapshotId: predictionSnapshot.id,
        });

        await this.prisma.tireWearDataPoint
          .create({
            data: {
              organizationId: args.organizationId,
              vehicleId: args.vehicleId,
              tireSetId: args.tireSetupId,
              axle,
              distanceKm,
              predictedTreadMm,
              actualTreadMm,
              initialTreadMm:
                axle === 'front'
                  ? args.referenceNewTreadFront
                  : args.referenceNewTreadRear,
              tireWidthMm:
                axle === 'front'
                  ? args.frontTireWidthMm
                  : args.rearTireWidthMm,
              tireSeason: args.tireSeason,
              climateFactor: args.climateFactor,
              roadSurfaceFactor: 1.0,
              roadTypeFactor: args.usageFactor,
              drivingStyleFactor: args.behaviorFactor,
              regenFactor: args.regenFactor,
              ...provenance,
            },
          })
          .catch((error) =>
            this.logger.warn(
              `Validation wear data point write failed for measurement=${measurement.id} axle=${axle}: ${error.message}`,
            ),
          );

        const linked = {
          measurementId: measurement.id,
          axle,
          predictionSnapshotId: predictionSnapshot.id,
          predictedTreadMm,
          actualTreadMm,
        };
        results.push(linked);
        linkedResults.push(linked);
        this.observability?.recordPredictionValidation({
          errorMm: predictedTreadMm - actualTreadMm,
          linked: true,
        });
      }
    }

    if (linkedResults.length > 0) {
      const mae =
        linkedResults.reduce(
          (sum, r) => sum + Math.abs(r.predictedTreadMm - r.actualTreadMm),
          0,
        ) / linkedResults.length;
      this.observability?.recordPredictionMae(mae);
    }

    return results;
  }
}
