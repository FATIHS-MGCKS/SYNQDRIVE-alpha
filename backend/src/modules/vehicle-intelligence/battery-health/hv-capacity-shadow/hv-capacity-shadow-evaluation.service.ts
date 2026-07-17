import { Injectable, NotFoundException } from '@nestjs/common';
import { isBatteryV2HvSohPublicationEnabled } from '@config/battery-health-v2.config';
import { PrismaService } from '@shared/database/prisma.service';
import { HV_M2_CAPACITY_METHOD } from './hv-capacity-m2.types';
import { BatteryAssessmentRepository } from '../battery-assessment.repository';
import { HvMethodProfileService } from '../hv-method-profile/hv-method-profile.service';
import {
  buildPublicationBlockers,
  defaultModelVersions,
  mapChargeSessionRow,
  mapCrossSessionAssessmentRow,
  mapReferenceCapacityRow,
  mapSohGateAssessmentRow,
  resolveEvaluationFreshness,
} from './hv-capacity-shadow-evaluation.mapper';
import {
  HV_CAPACITY_SHADOW_EVALUATION_DISCLAIMER,
  type HvCapacityShadowEvaluationDto,
} from './hv-capacity-shadow-evaluation.types';

@Injectable()
export class HvCapacityShadowEvaluationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly assessments: BatteryAssessmentRepository,
    private readonly methodProfile: HvMethodProfileService,
  ) {}

  async getEvaluation(input: {
    organizationId: string;
    vehicleId: string;
    now?: Date;
  }): Promise<HvCapacityShadowEvaluationDto> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: {
        id: input.vehicleId,
        organizationId: input.organizationId,
      },
      select: { id: true, organizationId: true },
    });

    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    const now = input.now ?? new Date();

    const [
      capabilityProfile,
      referenceCapacity,
      crossSessionRow,
      sohGateRow,
      sessions,
    ] = await Promise.all([
      this.methodProfile.resolveForVehicle({
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        now,
      }),
      this.prisma.vehicleBatteryReferenceCapacity.findFirst({
        where: {
          organizationId: input.organizationId,
          vehicleId: input.vehicleId,
          isActive: true,
        },
        orderBy: { effectiveFrom: 'desc' },
        select: {
          id: true,
          capacityKwh: true,
          capacityType: true,
          source: true,
          verificationStatus: true,
          verifiedAt: true,
          isActive: true,
        },
      }),
      this.assessments.findLatestHvCapacityShadow({
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
      }),
      this.assessments.findLatestHvSohGateAssessment({
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
      }),
      this.prisma.hvChargeSession.findMany({
        where: {
          organizationId: input.organizationId,
          vehicleId: input.vehicleId,
        },
        orderBy: { endAt: 'desc' },
        take: 32,
      }),
    ]);

    const sessionIds = sessions.map((session) => session.id);
    const m2Observations =
      sessionIds.length === 0
        ? []
        : await this.prisma.hvCapacityObservation.findMany({
            where: {
              organizationId: input.organizationId,
              vehicleId: input.vehicleId,
              chargeSessionId: { in: sessionIds },
              method: HV_M2_CAPACITY_METHOD,
            },
            orderBy: { observedAt: 'asc' },
          });

    const observationsBySession = new Map<string, typeof m2Observations>();
    for (const observation of m2Observations) {
      if (!observation.chargeSessionId) continue;
      const bucket = observationsBySession.get(observation.chargeSessionId) ?? [];
      bucket.push(observation);
      observationsBySession.set(observation.chargeSessionId, bucket);
    }

    const crossSessionAssessment = mapCrossSessionAssessmentRow(crossSessionRow);
    const sohGate = mapSohGateAssessmentRow(sohGateRow);
    const sohPublicationEnabled = isBatteryV2HvSohPublicationEnabled();
    const freshnessMeta = resolveEvaluationFreshness({
      now,
      crossSessionComputedAt: crossSessionAssessment?.computedAt ?? null,
      sohGateComputedAt: sohGate?.computedAt ?? null,
    });

    return {
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      disclaimer: HV_CAPACITY_SHADOW_EVALUATION_DISCLAIMER,
      capabilityProfile,
      modelVersions: {
        ...defaultModelVersions(),
        crossSessionAssessment:
          crossSessionAssessment?.modelVersion ??
          defaultModelVersions().crossSessionAssessment,
        sohGate: sohGate?.modelVersion ?? defaultModelVersions().sohGate,
      },
      freshness: {
        generatedAt: now.toISOString(),
        crossSessionComputedAt: crossSessionAssessment?.computedAt ?? null,
        sohGateComputedAt: sohGate?.computedAt ?? null,
        crossSessionFresh: freshnessMeta.crossSessionFresh,
        sohGateFresh: freshnessMeta.sohGateFresh,
        freshnessWindowMs: freshnessMeta.freshnessWindowMs,
      },
      referenceCapacity: mapReferenceCapacityRow(referenceCapacity),
      rechargeSessions: sessions.map((session) =>
        mapChargeSessionRow({
          session,
          m2Observations: observationsBySession.get(session.id) ?? [],
        }),
      ),
      crossSessionAssessment,
      sohGate,
      publicationBlockers: buildPublicationBlockers({
        crossSession: crossSessionAssessment,
        sohGate,
        sohPublicationEnabled,
      }),
      publicationEligible: false,
      readinessEffect: false,
    };
  }
}
