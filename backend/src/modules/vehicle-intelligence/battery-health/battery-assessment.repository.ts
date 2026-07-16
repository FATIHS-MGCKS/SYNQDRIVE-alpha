import { Injectable } from '@nestjs/common';
import {
  BatteryAssessment,
  BatteryAssessmentMaturity,
  BatteryAssessmentType,
  BatteryEvidenceScope,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import type { LvEstimatedHealthAssessment } from './lv-assessment/lv-estimated-health-assessment.policy';

export interface PersistLvEstimatedHealthAssessmentInput {
  organizationId: string;
  vehicleId: string;
  assessment: LvEstimatedHealthAssessment;
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
}
