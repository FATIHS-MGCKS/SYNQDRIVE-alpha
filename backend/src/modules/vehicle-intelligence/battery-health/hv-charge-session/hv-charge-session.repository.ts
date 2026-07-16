import { Injectable } from '@nestjs/common';
import type { HvChargeSession, Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import type { HvChargeSessionDraft, HvChargeSessionRow } from './hv-charge-session.types';

const SESSION_SELECT = {
  id: true,
  organizationId: true,
  vehicleId: true,
  segmentFingerprint: true,
  dimoSegmentId: true,
  source: true,
  startAt: true,
  endAt: true,
  startSocPercent: true,
  endSocPercent: true,
  startEnergyKwh: true,
  endEnergyKwh: true,
  energyAddedKwh: true,
  deltaSocPercent: true,
  isOngoing: true,
  quality: true,
  idempotencyKey: true,
  providerObservedAt: true,
  metadata: true,
} as const;

@Injectable()
export class HvChargeSessionRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByFingerprint(
    vehicleId: string,
    segmentFingerprint: string,
  ): Promise<HvChargeSessionRow | null> {
    return this.prisma.hvChargeSession.findUnique({
      where: {
        vehicleId_segmentFingerprint: { vehicleId, segmentFingerprint },
      },
      select: SESSION_SELECT,
    });
  }

  async create(draft: HvChargeSessionDraft): Promise<HvChargeSession> {
    return this.prisma.hvChargeSession.create({
      data: {
        organizationId: draft.organizationId,
        vehicleId: draft.vehicleId,
        segmentFingerprint: draft.segmentFingerprint,
        dimoSegmentId: draft.dimoSegmentId,
        source: draft.source,
        startAt: draft.startAt,
        endAt: draft.endAt,
        startSocPercent: draft.startSocPercent,
        endSocPercent: draft.endSocPercent,
        startEnergyKwh: draft.startEnergyKwh,
        endEnergyKwh: draft.endEnergyKwh,
        energyAddedKwh: draft.energyAddedKwh,
        deltaSocPercent: draft.deltaSocPercent,
        isOngoing: draft.isOngoing,
        quality: draft.quality,
        idempotencyKey: draft.idempotencyKey,
        providerObservedAt: draft.providerObservedAt,
        metadata: draft.metadata as unknown as Prisma.InputJsonValue,
      },
    });
  }

  async update(
    id: string,
    data: Prisma.HvChargeSessionUpdateInput,
  ): Promise<HvChargeSession> {
    return this.prisma.hvChargeSession.update({
      where: { id },
      data,
    });
  }

  findById(id: string): Promise<HvChargeSession | null> {
    return this.prisma.hvChargeSession.findUnique({ where: { id } });
  }
}
