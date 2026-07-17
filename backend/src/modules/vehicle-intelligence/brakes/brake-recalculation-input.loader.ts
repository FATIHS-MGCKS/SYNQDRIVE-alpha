import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import {
  BRAKE_WEAR_MODEL_VERSION,
  type BrakeRecalculationInputContext,
} from './brake-recalculation-fingerprint';

const GAP_POLICY_VERSION = 'brake-coverage-gap-v1';
const BRAKE_DTC_PREFIXES = ['C0', 'C1', 'B1'];

function isBrakeRelatedDtcCode(code: string): boolean {
  const upper = code.toUpperCase();
  return BRAKE_DTC_PREFIXES.some((prefix) => upper.startsWith(prefix));
}

@Injectable()
export class BrakeRecalculationInputLoader {
  constructor(private readonly prisma: PrismaService) {}

  async load(vehicleId: string): Promise<BrakeRecalculationInputContext | null> {
    return this.loadAsOf(vehicleId, new Date());
  }

  /**
   * Historical input loader for as-of replay. Excludes trips, evidence, ledger rows,
   * DTC events, specs, and installations that did not exist yet at `asOf`.
   */
  async loadAsOf(
    vehicleId: string,
    asOf: Date,
  ): Promise<BrakeRecalculationInputContext | null> {
    const current = await this.prisma.brakeHealthCurrent.findUnique({ where: { vehicleId } });
    if (!current) return null;
    if (
      !current.isInitialized ||
      current.anchorServiceDate == null ||
      current.anchorOdometerKm == null
    ) {
      return null;
    }
    if (current.anchorServiceDate > asOf) {
      return null;
    }

    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: {
        organizationId: true,
        fuelType: true,
        brakeForceFrontPercent: true,
      },
    });
    if (!vehicle) return null;

    const latestState = await this.prisma.vehicleLatestState.findUnique({
      where: { vehicleId },
      select: { odometerKm: true },
    });

    const anchorDate = current.anchorServiceDate;
    const installations = await this.prisma.brakeComponentInstallation.findMany({
      where: {
        vehicleId,
        installedAt: { lte: asOf },
        OR: [{ removedAt: null }, { removedAt: { gt: asOf } }],
      },
      select: {
        id: true,
        componentType: true,
        status: true,
        installedAt: true,
        anchorThicknessMm: true,
        anchorSource: true,
        sourceEvidenceId: true,
      },
    });

    const referenceSpecs = await this.prisma.vehicleBrakeReferenceSpec.findMany({
      where: {
        vehicleId,
        updatedAt: { lte: asOf },
      },
      select: {
        id: true,
        updatedAt: true,
        frontPadMinimumThicknessMm: true,
        rearPadMinimumThicknessMm: true,
        frontDiscMinimumThicknessMm: true,
        rearDiscMinimumThicknessMm: true,
        thresholdSource: true,
        thresholdConfirmedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: 5,
    });

    const evidence = await this.prisma.brakeEvidence.findMany({
      where: {
        vehicleId,
        ...(anchorDate
          ? {
              OR: [
                { measuredAt: { gte: anchorDate, lte: asOf } },
                { measuredAt: null, createdAt: { gte: anchorDate, lte: asOf } },
              ],
            }
          : { createdAt: { lte: asOf } }),
      },
      select: {
        id: true,
        createdAt: true,
        measuredAt: true,
        source: true,
        axle: true,
        measuredPadMm: true,
        measuredDiscMm: true,
        brakeFluidStatus: true,
        discCondition: true,
        dtcSeverity: true,
        immediateReplacement: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 40,
    });

    const tripImpacts = await this.prisma.tripDrivingImpact.findMany({
      where: {
        vehicleId,
        ...(anchorDate
          ? { tripStartedAt: { gte: anchorDate, lte: asOf } }
          : { tripStartedAt: { lte: asOf } }),
        analysisStatus: { in: ['COMPLETE', 'PARTIAL'] },
      },
      select: {
        tripStartedAt: true,
        updatedAt: true,
        distanceKm: true,
        authoritativeDistanceKm: true,
        hardBrakePer100Km: true,
        fullBrakingPer100Km: true,
      },
    });

    let rawDistanceKm = 0;
    let authoritativeDistanceKm = 0;
    let hardBrakePer100KmSum = 0;
    let fullBrakingPer100KmSum = 0;
    let latestTripStartedAt: Date | null = null;
    let latestUpdatedAt: Date | null = null;
    for (const trip of tripImpacts) {
      const raw = trip.distanceKm ?? 0;
      const auth = trip.authoritativeDistanceKm ?? raw;
      rawDistanceKm += raw;
      authoritativeDistanceKm += auth;
      hardBrakePer100KmSum += trip.hardBrakePer100Km ?? 0;
      fullBrakingPer100KmSum += trip.fullBrakingPer100Km ?? 0;
      if (!latestTripStartedAt || trip.tripStartedAt > latestTripStartedAt) {
        latestTripStartedAt = trip.tripStartedAt;
      }
      if (!latestUpdatedAt || trip.updatedAt > latestUpdatedAt) {
        latestUpdatedAt = trip.updatedAt;
      }
    }

    const ledgerRows = await this.prisma.brakingEventLedger.findMany({
      where: {
        vehicleId,
        invalidatedAt: null,
        occurredAt: {
          ...(anchorDate ? { gte: anchorDate } : {}),
          lte: asOf,
        },
      },
      select: {
        canonicalType: true,
        occurredAt: true,
      },
    });
    let harshBraking = 0;
    let extremeBraking = 0;
    let fullBraking = 0;
    let highSpeedBraking = 0;
    let latestLedgerAt: Date | null = null;
    for (const row of ledgerRows) {
      switch (row.canonicalType) {
        case 'HARSH_BRAKING':
          harshBraking += 1;
          break;
        case 'EXTREME_BRAKING':
          extremeBraking += 1;
          break;
        case 'FULL_BRAKING':
          fullBraking += 1;
          break;
        case 'HIGH_SPEED_BRAKING':
          highSpeedBraking += 1;
          break;
        default:
          break;
      }
      if (!latestLedgerAt || row.occurredAt > latestLedgerAt) {
        latestLedgerAt = row.occurredAt;
      }
    }

    const dtcEvents = await this.prisma.vehicleDtcEvent.findMany({
      where: {
        vehicleId,
        isActive: true,
        lastSeenAt: { lte: asOf },
      },
      select: {
        dtcCode: true,
        severity: true,
        isActive: true,
        lastSeenAt: true,
      },
    });

    const useLaterCalibration =
      current.lastRecalculatedAt != null && current.lastRecalculatedAt > asOf;

    return {
      vehicleId,
      organizationId: vehicle.organizationId,
      anchor: {
        isInitialized: current.isInitialized,
        anchorServiceDate: current.anchorServiceDate?.toISOString() ?? null,
        anchorOdometerKm: current.anchorOdometerKm,
        anchorValidationStatus: current.anchorValidationStatus,
        calibrationCount: useLaterCalibration ? 0 : current.calibrationCount,
        frontPadAnchorMm: current.frontPadAnchorMm,
        rearPadAnchorMm: current.rearPadAnchorMm,
        frontDiscAnchorMm: current.frontDiscAnchorMm,
        rearDiscAnchorMm: current.rearDiscAnchorMm,
        frontPadKFactor: useLaterCalibration ? 1 : current.frontPadKFactor,
        rearPadKFactor: useLaterCalibration ? 1 : current.rearPadKFactor,
        frontDiscKFactor: useLaterCalibration ? 1 : current.frontDiscKFactor,
        rearDiscKFactor: useLaterCalibration ? 1 : current.rearDiscKFactor,
        updatedAt: current.updatedAt.toISOString(),
      },
      vehicle: {
        fuelType: vehicle.fuelType,
        brakeForceFrontPercent: vehicle.brakeForceFrontPercent,
      },
      latestOdometerKm: latestState?.odometerKm ?? null,
      componentInstallations: installations.map((row) => ({
        id: row.id,
        componentType: row.componentType,
        status: row.status,
        installedAt: row.installedAt.toISOString(),
        anchorThicknessMm: row.anchorThicknessMm,
        anchorSource: row.anchorSource,
        evidenceId: row.sourceEvidenceId,
      })),
      referenceSpecs: referenceSpecs.map((row) => ({
        id: row.id,
        updatedAt: row.updatedAt.toISOString(),
        frontPadMinimumThicknessMm: row.frontPadMinimumThicknessMm,
        rearPadMinimumThicknessMm: row.rearPadMinimumThicknessMm,
        frontDiscMinimumThicknessMm: row.frontDiscMinimumThicknessMm,
        rearDiscMinimumThicknessMm: row.rearDiscMinimumThicknessMm,
        thresholdSource: row.thresholdSource,
        thresholdConfirmedAt: row.thresholdConfirmedAt?.toISOString() ?? null,
      })),
      evidence: evidence.map((row) => ({
        id: row.id,
        createdAt: row.createdAt.toISOString(),
        measuredAt: row.measuredAt?.toISOString() ?? null,
        source: row.source,
        axle: row.axle,
        measuredPadMm: row.measuredPadMm,
        measuredDiscMm: row.measuredDiscMm,
        brakeFluidStatus: row.brakeFluidStatus,
        discCondition: row.discCondition,
        dtcSeverity: row.dtcSeverity,
        immediateReplacement: row.immediateReplacement,
      })),
      tdiAggregate: {
        tripCount: tripImpacts.length,
        rawDistanceKm,
        authoritativeDistanceKm,
        latestTripStartedAt: latestTripStartedAt?.toISOString() ?? null,
        latestUpdatedAt: latestUpdatedAt?.toISOString() ?? null,
        hardBrakePer100KmSum,
        fullBrakingPer100KmSum,
      },
      ledgerAggregate: {
        totalEvents: ledgerRows.length,
        harshBraking,
        extremeBraking,
        fullBraking,
        highSpeedBraking,
        latestOccurredAt: latestLedgerAt?.toISOString() ?? null,
      },
      activeDtc: dtcEvents
        .filter((row) => isBrakeRelatedDtcCode(row.dtcCode))
        .map((row) => ({
          code: row.dtcCode,
          severity: row.severity,
          isActive: row.isActive,
          lastSeenAt: row.lastSeenAt.toISOString(),
        })),
      gapPolicyVersion: GAP_POLICY_VERSION,
    };
  }

  modelVersion(): string {
    return BRAKE_WEAR_MODEL_VERSION;
  }
}
