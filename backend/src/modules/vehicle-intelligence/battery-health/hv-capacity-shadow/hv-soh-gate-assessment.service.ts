import { Injectable, Logger } from '@nestjs/common';
import {
  isBatteryV2HvCapacityShadowEnabled,
  isBatteryV2HvSohPublicationEnabled,
} from '@config/battery-health-v2.config';
import { PrismaService } from '@shared/database/prisma.service';
import {
  BatteryReferenceCapacityType,
  ReferenceCapacityVerificationStatus,
} from '../battery-v2-domain';
import { RECHARGE_SEGMENTS_SIGNAL_KEY } from '../capability-preflight/battery-capability-signals.registry';
import { BatteryAssessmentRepository } from '../battery-assessment.repository';
import type { HvCrossSessionAssessment } from './hv-capacity-cross-session.types';
import { computeHvSohGateAssessment } from './hv-soh-gate.policy';
import {
  HV_SOH_GATE_MODEL_VERSION,
  type HvSohGateAssessmentResult,
  type HvSohGateCrossSessionInput,
  type HvSohGateReferenceInput,
} from './hv-soh-gate.types';

export interface RecomputeHvSohGateAssessmentInput {
  organizationId: string;
  vehicleId: string;
  /** Fresh cross-session assessment from the same pipeline tick. */
  crossSessionAssessment?: HvCrossSessionAssessment | null;
  referenceOverride?: HvSohGateReferenceInput | null;
  crossSessionOverride?: HvSohGateCrossSessionInput | null;
  capabilityVersionOverride?: number;
  now?: Date;
}

@Injectable()
export class HvSohGateAssessmentService {
  private readonly logger = new Logger(HvSohGateAssessmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly assessments: BatteryAssessmentRepository,
  ) {}

  async recomputeForVehicle(
    input: RecomputeHvSohGateAssessmentInput,
  ): Promise<HvSohGateAssessmentResult | null> {
    if (!isBatteryV2HvCapacityShadowEnabled()) {
      return null;
    }

    const reference =
      input.referenceOverride ??
      (await this.loadReference(input.organizationId, input.vehicleId));

    const crossSession =
      input.crossSessionOverride ??
      this.mapCrossSessionAssessment(
        input.crossSessionAssessment ??
          (await this.loadLatestCrossSessionAssessment(
            input.organizationId,
            input.vehicleId,
          )),
      );

    const capabilityVersion =
      input.capabilityVersionOverride ??
      (await this.loadCurrentCapabilityVersion(input.vehicleId));

    const assessment = computeHvSohGateAssessment({
      crossSession,
      reference,
      context: {
        vehicleId: input.vehicleId,
        modelVersion: HV_SOH_GATE_MODEL_VERSION,
        currentCapabilityVersion: capabilityVersion,
        sohPublicationEnabled: isBatteryV2HvSohPublicationEnabled(),
        now: input.now,
      },
    });

    const existing = await this.assessments.findLatestHvSohGateAssessment({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
    });

    if (existing?.idempotencyKey === assessment.idempotencyKey) {
      this.logger.debug(
        `HV SOH gate assessment unchanged vehicle=${input.vehicleId} key=${assessment.idempotencyKey}`,
      );
      return {
        assessment,
        persisted: false,
        assessmentId: existing.id,
      };
    }

    const row = await this.assessments.persistHvSohGateAssessment({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      assessment,
    });

    this.logger.debug(
      `HV SOH gate assessment persisted vehicle=${input.vehicleId} soh=${assessment.estimatedSohPercent?.toFixed(2) ?? 'n/a'} % availability=${assessment.sohAvailability}`,
    );

    return {
      assessment,
      persisted: true,
      assessmentId: row.id,
    };
  }

  private async loadReference(
    organizationId: string,
    vehicleId: string,
  ): Promise<HvSohGateReferenceInput | null> {
    const row = await this.prisma.vehicleBatteryReferenceCapacity.findFirst({
      where: {
        organizationId,
        vehicleId,
        isActive: true,
      },
      orderBy: { effectiveFrom: 'desc' },
      select: {
        id: true,
        capacityKwh: true,
        capacityType: true,
        verificationStatus: true,
      },
    });

    if (!row) return null;

    return {
      id: row.id,
      capacityKwh: row.capacityKwh,
      capacityType: row.capacityType as BatteryReferenceCapacityType,
      verificationStatus:
        row.verificationStatus as ReferenceCapacityVerificationStatus,
    };
  }

  private async loadLatestCrossSessionAssessment(
    organizationId: string,
    vehicleId: string,
  ): Promise<HvCrossSessionAssessment | null> {
    const row = await this.assessments.findLatestHvCapacityShadow({
      organizationId,
      vehicleId,
    });
    if (!row?.inputSummary || typeof row.inputSummary !== 'object') {
      return null;
    }

    const summary = row.inputSummary as Record<string, unknown>;
    return {
      assessmentType: 'HV_CAPACITY_SHADOW',
      scoreSemantics: 'ESTIMATED_USABLE_CAPACITY_NOT_SOH',
      assessmentMode: 'SHADOW',
      method: summary.method as HvCrossSessionAssessment['method'],
      modelVersion: row.modelVersion,
      estimatedUsableCapacityKwh: row.scoreValue,
      sessionCount: typeof summary.sessionCount === 'number' ? summary.sessionCount : 0,
      observationCount:
        typeof summary.observationCount === 'number' ? summary.observationCount : 0,
      crossSessionMedianKwh:
        typeof summary.crossSessionMedianKwh === 'number'
          ? summary.crossSessionMedianKwh
          : null,
      spread: summary.spread as HvCrossSessionAssessment['spread'],
      methodAgreement:
        summary.methodAgreement as HvCrossSessionAssessment['methodAgreement'],
      confidence: row.confidence as HvCrossSessionAssessment['confidence'],
      maturity: 'SHADOW',
      shadowGatePassed: summary.shadowGatePassed === true,
      gateReasonCodes:
        (summary.gateReasonCodes as HvCrossSessionAssessment['gateReasonCodes']) ?? [],
      reasons: (summary.reasons as HvCrossSessionAssessment['reasons']) ?? [],
      publicationEligible: false,
      sohEligible: false,
      sessionIds: (summary.sessionIds as string[]) ?? [],
      referenceCapacityKwh:
        typeof summary.referenceCapacityKwh === 'number'
          ? summary.referenceCapacityKwh
          : null,
      referenceCapacityId:
        typeof summary.referenceCapacityId === 'string'
          ? summary.referenceCapacityId
          : null,
      computedAt: row.computedAt.toISOString(),
      idempotencyKey: row.idempotencyKey,
      inputSummary: summary,
    };
  }

  private mapCrossSessionAssessment(
    assessment: HvCrossSessionAssessment | null,
  ): HvSohGateCrossSessionInput | null {
    if (!assessment) return null;

    const capabilityVersion =
      typeof assessment.inputSummary.capabilityVersion === 'number'
        ? assessment.inputSummary.capabilityVersion
        : null;

    return {
      shadowGatePassed: assessment.shadowGatePassed,
      estimatedUsableCapacityKwh: assessment.estimatedUsableCapacityKwh,
      sessionCount: assessment.sessionCount,
      computedAt: assessment.computedAt,
      gateReasonCodes: assessment.gateReasonCodes,
      methodAgreement: assessment.methodAgreement,
      confidence: assessment.confidence,
      idempotencyKey: assessment.idempotencyKey,
      modelVersion: assessment.modelVersion,
      capabilityVersion,
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
