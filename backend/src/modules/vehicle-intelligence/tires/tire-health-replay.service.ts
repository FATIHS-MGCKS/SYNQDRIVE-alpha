import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { TireSetupStatus } from '@prisma/client';
import { TireWearModelService } from './tire-wear-model.service';
import {
  computeTireRecalculationInputFingerprint,
  resolvePressureFreshnessBucket,
  type TireRecalculationInputContext,
} from './tire-recalculation-fingerprint';
import {
  isWearModelConfigReproducible,
  readSnapshotPredictionPayload,
  resolveWearModelRegistryEntry,
  TIRE_WEAR_MODEL_VERSION,
  computeTireWearModelConfigHash,
} from './tire-wear-model-version';

export type TireHealthReplayStatus =
  | 'REPRODUCED_FROM_SNAPSHOT'
  | 'RECOMPUTED'
  | 'NOT_REPRODUCIBLE'
  | 'NO_DATA';

export interface TireHealthReplayRequest {
  vehicleId: string;
  tireSetupId?: string;
  asOf: Date;
}

export interface TireHealthReplayResult {
  status: TireHealthReplayStatus;
  asOf: string;
  vehicleId: string;
  tireSetupId: string | null;
  modelVersion: string | null;
  modelConfigHash: string | null;
  snapshotId: string | null;
  predictionGeneratedAt: string | null;
  inputFingerprint: string | null;
  predictedTreadByAxle: { front: number; rear: number } | null;
  predictedTreadByWheel: {
    FL: number;
    FR: number;
    RL: number;
    RR: number;
  } | null;
  evidenceSummary: Record<string, unknown> | null;
  reason: string | null;
}

/**
 * Read-only historical tire prediction replay. Never mutates snapshots,
 * measurements, or validation rows. Does not substitute the current formula
 * when the stored config version is unknown.
 */
