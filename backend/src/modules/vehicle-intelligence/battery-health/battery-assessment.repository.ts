import { Injectable } from '@nestjs/common';
import {
  BatteryAssessment,
  BatteryAssessmentMaturity,
  BatteryAssessmentType,
  BatteryEvidenceScope,
  BatteryEvidenceStrength,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import type { LvEstimatedHealthAssessment } from './lv-assessment/lv-estimated-health-assessment.policy';
import type { HvCrossSessionAssessment } from './hv-capacity-shadow/hv-capacity-cross-session.types';
import type { HvSohGateAssessment } from './hv-capacity-shadow/hv-soh-gate.types';

export interface PersistLvEstimatedHealthAssessmentInput {
  organizationId: string;
  vehicleId: string;
  assessment: LvEstimatedHealthAssessment;
}

export interface PersistHvCapacityShadowAssessmentInput {
  organizationId: string;
  vehicleId: string;
  assessment: HvCrossSessionAssessment;
}

export interface PersistHvSohGateAssessmentInput {
  organizationId: string;
  vehicleId: string;
  assessment: HvSohGateAssessment;
}

function mapConfidenceToMaturity(
  confidence: LvEstimatedHealthAssessment['confidence'],
  hasScore: boolean,
): BatteryAssessmentMaturity {
  if (!hasScore) {
    return BatteryAssessmentMaturity.INSUFFICIENT_DATA;
  }
  switch (confidence) {
    case 'HIGH':
      return BatteryAssessmentMaturity.HIGH;
    case 'MEDIUM':
      return BatteryAssessmentMaturity.MEDIUM;
    case 'LOW':
      return BatteryAssessmentMaturity.LOW;
    default:
      return BatteryAssessmentMaturity.INSUFFICIENT_DATA;
  }
}

@Injectable()
export class BatteryAssessmentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findLatestLvEstimatedHealth(input: {
    organizationId: string;
    vehicleId: string;
  }): Promise<BatteryAssessment | null> {
    return this.prisma.batteryAssessment.findFirst({
      where: {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        scope: BatteryEvidenceScope.LV,
        type: BatteryAssessmentType.LV_ESTIMATED_HEALTH,
        supersededById: null,
      },
      orderBy: { computedAt: 'desc' },
    });
  }

  async findLatestHvCapacityShadow(input: {
    organizationId: string;
    vehicleId: string;
  }): Promise<BatteryAssessment | null> {
    return this.prisma.batteryAssessment.findFirst({
      where: {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        scope: BatteryEvidenceScope.HV,
        type: BatteryAssessmentType.HV_CAPACITY_SHADOW,
        supersededById: null,
      },
      orderBy: { computedAt: 'desc' },
    });
  }

  async findLatestHvSohGateAssessment(input: {
    organizationId: string;
    vehicleId: string;
  }): Promise<BatteryAssessment | null> {
    return this.prisma.batteryAssessment.findFirst({
      where: {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        scope: BatteryEvidenceScope.HV,
        type: BatteryAssessmentType.HV_SOH_CAPACITY_ESTIMATE,
        supersededById: null,
      },
      orderBy: { computedAt: 'desc' },
    });
  }

  assessmentToEstimatedHealthModel(
    row: BatteryAssessment,
  ): LvEstimatedHealthAssessment | null {
    const summary =
      row.inputSummary && typeof row.inputSummary === 'object'
        ? (row.inputSummary as Record<string, unknown>)
        : null;
    if (!summary) return null;

    const measurementCoverage =
      summary.measurementCoverage &&
      typeof summary.measurementCoverage === 'object'
        ? (summary.measurementCoverage as LvEstimatedHealthAssessment['measurementCoverage'])
        : {
            selectedCount: 0,
            rejectedCount: 0,
            restMeasurementCount: 0,
            startProxyCount: 0,
            workshopMeasurementCount: 0,
            shadowExperimentalCount: 0,
            weightedInputCount: 0,
            coverageRatio: 0,
          };

    return {
      assessmentType: 'LV_ESTIMATED_HEALTH',
      scoreSemantics: 'ESTIMATED_HEALTH_NOT_SOH',
      assessmentTrack:
        (summary.assessmentTrack as LvEstimatedHealthAssessment['assessmentTrack']) ??
        'TELEMETRY',
      assessmentMode:
        (summary.assessmentMode as LvEstimatedHealthAssessment['assessmentMode']) ??
        'CANONICAL',
      modelVersion: row.modelVersion,
      estimatedHealthScore: row.scoreValue,
      confidence:
        (row.confidence as LvEstimatedHealthAssessment['confidence']) ??
        'INSUFFICIENT',
      confidenceScore:
        typeof summary.confidenceScore === 'number'
          ? summary.confidenceScore
          : 0,
      evidenceStrength: row.evidenceStrength,
      dataQuality:
        (row.dataQuality as LvEstimatedHealthAssessment['dataQuality']) ??
        'UNAVAILABLE',
      measurementCoverage,
      validFrom: row.validFrom?.toISOString() ?? row.computedAt.toISOString(),
      validUntil: row.validUntil?.toISOString() ?? null,
      publicationEligible: summary.publicationEligible === true,
      reasons: Array.isArray(summary.reasons)
        ? (summary.reasons as LvEstimatedHealthAssessment['reasons'])
        : [],
      idempotencyKey: row.idempotencyKey,
      inputSummary: summary,
    };
  }

  async persistLvEstimatedHealth(
    input: PersistLvEstimatedHealthAssessmentInput,
  ): Promise<BatteryAssessment> {
    const { assessment } = input;
    const data: Prisma.BatteryAssessmentUncheckedCreateInput = {
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      scope: BatteryEvidenceScope.LV,
      type: BatteryAssessmentType.LV_ESTIMATED_HEALTH,
      scoreValue: assessment.estimatedHealthScore,
      textValue: assessment.scoreSemantics,
      confidence: assessment.confidence,
      evidenceStrength: assessment.evidenceStrength,
      dataQuality: assessment.dataQuality,
      maturity: mapConfidenceToMaturity(
        assessment.confidence,
        assessment.estimatedHealthScore != null,
      ),
      modelVersion: assessment.modelVersion,
      validFrom: new Date(assessment.validFrom),
      validUntil: assessment.validUntil ? new Date(assessment.validUntil) : null,
      inputSummary: {
        ...assessment.inputSummary,
        assessmentTrack: assessment.assessmentTrack,
        assessmentMode: assessment.assessmentMode,
        confidenceScore: assessment.confidenceScore,
        measurementCoverage: { ...assessment.measurementCoverage },
        publicationEligible: assessment.publicationEligible,
        reasons: assessment.reasons.map((row) => ({ ...row })),
        policyVersion: assessment.inputSummary.policyProfile,
      } as Prisma.InputJsonValue,
      idempotencyKey: assessment.idempotencyKey,
      computedAt: new Date(),
    };

    try {
      return await this.prisma.batteryAssessment.create({ data });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return this.prisma.batteryAssessment.findUniqueOrThrow({
          where: {
            vehicleId_idempotencyKey: {
              vehicleId: input.vehicleId,
              idempotencyKey: assessment.idempotencyKey,
            },
          },
        });
      }
      throw error;
    }
  }

  async persistHvCapacityShadow(
    input: PersistHvCapacityShadowAssessmentInput,
  ): Promise<BatteryAssessment> {
    const { assessment } = input;
    const hasScore = assessment.estimatedUsableCapacityKwh != null;

    const data: Prisma.BatteryAssessmentUncheckedCreateInput = {
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      scope: BatteryEvidenceScope.HV,
      type: BatteryAssessmentType.HV_CAPACITY_SHADOW,
      scoreValue: assessment.estimatedUsableCapacityKwh,
      textValue: assessment.scoreSemantics,
      confidence: assessment.confidence,
      evidenceStrength: BatteryEvidenceStrength.SUPPLEMENTARY,
      dataQuality: assessment.shadowGatePassed ? 'SHADOW' : 'INSUFFICIENT_COVERAGE',
      maturity: hasScore
        ? BatteryAssessmentMaturity.LOW
        : BatteryAssessmentMaturity.INSUFFICIENT_DATA,
      modelVersion: assessment.modelVersion,
      validFrom: new Date(assessment.computedAt),
      validUntil: null,
      inputSummary: {
        ...assessment.inputSummary,
        assessmentMode: assessment.assessmentMode,
        maturity: assessment.maturity,
        confidence: assessment.confidence,
        method: assessment.method,
        sessionCount: assessment.sessionCount,
        observationCount: assessment.observationCount,
        crossSessionMedianKwh: assessment.crossSessionMedianKwh,
        spread: assessment.spread,
        methodAgreement: assessment.methodAgreement,
        gateReasonCodes: assessment.gateReasonCodes,
        shadowGatePassed: assessment.shadowGatePassed,
        publicationEligible: false,
        sohEligible: false,
        reasons: assessment.reasons,
        sessionIds: assessment.sessionIds,
      } as unknown as Prisma.InputJsonValue,
      idempotencyKey: assessment.idempotencyKey,
      computedAt: new Date(assessment.computedAt),
    };

    try {
      return await this.prisma.batteryAssessment.create({ data });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return this.prisma.batteryAssessment.findUniqueOrThrow({
          where: {
            vehicleId_idempotencyKey: {
              vehicleId: input.vehicleId,
              idempotencyKey: assessment.idempotencyKey,
            },
          },
        });
      }
      throw error;
    }
  }

  async persistHvSohGateAssessment(
    input: PersistHvSohGateAssessmentInput,
  ): Promise<BatteryAssessment> {
    const { assessment } = input;
    const hasScore = assessment.estimatedSohPercent != null;

    const data: Prisma.BatteryAssessmentUncheckedCreateInput = {
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      scope: BatteryEvidenceScope.HV,
      type: BatteryAssessmentType.HV_SOH_CAPACITY_ESTIMATE,
      scoreValue: assessment.estimatedSohPercent,
      textValue: assessment.scoreSemantics,
      confidence: assessment.confidence,
      evidenceStrength: BatteryEvidenceStrength.SUPPLEMENTARY,
      dataQuality: assessment.sohGatePassed ? 'SHADOW' : 'INSUFFICIENT_COVERAGE',
      maturity: hasScore
        ? assessment.maturity === 'PROVISIONAL'
          ? BatteryAssessmentMaturity.MEDIUM
          : BatteryAssessmentMaturity.LOW
        : BatteryAssessmentMaturity.INSUFFICIENT_DATA,
      modelVersion: assessment.modelVersion,
      validFrom: new Date(assessment.computedAt),
      validUntil: null,
      inputSummary: {
        ...assessment.inputSummary,
        assessmentMode: assessment.assessmentMode,
        maturity: assessment.maturity,
        sohAvailability: assessment.sohAvailability,
        confidence: assessment.confidence,
        estimatedSohPercent: assessment.estimatedSohPercent,
        estimatedUsableCapacityKwh: assessment.estimatedUsableCapacityKwh,
        verifiedReferenceCapacityKwh: assessment.verifiedReferenceCapacityKwh,
        referenceCapacityId: assessment.referenceCapacityId,
        referenceVerificationStatus: assessment.referenceVerificationStatus,
        referenceCapacityType: assessment.referenceCapacityType,
        sessionCount: assessment.sessionCount,
        crossSessionAssessmentIdempotencyKey:
          assessment.crossSessionAssessmentIdempotencyKey,
        capabilityVersion: assessment.capabilityVersion,
        gateReasonCodes: assessment.gateReasonCodes,
        sohGatePassed: assessment.sohGatePassed,
        publicationEligible: false,
        sohPublicationEnabled: assessment.sohPublicationEnabled,
        reasons: assessment.reasons,
      } as unknown as Prisma.InputJsonValue,
      idempotencyKey: assessment.idempotencyKey,
      computedAt: new Date(assessment.computedAt),
    };

    try {
      return await this.prisma.batteryAssessment.create({ data });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return this.prisma.batteryAssessment.findUniqueOrThrow({
          where: {
            vehicleId_idempotencyKey: {
              vehicleId: input.vehicleId,
              idempotencyKey: assessment.idempotencyKey,
            },
          },
        });
      }
      throw error;
    }
  }
}
