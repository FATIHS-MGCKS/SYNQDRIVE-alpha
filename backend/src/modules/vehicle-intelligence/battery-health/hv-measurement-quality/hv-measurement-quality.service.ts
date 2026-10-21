import { Injectable } from '@nestjs/common';
import { BatteryMeasurementQuality } from '@prisma/client';
import {
  isBatteryV2HvSohPublicationEnabled,
} from '@config/battery-health-v2.config';
import { PrismaService } from '@shared/database/prisma.service';
import { ReferenceCapacityVerificationStatus } from '../battery-v2-domain';
import { isAssessmentCompatibleCapacityType } from '../reference-capacity/vehicle-battery-reference-capacity.policy';
import { computeHvSohGateAssessment } from '../hv-capacity-shadow/hv-soh-gate.policy';
import {
  evaluateHvMeasurementQualitySession,
  evaluateResearchSocWindowCoverage,
  recommendedAdditionalMeasurements,
  resolveQ4CohortSessionIds,
  resolveVehicleQualityLevel,
} from './hv-measurement-quality.policy';
import {
  HV_MEASUREMENT_CAPACITY_CONFIDENCE,
  HV_MEASUREMENT_REFERENCE_CONFIDENCE,
  HV_MEASUREMENT_SOH_PUBLICATION_READINESS,
  type HvMeasurementQualitySessionInput,
  type HvMeasurementQualityVehicleResult,
} from './hv-measurement-quality.types';

@Injectable()
export class HvMeasurementQualityService {
  constructor(private readonly prisma: PrismaService) {}

