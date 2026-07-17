import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { readSnapshotPredictionPayload } from './brake-wear-model-version';

export interface BrakeMeasurementLinkResult {
  evidenceId: string;
  predictionSnapshotId: string;
  skipped?: boolean;
  skipReason?: string;
}

/**
 * Links ground-truth brake evidence to the prediction snapshot that existed
 * **before** the measurement — never the operative snapshot from the same pass.
 */
@Injectable()
export class BrakePredictionValidationService {
  private readonly logger = new Logger(BrakePredictionValidationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Find the latest prediction snapshot strictly before `measuredAt`.
   * Measurements must not retroactively bind to snapshots generated later.
   */
  async findPreMeasurementSnapshot(
    vehicleId: string,
    measuredAt: Date,
  ): Promise<{
    id: string;
    generatedAt: Date;
    modelVersion: string;
    modelConfigHash: string;
    anchorEvidenceSummary: unknown;
    frontPadEstimateMm: number | null;
    rearPadEstimateMm: number | null;
    frontDiscEstimateMm: number | null;
    rearDiscEstimateMm: number | null;
  } | null> {
    const snapshot = await this.prisma.brakeHealthSnapshot.findFirst({
      where: {
        vehicleId,
        generatedAt: { lt: measuredAt },
      },
      orderBy: { generatedAt: 'desc' },
      select: {
        id: true,
        generatedAt: true,
        modelVersion: true,
        modelConfigHash: true,
        anchorEvidenceSummary: true,
        frontPadEstimateMm: true,
        rearPadEstimateMm: true,
        frontDiscEstimateMm: true,
        rearDiscEstimateMm: true,
      },
    });
    return snapshot;
  }

  resolvePredictedPadMm(
    snapshot: {
      anchorEvidenceSummary: unknown;
      frontPadEstimateMm: number | null;
      rearPadEstimateMm: number | null;
    },
    axle: 'FRONT' | 'REAR',
  ): number | null {
    const payload = readSnapshotPredictionPayload(snapshot.anchorEvidenceSummary);
    if (payload) {
      return axle === 'FRONT' ? payload.frontPadEstimateMm : payload.rearPadEstimateMm;
    }
    return axle === 'FRONT' ? snapshot.frontPadEstimateMm : snapshot.rearPadEstimateMm;
  }

  resolvePredictedDiscMm(
    snapshot: {
      anchorEvidenceSummary: unknown;
      frontDiscEstimateMm: number | null;
      rearDiscEstimateMm: number | null;
    },
    axle: 'FRONT' | 'REAR',
  ): number | null {
    const payload = readSnapshotPredictionPayload(snapshot.anchorEvidenceSummary);
    if (payload) {
      return axle === 'FRONT' ? payload.frontDiscEstimateMm : payload.rearDiscEstimateMm;
    }
    return axle === 'FRONT' ? snapshot.frontDiscEstimateMm : snapshot.rearDiscEstimateMm;
  }

  /**
   * Link eligible manual/workshop measurements to their pre-measurement snapshot.
   * Measurements and predictions remain separate rows — only a reference is stored.
   */
  async linkPendingMeasurementSnapshots(args: {
    vehicleId: string;
    asOf?: Date;
  }): Promise<BrakeMeasurementLinkResult[]> {
    const asOf = args.asOf ?? new Date();
    const results: BrakeMeasurementLinkResult[] = [];

    const evidenceRows = await this.prisma.brakeEvidence.findMany({
      where: {
        vehicleId: args.vehicleId,
        predictionSnapshotId: null,
        measuredAt: { lte: asOf, not: null },
        source: { in: ['MANUAL_MEASUREMENT', 'WORKSHOP_REPORT', 'AI_UPLOAD'] },
      },
      orderBy: { measuredAt: 'asc' },
      select: {
        id: true,
        measuredAt: true,
        axle: true,
        measuredPadMm: true,
        measuredDiscMm: true,
      },
    });

    for (const evidence of evidenceRows) {
      if (!evidence.measuredAt) continue;
      if (evidence.measuredPadMm == null && evidence.measuredDiscMm == null) {
        results.push({
          evidenceId: evidence.id,
          predictionSnapshotId: '',
          skipped: true,
          skipReason: 'no_measurable_values',
        });
        continue;
      }

      const snapshot = await this.findPreMeasurementSnapshot(
        args.vehicleId,
        evidence.measuredAt,
      );
      if (!snapshot) {
        results.push({
          evidenceId: evidence.id,
          predictionSnapshotId: '',
          skipped: true,
          skipReason: 'no_pre_measurement_snapshot',
        });
        continue;
      }

      const existing = await this.prisma.brakeEvidence.findUnique({
        where: { id: evidence.id },
        select: { predictionSnapshotId: true },
      });
      if (existing?.predictionSnapshotId) {
        results.push({
          evidenceId: evidence.id,
          predictionSnapshotId: existing.predictionSnapshotId,
          skipped: true,
          skipReason: 'already_linked',
        });
        continue;
      }

      await this.prisma.brakeEvidence
        .update({
          where: { id: evidence.id },
          data: { predictionSnapshotId: snapshot.id },
        })
        .catch((error) =>
          this.logger.warn(
            `Brake evidence snapshot link failed evidence=${evidence.id}: ${error.message}`,
          ),
        );

      results.push({
        evidenceId: evidence.id,
        predictionSnapshotId: snapshot.id,
      });
    }

    return results;
  }
}
