import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import type { EvidenceCandidate } from './misuse-case.types';

@Injectable()
export class MisuseCaseEvidenceService {
  constructor(private readonly prisma: PrismaService) {}

  async attachEvidence(
    caseId: string,
    orgId: string,
    vehicleId: string,
    tripId: string | null,
    bookingId: string | null,
    customerId: string | null,
    evidence: EvidenceCandidate[],
  ): Promise<number> {
    if (evidence.length === 0) return 0;

    const existing = await this.prisma.misuseCaseEvidence.findMany({
      where: { caseId },
      select: { sourceType: true, sourceId: true, eventType: true },
    });
    const existingKeys = new Set(
      existing.map((e) => `${e.sourceType}:${e.sourceId ?? ''}:${e.eventType}`),
    );

    const toCreate = evidence.filter((e) => {
      const key = `${e.sourceType}:${e.sourceId ?? ''}:${e.eventType}`;
      return !existingKeys.has(key);
    });

    if (toCreate.length === 0) return existing.length;

    await this.prisma.misuseCaseEvidence.createMany({
      data: toCreate.map((e) => ({
        caseId,
        sourceType: e.sourceType,
        sourceId: e.sourceId ?? null,
        organizationId: orgId,
        vehicleId,
        tripId,
        bookingId,
        customerId,
        eventType: e.eventType,
        severity: e.severity ?? null,
        confidence: e.confidence ?? null,
        occurredAt: e.occurredAt,
        snapshotJson: (e.snapshotJson ?? undefined) as Prisma.InputJsonValue | undefined,
      })),
    });

    return existing.length + toCreate.length;
  }
}