@Injectable()
export class TireHealthReplayService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wearModel: TireWearModelService,
  ) {}

  async replay(request: TireHealthReplayRequest): Promise<TireHealthReplayResult> {
    const asOf = request.asOf;
    const setup = request.tireSetupId
      ? await this.prisma.vehicleTireSetup.findFirst({
          where: { id: request.tireSetupId, vehicleId: request.vehicleId },
        })
      : await this.prisma.vehicleTireSetup.findFirst({
          where: {
            vehicleId: request.vehicleId,
            removedAt: null,
            status: TireSetupStatus.ACTIVE,
            installedAt: { lte: asOf },
          },
          orderBy: { installedAt: 'desc' },
        });

    if (!setup) {
      return this.emptyResult(request, 'NO_DATA', 'no_setup_at_as_of');
    }

    const snapshot = await this.prisma.tireHealthSnapshot.findFirst({
      where: {
        tireSetId: setup.id,
        OR: [
          { predictionGeneratedAt: { lte: asOf } },
          { predictionGeneratedAt: null, snapshotDate: { lte: asOf } },
        ],
      },
      orderBy: [
        { predictionGeneratedAt: 'desc' },
        { snapshotDate: 'desc' },
      ],
    });

    if (snapshot) {
      const payload = readSnapshotPredictionPayload(snapshot.evidenceSummary);
      const reproducible = isWearModelConfigReproducible(
        snapshot.modelVersion,
        snapshot.modelConfigHash,
      );

      if (!reproducible) {
        return {
          status: 'NOT_REPRODUCIBLE',
          asOf: asOf.toISOString(),
          vehicleId: request.vehicleId,
          tireSetupId: setup.id,
          modelVersion: snapshot.modelVersion,
          modelConfigHash: snapshot.modelConfigHash,
          snapshotId: snapshot.id,
          predictionGeneratedAt:
            snapshot.predictionGeneratedAt?.toISOString() ??
            snapshot.snapshotDate.toISOString(),
          inputFingerprint: snapshot.inputFingerprint,
          predictedTreadByAxle: payload?.predictedTreadByAxle ?? null,
          predictedTreadByWheel: payload?.predictedTreadByWheel ?? null,
          evidenceSummary:
            snapshot.evidenceSummary != null &&
            typeof snapshot.evidenceSummary === 'object' &&
            !Array.isArray(snapshot.evidenceSummary)
              ? (snapshot.evidenceSummary as Record<string, unknown>)
              : null,
          reason: 'stored_config_not_executable',
        };
      }

      return {
        status: 'REPRODUCED_FROM_SNAPSHOT',
        asOf: asOf.toISOString(),
        vehicleId: request.vehicleId,
        tireSetupId: setup.id,
        modelVersion: snapshot.modelVersion,
        modelConfigHash: snapshot.modelConfigHash,
        snapshotId: snapshot.id,
        predictionGeneratedAt:
          snapshot.predictionGeneratedAt?.toISOString() ??
          snapshot.snapshotDate.toISOString(),
        inputFingerprint: snapshot.inputFingerprint,
        predictedTreadByAxle: payload?.predictedTreadByAxle ?? null,
        predictedTreadByWheel: payload?.predictedTreadByWheel ?? null,
        evidenceSummary:
          snapshot.evidenceSummary != null &&
          typeof snapshot.evidenceSummary === 'object' &&
          !Array.isArray(snapshot.evidenceSummary)
            ? (snapshot.evidenceSummary as Record<string, unknown>)
            : null,
        reason: null,
      };
    }

    const registryEntry = resolveWearModelRegistryEntry(
      TIRE_WEAR_MODEL_VERSION,
      computeTireWearModelConfigHash(),
    );
    if (!registryEntry) {
      return this.emptyResult(request, 'NOT_REPRODUCIBLE', 'no_registry_entry');
    }

    const historicalContext = await this.buildHistoricalInputContext(
      request.vehicleId,
      setup,
      asOf,
    );
    const fingerprint = computeTireRecalculationInputFingerprint(historicalContext, {
      asOf,
    });

    const wearAnalysis = await this.wearModel.computeWearAnalysis(request.vehicleId, {
      asOf,
      tireSetupId: setup.id,
    });

    if (!wearAnalysis) {
      return this.emptyResult(request, 'NO_DATA', 'wear_analysis_unavailable');
    }

    return {
      status: 'RECOMPUTED',
      asOf: asOf.toISOString(),
      vehicleId: request.vehicleId,
      tireSetupId: setup.id,
      modelVersion: fingerprint.modelVersion,
      modelConfigHash: fingerprint.modelConfigHash,
      snapshotId: null,
      predictionGeneratedAt: asOf.toISOString(),
      inputFingerprint: fingerprint.inputFingerprint,
      predictedTreadByAxle: {
        front: (wearAnalysis.frontLeftMm + wearAnalysis.frontRightMm) / 2,
        rear: (wearAnalysis.rearLeftMm + wearAnalysis.rearRightMm) / 2,
      },
      predictedTreadByWheel: {
        FL: wearAnalysis.frontLeftMm,
        FR: wearAnalysis.frontRightMm,
        RL: wearAnalysis.rearLeftMm,
        RR: wearAnalysis.rearRightMm,
      },
      evidenceSummary: null,
      reason: 'recomputed_from_historical_inputs',
    };
  }

  private async buildHistoricalInputContext(
    vehicleId: string,
    setup: {
      id: string;
      updatedAt: Date;
      tireSeason: string;
      tireCondition: string;
      isStaggered: boolean;
      frontDimension: string | null;
      rearDimension: string | null;
      brandModelFront: string | null;
      brandModelRear: string | null;
      initialTreadDepthMm: number | null;
      initialTreadFrontMm: number | null;
      initialTreadRearMm: number | null;
      initialTreadEvidenceSource: string | null;
      baselineStatus: string | null;
      baselineConfidence: number | null;
      referenceNewTreadMm: number | null;
      operationalReplacementMm: number | null;
      expectedLifeKm: number | null;
      expectedLifeKmFront: number | null;
      expectedLifeKmRear: number | null;
      frontTireWidthMm: number | null;
      rearTireWidthMm: number | null;
      dotCodeFront: string | null;
      dotCodeRear: string | null;
      installedOdometerKm: number | null;
      odometerAnchorStatus: string | null;
      kFactorFront: number;
      kFactorRear: number;
      kFactorCalibrationCount: number;
      regenBrakingFactorFront: number | null;
      regenBrakingFactorRear: number | null;
      aiTireSpec: unknown;
      totalKmOnSet: number;
      cityKm: number;
      highwayKm: number;
      ruralKm: number;
      harshAccelEvents: number;
      harshBrakeEvents: number;
      harshCornerEvents: number;
    },
    asOf: Date,
  ): Promise<TireRecalculationInputContext> {
    const ninetyDaysAgo = new Date(asOf.getTime() - 90 * 24 * 60 * 60 * 1000);

    const [
      vehicle,
      latestState,
      tires,
      measurements,
      regressionPoints,
      temperatureTrips,
    ] = await Promise.all([
      this.prisma.vehicle.findUnique({
        where: { id: vehicleId },
        select: {
          fuelType: true,
          driveType: true,
          curbWeightKg: true,
          frontWeightDistributionPct: true,
        },
      }),
      this.prisma.vehicleLatestState.findUnique({
        where: { vehicleId },
        select: {
          odometerKm: true,
          tirePressureFl: true,
          tirePressureFr: true,
          tirePressureRl: true,
          tirePressureRr: true,
          speedKmh: true,
          sourceTimestamp: true,
          providerFetchedAt: true,
          lastSeenAt: true,
        },
      }),
      this.prisma.tire.findMany({
        where: { tireSetId: setup.id, vehicleId },
        select: {
          id: true,
          currentPosition: true,
          dotCode: true,
          initialTreadDepthMm: true,
          estimatedTreadMm: true,
          initialTreadEvidenceSource: true,
        },
      }),
      this.prisma.vehicleTireTreadMeasurement.findMany({
        where: {
          vehicleId,
          tireSetupId: setup.id,
          measuredAt: { lte: asOf },
        },
        orderBy: { measuredAt: 'desc' },
        take: 10,
        select: {
          id: true,
          createdAt: true,
          measuredAt: true,
          source: true,
          evidenceSource: true,
          odometerAtMeasurement: true,
          frontLeftMm: true,
          frontRightMm: true,
          rearLeftMm: true,
          rearRightMm: true,
        },
      }),
      this.prisma.tireWearDataPoint.findMany({
        where: {
          vehicleId,
          tireSetId: setup.id,
          createdAt: { lte: asOf },
        },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          axle: true,
          distanceKm: true,
          actualTreadMm: true,
          predictedTreadMm: true,
          actualMeasurementId: true,
        },
      }),
      this.prisma.vehicleTrip.findMany({
        where: {
          vehicleId,
          startTime: { gte: ninetyDaysAgo, lte: asOf },
        },
        select: { distanceKm: true, outsideTemperatureStartC: true },
        take: 200,
      }),
    ]);

    const pressureValues = [
      latestState?.tirePressureFl,
      latestState?.tirePressureFr,
      latestState?.tirePressureRl,
      latestState?.tirePressureRr,
    ].filter((v): v is number => v != null);

    return {
      setupId: setup.id,
      setupUpdatedAt: setup.updatedAt.toISOString(),
      vehicle: {
        fuelType: vehicle?.fuelType ?? null,
        driveType: vehicle?.driveType ?? null,
        curbWeightKg: vehicle?.curbWeightKg ?? null,
        frontWeightDistributionPct: vehicle?.frontWeightDistributionPct ?? null,
      },
      setup: {
        tireSeason: setup.tireSeason,
        tireCondition: setup.tireCondition ?? null,
        isStaggered: setup.isStaggered,
        frontDimension: setup.frontDimension ?? null,
        rearDimension: setup.rearDimension ?? null,
        brandModelFront: setup.brandModelFront ?? null,
        brandModelRear: setup.brandModelRear ?? null,
        initialTreadDepthMm: setup.initialTreadDepthMm,
        initialTreadFrontMm: setup.initialTreadFrontMm,
        initialTreadRearMm: setup.initialTreadRearMm,
        initialTreadEvidenceSource: setup.initialTreadEvidenceSource as never,
        baselineStatus: setup.baselineStatus,
        baselineConfidence: setup.baselineConfidence,
        referenceNewTreadMm: setup.referenceNewTreadMm,
        operationalReplacementMm: setup.operationalReplacementMm,
        expectedLifeKm: setup.expectedLifeKm,
        expectedLifeKmFront: setup.expectedLifeKmFront,
        expectedLifeKmRear: setup.expectedLifeKmRear,
        frontTireWidthMm: setup.frontTireWidthMm,
        rearTireWidthMm: setup.rearTireWidthMm,
        dotCodeFront: setup.dotCodeFront ?? null,
        dotCodeRear: setup.dotCodeRear ?? null,
        installedOdometerKm: setup.installedOdometerKm,
        odometerAnchorStatus: setup.odometerAnchorStatus ?? null,
        kFactorFront: setup.kFactorFront,
        kFactorRear: setup.kFactorRear,
        kFactorCalibrationCount: setup.kFactorCalibrationCount,
        regenBrakingFactorFront: setup.regenBrakingFactorFront,
        regenBrakingFactorRear: setup.regenBrakingFactorRear,
        aiTireSpec: setup.aiTireSpec,
      },
      ledgerAggregate: {
        totalKmOnSet: setup.totalKmOnSet,
        cityKm: setup.cityKm,
        highwayKm: setup.highwayKm,
        ruralKm: setup.ruralKm,
        harshAccelEvents: setup.harshAccelEvents,
        harshBrakeEvents: setup.harshBrakeEvents,
        harshCornerEvents: setup.harshCornerEvents,
      },
      tires: tires.map((tire) => ({
        id: tire.id,
        currentPosition: String(tire.currentPosition),
        dotCode: tire.dotCode,
        initialTreadDepthMm: tire.initialTreadDepthMm,
        estimatedTreadMm: tire.estimatedTreadMm,
        initialTreadEvidenceSource: tire.initialTreadEvidenceSource,
      })),
      measurements: measurements.map((m) => ({
        id: m.id,
        createdAt: m.createdAt.toISOString(),
        measuredAt: m.measuredAt.toISOString(),
        source: m.source,
        evidenceSource: m.evidenceSource,
        odometerAtMeasurement: m.odometerAtMeasurement,
        frontLeftMm: m.frontLeftMm,
        frontRightMm: m.frontRightMm,
        rearLeftMm: m.rearLeftMm,
        rearRightMm: m.rearRightMm,
      })),
      regressionPoints: regressionPoints.map((p) => ({
        id: p.id,
        axle: p.axle,
        distanceKm: p.distanceKm,
        actualTreadMm: p.actualTreadMm,
        predictedTreadMm: p.predictedTreadMm,
        actualMeasurementId: p.actualMeasurementId,
      })),
      latestState: {
        odometerKm: latestState?.odometerKm ?? null,
        tirePressureFl: latestState?.tirePressureFl ?? null,
        tirePressureFr: latestState?.tirePressureFr ?? null,
        tirePressureRl: latestState?.tirePressureRl ?? null,
        tirePressureRr: latestState?.tirePressureRr ?? null,
        speedKmh: latestState?.speedKmh ?? null,
        pressureFreshness: resolvePressureFreshnessBucket(
          latestState?.sourceTimestamp ??
            latestState?.providerFetchedAt ??
            latestState?.lastSeenAt ??
            null,
          pressureValues.length > 0,
          asOf,
        ),
      },
      drivingImpact: null,
      temperatureTrips,
      modelVersion: TIRE_WEAR_MODEL_VERSION,
      asOf,
    };
  }

  private emptyResult(
    request: TireHealthReplayRequest,
    status: TireHealthReplayStatus,
    reason: string,
  ): TireHealthReplayResult {
    return {
      status,
      asOf: request.asOf.toISOString(),
      vehicleId: request.vehicleId,
      tireSetupId: request.tireSetupId ?? null,
      modelVersion: null,
      modelConfigHash: null,
      snapshotId: null,
      predictionGeneratedAt: null,
      inputFingerprint: null,
      predictedTreadByAxle: null,
      predictedTreadByWheel: null,
      evidenceSummary: null,
      reason,
    };
  }
}
