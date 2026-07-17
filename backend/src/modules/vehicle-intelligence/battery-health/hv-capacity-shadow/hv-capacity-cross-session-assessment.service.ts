import { Injectable, Logger } from '@nestjs/common';
import { isBatteryV2HvCapacityShadowEnabled } from '@config/battery-health-v2.config';
import { PrismaService } from '@shared/database/prisma.service';
import type { HvChargeSessionMetadata } from '../hv-charge-session/hv-charge-session.types';
import { RECHARGE_SEGMENTS_SIGNAL_KEY } from '../capability-preflight/battery-capability-signals.registry';
import { BatteryAssessmentRepository } from '../battery-assessment.repository';
import { computeHvCrossSessionAssessment } from './hv-capacity-cross-session.policy';
import {
  type HvCrossSessionAssessmentResult,
  type HvCrossSessionInputSession,
  type HvCrossSessionVehicleContext,
} from './hv-capacity-cross-session.types';
import { HV_M2_SESSION_SUMMARY_MODEL_VERSION } from './hv-capacity-session-summary.types';

export interface RecomputeHvCrossSessionAssessmentInput {
  organizationId: string;
  vehicleId: string;
  /** Test hook — bypass DB session load. */
  sessionsOverride?: HvCrossSessionInputSession[];
  contextOverride?: Partial<HvCrossSessionVehicleContext>;
}

@Injectable()
export class HvCapacityCrossSessionAssessmentService {
  private readonly logger = new Logger(HvCapacityCrossSessionAssessmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly assessments: BatteryAssessmentRepository,
  ) {}

  async recomputeForVehicle(
    input: RecomputeHvCrossSessionAssessmentInput,
  ): Promise<HvCrossSessionAssessmentResult | null> {
    if (!isBatteryV2HvCapacityShadowEnabled()) {
      return null;
    }

    const reference = await this.prisma.vehicleBatteryReferenceCapacity.findFirst({
      where: {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        isActive: true,
      },
      orderBy: { effectiveFrom: 'desc' },
      select: { id: true, capacityKwh: true },
    });

    const capability = await this.prisma.vehicleBatteryCapability.findUnique({
      where: {
        vehicleId_signalKey: {
          vehicleId: input.vehicleId,
          signalKey: RECHARGE_SEGMENTS_SIGNAL_KEY,
        },
      },
      select: { capabilityVersion: true },
    });

    const sessions =
      input.sessionsOverride ??
      (await this.loadQualifiedSessions(input.organizationId, input.vehicleId));

    const context: HvCrossSessionVehicleContext = {
      vehicleId: input.vehicleId,
      referenceCapacityKwh:
        input.contextOverride?.referenceCapacityKwh ??
        reference?.capacityKwh ??
        null,
      referenceCapacityId:
        input.contextOverride?.referenceCapacityId ?? reference?.id ?? null,
      modelVersion:
        input.contextOverride?.modelVersion ??
        HV_M2_SESSION_SUMMARY_MODEL_VERSION,
      capabilityVersion:
        input.contextOverride?.capabilityVersion ??
        capability?.capabilityVersion ??
        null,
      now: input.contextOverride?.now,
    };

    const assessment = computeHvCrossSessionAssessment({ sessions, context });

    const existing = await this.assessments.findLatestHvCapacityShadow({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
    });

    if (existing?.idempotencyKey === assessment.idempotencyKey) {
      this.logger.debug(
        `HV cross-session assessment unchanged vehicle=${input.vehicleId} key=${assessment.idempotencyKey}`,
      );
      return {
        assessment,
        persisted: false,
        assessmentId: existing.id,
      };
    }

    const row = await this.assessments.persistHvCapacityShadow({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      assessment,
    });

    this.logger.debug(
      `HV cross-session assessment persisted vehicle=${input.vehicleId} capacity=${assessment.estimatedUsableCapacityKwh?.toFixed(2) ?? 'n/a'} kWh sessions=${assessment.sessionCount} confidence=${assessment.confidence}`,
    );

    return {
      assessment,
      persisted: true,
      assessmentId: row.id,
    };
  }

  private async loadQualifiedSessions(
    organizationId: string,
    vehicleId: string,
  ): Promise<HvCrossSessionInputSession[]> {
    const rows = await this.prisma.hvChargeSession.findMany({
      where: {
        organizationId,
        vehicleId,
        isOngoing: false,
        endAt: { not: null },
      },
      orderBy: { endAt: 'desc' },
      take: 32,
      select: {
        id: true,
        endAt: true,
        metadata: true,
      },
    });

    return rows
      .map((row) => this.mapSessionRow(row))
      .filter((row): row is HvCrossSessionInputSession => row != null);
  }

  private mapSessionRow(row: {
    id: string;
    endAt: Date | null;
    metadata: unknown;
  }): HvCrossSessionInputSession | null {
    if (!row.endAt) return null;
    const metadata = (row.metadata ?? {}) as unknown as HvChargeSessionMetadata;
    const summary = metadata.m2CapacitySummary;
    if (!summary) return null;

    return {
      sessionId: row.id,
      sessionEndAt: row.endAt,
      summary,
      m3Validation: metadata.m3Validation ?? null,
    };
  }
}
