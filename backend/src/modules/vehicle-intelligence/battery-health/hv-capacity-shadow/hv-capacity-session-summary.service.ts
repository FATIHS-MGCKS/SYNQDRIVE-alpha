import { Injectable } from '@nestjs/common';
import type { HvCapacityObservation, Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import type { HvChargeSessionMetadata } from '../hv-charge-session/hv-charge-session.types';
import { aggregateHvCapacitySessionSummary } from './hv-capacity-session-summary.aggregator';
import {
  HV_M2_CAPACITY_METHOD,
  type HvCapacityObservationMetadata,
} from './hv-capacity-m2.types';
import type {
  HvCapacitySessionSummary,
  HvCapacitySessionSummaryInputObservation,
} from './hv-capacity-session-summary.types';

@Injectable()
export class HvCapacitySessionSummaryService {
  constructor(private readonly prisma: PrismaService) {}

  async summarizeSession(input: {
    organizationId: string;
    vehicleId: string;
    chargeSessionId: string;
    observationsOverride?: HvCapacitySessionSummaryInputObservation[];
  }): Promise<HvCapacitySessionSummary | null> {
    const session = await this.prisma.hvChargeSession.findFirst({
      where: {
        id: input.chargeSessionId,
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
      },
    });
    if (!session) return null;

    const metadata = (session.metadata ?? {}) as unknown as HvChargeSessionMetadata;
    const observations =
      input.observationsOverride ??
      (await this.loadSessionObservations(input.chargeSessionId));

    const summary = aggregateHvCapacitySessionSummary({
      method: HV_M2_CAPACITY_METHOD,
      observations,
      session: {
        sessionStartAt: session.startAt,
        sessionEndAt: session.endAt,
        isOngoing: session.isOngoing,
        capacityShadowEligible: metadata.capacityShadowEligible === true,
        qualityStatus: metadata.qualityStatus ?? null,
      },
    });

    await this.persistSummary(session.id, metadata, summary);
    return summary;
  }

  private async loadSessionObservations(
    chargeSessionId: string,
  ): Promise<HvCapacitySessionSummaryInputObservation[]> {
    const rows = await this.prisma.hvCapacityObservation.findMany({
      where: {
        chargeSessionId,
        method: HV_M2_CAPACITY_METHOD,
      },
      orderBy: { observedAt: 'asc' },
    });

    return rows
      .map((row) => this.toSummaryObservation(row))
      .filter((row): row is HvCapacitySessionSummaryInputObservation => row != null);
  }

  private toSummaryObservation(
    row: HvCapacityObservation,
  ): HvCapacitySessionSummaryInputObservation | null {
    if (row.estimatedCapacityKwh == null) return null;
    const meta = (row.metadata ?? {}) as unknown as HvCapacityObservationMetadata;

    return {
      observedAt: row.observedAt,
      estimatedCapacityKwh: row.estimatedCapacityKwh,
      socPercent: meta.socPercent,
      preferredSocBand: meta.preferredSocBand === true,
      outlier: meta.outlier === true,
      quality: row.quality,
    };
  }

  private async persistSummary(
    sessionId: string,
    metadata: HvChargeSessionMetadata,
    summary: HvCapacitySessionSummary,
  ): Promise<void> {
    const nextMetadata: HvChargeSessionMetadata = {
      ...metadata,
      m2CapacitySummary: summary,
    };

    await this.prisma.hvChargeSession.update({
      where: { id: sessionId },
      data: {
        metadata: nextMetadata as unknown as Prisma.InputJsonValue,
      },
    });
  }
}
