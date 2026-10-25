import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TireBaselineStatus, TireEvidenceSource, TireOdometerAnchorStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import type { AiTireSpec } from '../tire-health.config';
import type { WheelPos } from '../tire-evidence-provenance';
import {
  TIRE_WEAR_V3_PRIOR_CONFIG,
  TIRE_WEAR_V3_PRIOR_DYNAMIC_BETA,
  TIRE_WEAR_V3_PRIOR_MODEL_VERSION,
  computeTireWearV3PriorConfigHash,
} from './tire-wear-v3-prior.config';
import { computeTireWearV3PriorInputFingerprint } from './tire-wear-v3-prior.fingerprint';
import {
  buildWearRateEstimate,
  deriveEvidenceLevel,
  listWheelPositions,
  projectTreadMm,
  remainingKmInterval,
  resolveArchetypeAndSeason,
  resolveReplacementMm,
  resolveWheelInitialTread,
} from './tire-wear-v3-prior.math';
import { TireWearV3PriorRepository } from './tire-wear-v3-prior.repository';
import type {
  TireWearV3MeasurementPoint,
  TireWearV3PriorSetupResult,
  TireWearV3WheelProjection,
} from './tire-wear-v3-prior.types';

function wheelField(position: WheelPos): 'frontLeftMm' | 'frontRightMm' | 'rearLeftMm' | 'rearRightMm' {
  switch (position) {
    case 'FL':
      return 'frontLeftMm';
    case 'FR':
      return 'frontRightMm';
    case 'RL':
      return 'rearLeftMm';
    case 'RR':
      return 'rearRightMm';
    default:
      return 'frontLeftMm';
  }
}

function parseAiTireSpec(raw: unknown): AiTireSpec | null {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  return raw as AiTireSpec;
}

