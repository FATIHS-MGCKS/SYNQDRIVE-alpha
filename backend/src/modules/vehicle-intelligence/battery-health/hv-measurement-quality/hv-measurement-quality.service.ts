import { Injectable } from '@nestjs/common';
import { BatteryMeasurementQuality } from '@prisma/client';
import {
  isBatteryV2HvSohPublicationEnabled,
} from '@config/battery-health-v2.config';
import { PrismaService } from '@shared/database/prisma.service';
import {
  BatteryReferenceCapacityType,
  ReferenceCapacityVerificationStatus,
} from '../battery-v2-domain';
import { isAssessmentCompatibleCapacityType } from '../reference-capacity/vehicle-battery-reference-capacity.policy';
import { RECHARGE_SEGMENTS_SIGNAL_KEY } from '../capability-preflight/battery-capability-signals.registry';
import { BatteryAssessmentRepository } from '../battery-assessment.repository';
import { computeHvSohGateAssessment } from '../hv-capacity-shadow/hv-soh-gate.policy';
import { HV_SOH_GATE_MODEL_VERSION } from '../hv-capacity-shadow/hv-soh-gate.types';
import {
  countExploratoryMeasurements,
  countPolicyValidatedMeasurements,
  computeExploratoryCapacityMedianKwh,
  computeQualifiedCapacityMedianKwh,
  resolveQualityLevelCounts,
  resolveVehicleQualityScore,
} from './hv-measurement-quality.aggregates';
import {
  mapBatteryAssessmentToCrossSessionEvidence,
  mapPersistedCrossSessionToSohGateInput,
} from './hv-measurement-quality.cross-session';
import {
  evaluateHvMeasurementQualitySession,
  evaluateResearchSocWindowCoverage,
  HV_MEASUREMENT_RECOMMENDED_ADDITIONAL_DISCLAIMER,
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly assessments: BatteryAssessmentRepository,
  ) {}

  async getVehicleMeasurementQuality(
    organizationId: string,
    vehicleId: string,
  ): Promise<HvMeasurementQualityVehicleResult> {
    const now = new Date();

    const [rows, reference, crossSessionRow, capabilityVersion] = await Promise.all([
      this.prisma.hvChargeSession.findMany({
        where: { organizationId, vehicleId },
        orderBy: { startAt: 'asc' },
      }),
      this.prisma.vehicleBatteryReferenceCapacity.findFirst({
        where: { organizationId, vehicleId, isActive: true },
        orderBy: { effectiveFrom: 'desc' },
      }),
      this.assessments.findLatestHvCapacityShadow({
        organizationId,
        vehicleId,
      }),
      this.loadCurrentCapabilityVersion(vehicleId),
    ]);

    const persistedCrossSession = mapBatteryAssessmentToCrossSessionEvidence(crossSessionRow);

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
    const q4Ids = resolveQ4CohortSessionIds(preliminary, persistedCrossSession);
    const sessions = inputs.map((row) =>
      evaluateHvMeasurementQualitySession(row, q4Ids),
    );

    const policyValidatedMeasurementCount = countPolicyValidatedMeasurements(sessions);
    const exploratoryMeasurementCount = countExploratoryMeasurements(sessions);

    const referenceConfidence = resolveReferenceConfidence(reference);
    const capacityConfidence = resolveCapacityConfidence(
      persistedCrossSession,
      policyValidatedMeasurementCount,
    );

    const crossSessionForSoh = mapPersistedCrossSessionToSohGateInput(persistedCrossSession);

    const sohGate = computeHvSohGateAssessment({
      crossSession: crossSessionForSoh,
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
        modelVersion: HV_SOH_GATE_MODEL_VERSION,
        sohPublicationEnabled: isBatteryV2HvSohPublicationEnabled(),
        currentCapabilityVersion: capabilityVersion,
        now,
      },
    });

    const sohPublicationReadiness =
      sohGate.publicationEligible && isBatteryV2HvSohPublicationEnabled()
        ? HV_MEASUREMENT_SOH_PUBLICATION_READINESS.INTERNAL_ONLY
        : HV_MEASUREMENT_SOH_PUBLICATION_READINESS.BLOCKED;

    const vehicleQualityLevel = resolveVehicleQualityLevel(sessions);

    return {
      schemaVersion: 'hv-measurement-quality-mvp-v1',
      vehicleId,
      organizationId,
      evaluatedAt: now.toISOString(),
      validMeasurementCount: exploratoryMeasurementCount,
      validMeasurementCountSemantics: 'EXPLORATORY_NON_Q1',
      exploratoryMeasurementCount,
      policyValidatedMeasurementCount,
      validationGatePassCount: policyValidatedMeasurementCount,
      qualifiedCapacityMedianKwh: computeQualifiedCapacityMedianKwh(sessions),
      exploratoryCapacityMedianKwh: computeExploratoryCapacityMedianKwh(sessions),
      persistedCrossSessionSessionCount: persistedCrossSession?.sessionCount ?? 0,
      persistedCrossSessionGatePassed: persistedCrossSession?.shadowGatePassed ?? false,
      recommendedAdditionalMeasurements: recommendedAdditionalMeasurements(
        policyValidatedMeasurementCount,
      ),
      recommendedAdditionalMeasurementsDisclaimer:
        HV_MEASUREMENT_RECOMMENDED_ADDITIONAL_DISCLAIMER,
      vehicleQualityLevel,
      qualityScore: resolveVehicleQualityScore(sessions),
      qualityLevelCounts: resolveQualityLevelCounts(sessions),
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

  private async loadCurrentCapabilityVersion(vehicleId: string): Promise<number> {
    const row = await this.prisma.vehicleBatteryCapability.findUnique({
      where: {
        vehicleId_signalKey: {
          vehicleId,
          signalKey: RECHARGE_SEGMENTS_SIGNAL_KEY,
        },
      },
      select: { capabilityVersion: true },
    });
    return row?.capabilityVersion ?? 1;
  }
}

function resolveReferenceConfidence(
  reference: {
    verificationStatus: ReferenceCapacityVerificationStatus;
    capacityType: BatteryReferenceCapacityType;
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
  persistedCrossSession: { shadowGatePassed: boolean } | null,
  policyValidatedCount: number,
): (typeof HV_MEASUREMENT_CAPACITY_CONFIDENCE)[keyof typeof HV_MEASUREMENT_CAPACITY_CONFIDENCE] {
  if (policyValidatedCount === 0) {
    return HV_MEASUREMENT_CAPACITY_CONFIDENCE.NOT_ESTIMABLE;
  }
  if (persistedCrossSession?.shadowGatePassed) {
    return HV_MEASUREMENT_CAPACITY_CONFIDENCE.CONSISTENT_MULTI_SESSION;
  }
  return HV_MEASUREMENT_CAPACITY_CONFIDENCE.PROVISIONAL;
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