  async getVehicleMeasurementQuality(
    organizationId: string,
    vehicleId: string,
  ): Promise<HvMeasurementQualityVehicleResult> {
    const rows = await this.prisma.hvChargeSession.findMany({
      where: { organizationId, vehicleId },
      orderBy: { startAt: 'asc' },
    });

    const inputs: HvMeasurementQualitySessionInput[] = rows.map((row) => ({
      sessionId: row.id,
      startAt: row.startAt,
      endAt: row.endAt,
      source: row.source,
      isOngoing: row.isOngoing,
      startSocPercent: row.startSocPercent,
      endSocPercent: row.endSocPercent,
      startEnergyKwh: row.startEnergyKwh,
      endEnergyKwh: row.endEnergyKwh,
      energyAddedKwh: row.energyAddedKwh,
      deltaSocPercent: row.deltaSocPercent,
      measurementQuality: row.quality ?? BatteryMeasurementQuality.NO_DATA,
      metadata:
        row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
          ? (row.metadata as Record<string, unknown>)
          : null,
    }));

    const preliminary = inputs.map((row) =>
      evaluateHvMeasurementQualitySession(row, new Set()),
    );
    const q4Ids = resolveQ4CohortSessionIds(preliminary);
    const sessions = inputs.map((row) =>
      evaluateHvMeasurementQualitySession(row, q4Ids),
    );

    const validationGatePassCount = sessions.filter((s) => s.m3GateEligible).length;
    const validMeasurementCount = sessions.filter(
      (s) => s.qualityLevel !== 'Q1',
    ).length;

    const reference = await this.prisma.vehicleBatteryReferenceCapacity.findFirst({
      where: { organizationId, vehicleId, isActive: true },
      orderBy: { effectiveFrom: 'desc' },
    });

    const referenceConfidence = resolveReferenceConfidence(reference);
    const capacityConfidence = resolveCapacityConfidence(sessions, q4Ids.size > 0);

    const crossSession =
      validationGatePassCount >= 1
        ? {
            estimatedUsableCapacityKwh: median(
              sessions
                .filter((s) => s.m3EstimatedCapacityKwh != null)
                .map((s) => s.m3EstimatedCapacityKwh as number),
            ),
            sessionCount: validationGatePassCount,
            shadowGatePassed: q4Ids.size > 0,
            computedAt: new Date().toISOString(),
            capabilityVersion: 1,
            modelVersion: 1,
            confidence: q4Ids.size > 0 ? 'HIGH' : 'INSUFFICIENT',
            idempotencyKey: `hv-measurement-quality-mvp:${vehicleId}:${validationGatePassCount}`,
            gateReasonCodes: q4Ids.size > 0 ? [] : ['INSUFFICIENT_QUALIFIED_SESSIONS'],
            methodAgreement: {
              sessionsWithM3Conflict: 0,
            },
          }
        : null;

    const sohGate = computeHvSohGateAssessment({
      crossSession,
      reference: reference
        ? {
            id: reference.id,
            capacityKwh: reference.capacityKwh,
            capacityType: reference.capacityType,
            verificationStatus: reference.verificationStatus,
          }
        : null,
      context: {
        vehicleId,
        modelVersion: 1,
        sohPublicationEnabled: isBatteryV2HvSohPublicationEnabled(),
        currentCapabilityVersion: 1,
        now: new Date(),
      },
    });

    const sohPublicationReadiness =
      sohGate.publicationEligible && isBatteryV2HvSohPublicationEnabled()
        ? HV_MEASUREMENT_SOH_PUBLICATION_READINESS.INTERNAL_ONLY
        : HV_MEASUREMENT_SOH_PUBLICATION_READINESS.BLOCKED;

    const vehicleQualityLevel = resolveVehicleQualityLevel(sessions);
    const vehicleScore =
      sessions.length > 0
        ? Math.round(
            sessions.reduce((sum, s) => sum + s.qualityScore, 0) / sessions.length,
          )
        : 0;

    return {
      schemaVersion: 'hv-measurement-quality-mvp-v1',
      vehicleId,
      organizationId,
      evaluatedAt: new Date().toISOString(),
      validMeasurementCount,
      validationGatePassCount,
      recommendedAdditionalMeasurements: recommendedAdditionalMeasurements(
        validationGatePassCount,
      ),
      vehicleQualityLevel,
      qualityScore: vehicleScore,
      capacityConfidence,
      referenceConfidence,
      sohPublicationReadiness,
      sohGateReasonCodes: sohGate.gateReasonCodes,
      sohPercentPublicDisplayAllowed: false,
      recommendedSocChargeWindows: evaluateResearchSocWindowCoverage(sessions),
      exclusionSummary: buildExclusionSummary(sessions),
      sessions,
    };
  }
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function resolveReferenceConfidence(
  reference: {
    verificationStatus: ReferenceCapacityVerificationStatus;
    capacityType: string;
  } | null,
): (typeof HV_MEASUREMENT_REFERENCE_CONFIDENCE)[keyof typeof HV_MEASUREMENT_REFERENCE_CONFIDENCE] {
  if (!reference) return HV_MEASUREMENT_REFERENCE_CONFIDENCE.NONE;
  if (!isAssessmentCompatibleCapacityType(reference.capacityType)) {
    return HV_MEASUREMENT_REFERENCE_CONFIDENCE.INCOMPATIBLE;
  }
  if (reference.verificationStatus === ReferenceCapacityVerificationStatus.VERIFIED) {
    return HV_MEASUREMENT_REFERENCE_CONFIDENCE.VERIFIED;
  }
  return HV_MEASUREMENT_REFERENCE_CONFIDENCE.UNVERIFIED;
}

function resolveCapacityConfidence(
  sessions: { qualityLevel: string; m3GateEligible: boolean }[],
  q4Cohort: boolean,
): (typeof HV_MEASUREMENT_CAPACITY_CONFIDENCE)[keyof typeof HV_MEASUREMENT_CAPACITY_CONFIDENCE] {
  const pass = sessions.filter((s) => s.m3GateEligible).length;
  if (pass === 0) return HV_MEASUREMENT_CAPACITY_CONFIDENCE.NOT_ESTIMABLE;
  if (q4Cohort) return HV_MEASUREMENT_CAPACITY_CONFIDENCE.CONSISTENT_MULTI_SESSION;
  if (pass >= 1) return HV_MEASUREMENT_CAPACITY_CONFIDENCE.PROVISIONAL;
  return HV_MEASUREMENT_CAPACITY_CONFIDENCE.INSUFFICIENT;
}

function buildExclusionSummary(
  sessions: { qualityLevel: string; exclusionReasons: string[] }[],
): string[] {
  const counts = new Map<string, number>();
  for (const s of sessions) {
    for (const code of s.exclusionReasons) {
      counts.set(code, (counts.get(code) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([code, n]) => `${code}:${n}`);
}