@Injectable()
export class TireWearV3PriorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: TireWearV3PriorRepository,
    private readonly configService: ConfigService,
  ) {}

  async computeForSetup(
    tireSetupId: string,
    opts?: { asOf?: Date; persistShadow?: boolean },
  ): Promise<TireWearV3PriorSetupResult | null> {
    const asOf = opts?.asOf ?? new Date();
    const setup = await this.prisma.vehicleTireSetup.findUnique({
      where: { id: tireSetupId },
      include: {
        vehicle: {
          select: {
            organizationId: true,
            latestState: { select: { odometerKm: true } },
          },
        },
      },
    });
    if (!setup) return null;

    const spec = parseAiTireSpec(setup.aiTireSpec);
    const { archetype, season } = resolveArchetypeAndSeason(spec, setup.tireSeason);
    const replacementMm = resolveReplacementMm(spec, archetype, season);

    const ledgerRows = await this.prisma.tireTripUsageLedger.findMany({
      where: { tireSetupId, invalidatedAt: null },
      select: {
        distanceKm: true,
        revisionNumber: true,
        sourceFingerprint: true,
      },
      orderBy: { revisionNumber: 'desc' },
    });

    const ledgerDistanceKm = ledgerRows.reduce(
      (sum, row) => sum + (Number.isFinite(row.distanceKm) ? row.distanceKm : 0),
      0,
    );
    const maxRevision = ledgerRows.reduce(
      (max, row) => Math.max(max, row.revisionNumber ?? 1),
      0,
    );
    const ledgerFingerprint =
      ledgerRows.length > 0 ? ledgerRows[0]?.sourceFingerprint ?? null : null;

    const measurementsRaw = await this.prisma.vehicleTireTreadMeasurement.findMany({
      where: { tireSetupId },
      orderBy: { measuredAt: 'asc' },
      select: {
        id: true,
        measuredAt: true,
        odometerAtMeasurement: true,
        frontLeftMm: true,
        frontRightMm: true,
        rearLeftMm: true,
        rearRightMm: true,
        source: true,
        isCalibrationPoint: true,
      },
    });

    const anchorStatus = setup.odometerAnchorStatus;
    const anchorOdometerKm = setup.installedOdometerKm;
    const latestStateOdometer = setup.vehicle.latestState?.odometerKm ?? null;
    let currentOdometerKm = latestStateOdometer;
    if (
      anchorStatus === TireOdometerAnchorStatus.ANCHORED &&
      anchorOdometerKm != null &&
      currentOdometerKm == null
    ) {
      currentOdometerKm = anchorOdometerKm + ledgerDistanceKm;
    }

    const setupFlags: string[] = [];
    if (anchorStatus !== TireOdometerAnchorStatus.ANCHORED) {
      setupFlags.push('ODOMETER_ANCHOR_NOT_CONFIRMED');
    }
    if (TIRE_WEAR_V3_PRIOR_DYNAMIC_BETA !== 0) {
      setupFlags.push('UNEXPECTED_DYNAMIC_BETA');
    }

    const widenedBaseline =
      setup.initialTreadEvidenceSource === TireEvidenceSource.DEFAULT_ASSUMPTION ||
      setup.baselineStatus === TireBaselineStatus.INCOMPLETE;

    const wheels: TireWearV3WheelProjection[] = [];
    for (const position of listWheelPositions()) {
      const initial = resolveWheelInitialTread(
        position,
        setup,
        spec,
        archetype,
        season,
      );
      const field = wheelField(position);
      const measurementPoints: TireWearV3MeasurementPoint[] = [];
      for (const m of measurementsRaw) {
        const tread = m[field];
        if (tread == null || !Number.isFinite(tread)) continue;
        measurementPoints.push({
          measuredAt: m.measuredAt,
          odometerKm: m.odometerAtMeasurement,
          treadMm: tread,
          source: m.source,
          isCalibrationPoint: m.isCalibrationPoint,
        });
      }

      const wearRate = buildWearRateEstimate({
        initialTreadMm: initial.treadMm,
        replacementMm,
        spec,
        archetype,
        season,
        setupExpectedLifeKm: setup.expectedLifeKm,
        expectedLifeKmFront: setup.expectedLifeKmFront,
        expectedLifeKmRear: setup.expectedLifeKmRear,
        position,
        widenedBaseline: widenedBaseline || initial.usedDefaultFallback,
        measurements: measurementPoints,
        sigmaMeasMm: TIRE_WEAR_V3_PRIOR_CONFIG.defaultMeasurementUncertaintyMm,
      });

      const rateRejected = wearRate.flags.some((f) =>
        ['RATE_NEGATIVE_WEAR_REJECTED', 'RATE_IMPLAUSIBLY_HIGH'].includes(f),
      );
      const rateMid = (wearRate.mmPerKm.lo + wearRate.mmPerKm.hi) / 2;
      const rateRel =
        rateMid > 0 ? (wearRate.mmPerKm.hi - wearRate.mmPerKm.lo) / (2 * rateMid) : null;

      const withOdometer = measurementPoints.filter((p) => p.odometerKm != null);
      const spanKm =
        withOdometer.length >= 2
          ? withOdometer[withOdometer.length - 1]!.odometerKm! -
            withOdometer[0]!.odometerKm!
          : null;

      const evidenceLevel = deriveEvidenceLevel({
        anchorStatus,
        measurementCount: measurementPoints.length,
        ratePointCount: withOdometer.length,
        rateRelativeUncertainty: rateRel,
        measurementSpanKm: spanKm,
        rateRejected,
      });

      const wheelFlags: string[] = [...wearRate.flags];
      let rated =
        anchorStatus === TireOdometerAnchorStatus.ANCHORED &&
        anchorOdometerKm != null &&
        currentOdometerKm != null;

      if (!rated) {
        wheelFlags.push('UNRATED_NO_ODOMETER_CONTEXT');
      }

      let estimatedTreadMm = { lo: initial.treadMm, hi: initial.treadMm };
      let distanceSinceAnchorKm = 0;

      if (rated) {
        distanceSinceAnchorKm = Math.max(0, currentOdometerKm! - anchorOdometerKm!);
        const latestMeas = [...withOdometer].sort(
          (a, b) => b.measuredAt.getTime() - a.measuredAt.getTime(),
        )[0];

        if (latestMeas?.odometerKm != null) {
          estimatedTreadMm = projectTreadMm({
            anchorTreadMm: latestMeas.treadMm,
            anchorOdometerKm: latestMeas.odometerKm,
            currentOdometerKm: currentOdometerKm!,
            rateMmPerKm: wearRate.mmPerKm,
          });
        } else {
          estimatedTreadMm = projectTreadMm({
            anchorTreadMm: initial.treadMm,
            anchorOdometerKm: anchorOdometerKm!,
            currentOdometerKm: currentOdometerKm!,
            rateMmPerKm: wearRate.mmPerKm,
          });
        }
      } else {
        wheelFlags.push('PRIOR_ONLY_INTERVAL');
        const usable = initial.treadMm - replacementMm;
        const pessimisticWear =
          usable > 0 && ledgerDistanceKm > 0
            ? (usable / TIRE_WEAR_V3_PRIOR_CONFIG.unknownLifeKmSpan.hi) *
              ledgerDistanceKm
            : 0;
        estimatedTreadMm = {
          lo: Math.max(replacementMm, initial.treadMm - pessimisticWear * 1.25),
          hi: initial.treadMm,
        };
      }

      const remainingKm = remainingKmInterval(
        estimatedTreadMm,
        replacementMm,
        wearRate.mmPerKm,
      );

      wheels.push({
        position,
        initialTreadMm: initial.treadMm,
        initialTreadUsedDefaultFallback: initial.usedDefaultFallback,
        replacementThresholdMm: replacementMm,
        distanceSinceAnchorKm,
        estimatedTreadMm,
        remainingKm,
        wearRate,
        evidenceLevel: rated ? evidenceLevel : 'UNRATED',
        flags: wheelFlags,
      });
    }

    const fingerprint = computeTireWearV3PriorInputFingerprint({
      tireSetupId: setup.id,
      vehicleId: setup.vehicleId,
      organizationId: setup.organizationId,
      setupRevision: {
        updatedAt: setup.updatedAt?.toISOString() ?? null,
        installedOdometerKm: setup.installedOdometerKm,
        odometerAnchorStatus: setup.odometerAnchorStatus,
        initialTreadFrontMm: setup.initialTreadFrontMm,
        initialTreadRearMm: setup.initialTreadRearMm,
        initialTreadDepthMm: setup.initialTreadDepthMm,
        expectedLifeKm: setup.expectedLifeKm,
        tireSeason: setup.tireSeason,
      },
      ledger: {
        activeRowCount: ledgerRows.length,
        totalDistanceKm: Math.round(ledgerDistanceKm * 1000) / 1000,
        maxRevisionNumber: maxRevision > 0 ? maxRevision : null,
        ledgerFingerprint,
      },
      measurements: measurementsRaw.map((m) => ({
        id: m.id,
        measuredAt: m.measuredAt.toISOString(),
        odometerAtMeasurement: m.odometerAtMeasurement,
        frontLeftMm: m.frontLeftMm,
        frontRightMm: m.frontRightMm,
        rearLeftMm: m.rearLeftMm,
        rearRightMm: m.rearRightMm,
      })),
      currentOdometerKm,
      asOfIso: asOf.toISOString(),
    });

    const result: TireWearV3PriorSetupResult = {
      tireSetupId: setup.id,
      vehicleId: setup.vehicleId,
      organizationId: setup.organizationId,
      modelVersion: TIRE_WEAR_V3_PRIOR_MODEL_VERSION,
      modelConfigHash: computeTireWearV3PriorConfigHash(),
      inputFingerprint: fingerprint,
      computedAt: asOf.toISOString(),
      odometerAnchorKm: anchorOdometerKm,
      odometerAnchorStatus: anchorStatus,
      currentOdometerKm,
      ledgerDistanceKm: Math.round(ledgerDistanceKm * 1000) / 1000,
      ledgerRowCount: ledgerRows.length,
      dynamicBeta: TIRE_WEAR_V3_PRIOR_DYNAMIC_BETA,
      rated:
        anchorStatus === TireOdometerAnchorStatus.ANCHORED &&
        anchorOdometerKm != null &&
        currentOdometerKm != null,
      wheels,
      setupFlags,
    };

    const shadowWrite =
      opts?.persistShadow === true ||
      this.configService.get<boolean>('tireWearV3PriorShadow.writeEnabled') === true;

    if (shadowWrite && setup.organizationId) {
      const existing = await this.repository.findLatestShadowRow(
        setup.id,
        TIRE_WEAR_V3_PRIOR_MODEL_VERSION,
        fingerprint,
      );
      if (!existing) {
        await this.repository.insertShadowRow({
          organizationId: setup.organizationId,
          vehicleId: setup.vehicleId,
          tireSetupId: setup.id,
          modelVersion: TIRE_WEAR_V3_PRIOR_MODEL_VERSION,
          modelConfigHash: result.modelConfigHash,
          inputFingerprint: fingerprint,
          resultPayload: result,
        });
      }
    }

    return result;
  }
}
