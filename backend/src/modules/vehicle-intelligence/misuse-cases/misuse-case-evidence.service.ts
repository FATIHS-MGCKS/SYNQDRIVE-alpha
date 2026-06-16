import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import type { CaseCandidate, EvidenceCandidate } from './misuse-case.types';
import {
  buildCaseFingerprint,
  maxConfidence,
  maxSeverity,
  resolveAttribution,
} from './misuse-case.types';

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
  ): Promise<void> {
    if (evidence.length === 0) return;

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

    if (toCreate.length === 0) return;

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
  }
}

@Injectable()
export class MisuseCasePersistenceHelper {
  constructor(
    private readonly prisma: PrismaService,
    private readonly evidenceService: MisuseCaseEvidenceService,
  ) {}

  async upsertCandidate(
    organizationId: string,
    vehicleId: string,
    tripId: string,
    candidate: CaseCandidate,
    attribution: ReturnType<typeof resolveAttribution>,
  ): Promise<void> {
    const fingerprint = buildCaseFingerprint(organizationId, tripId, candidate.type);

    const existing = await this.prisma.misuseCase.findUnique({
      where: { fingerprint },
    });

    const evidenceSummary = {
      eventTypes: [...new Set(candidate.evidence.map((e) => e.eventType))],
      sources: [...new Set(candidate.evidence.map((e) => e.sourceType))],
    };

    if (!existing) {
      const created = await this.prisma.misuseCase.create({
        data: {
          organizationId,
          vehicleId,
          tripId,
          bookingId: attribution.bookingId,
          customerId: attribution.customerId,
          category: candidate.category,
          type: candidate.type,
          severity: candidate.severity,
          confidence: candidate.confidence,
          title: candidate.title,
          description: candidate.description,
          recommendedAction: candidate.recommendedAction ?? null,
          attributionScope: attribution.attributionScope,
          assignmentStatusSnapshot: attribution.assignmentStatusSnapshot,
          assignmentSubjectTypeSnapshot: attribution.assignmentSubjectTypeSnapshot,
          assignmentSubjectIdSnapshot: attribution.assignmentSubjectIdSnapshot,
          assignedBookingIdSnapshot: attribution.assignedBookingIdSnapshot,
          isPrivateTripSnapshot: attribution.isPrivateTripSnapshot,
          firstDetectedAt: candidate.firstDetectedAt,
          lastDetectedAt: candidate.lastDetectedAt,
          eventCount: candidate.eventCount,
          evidenceSummary: evidenceSummary as Prisma.InputJsonValue,
          fingerprint,
          informationalOnly: true,
        },
      });
      await this.evidenceService.attachEvidence(
        created.id,
        organizationId,
        vehicleId,
        tripId,
        attribution.bookingId,
        attribution.customerId,
        candidate.evidence,
      );
      return;
    }

    const updated = await this.prisma.misuseCase.update({
      where: { id: existing.id },
      data: {
        severity: maxSeverity(existing.severity, candidate.severity),
        confidence: maxConfidence(existing.confidence, candidate.confidence),
        lastDetectedAt:
          candidate.lastDetectedAt > existing.lastDetectedAt
            ? candidate.lastDetectedAt
            : existing.lastDetectedAt,
        // Reprocessing replaces the current snapshot — do not accumulate counts.
        eventCount: candidate.eventCount,
        evidenceSummary: evidenceSummary as Prisma.InputJsonValue,
        description: candidate.description,
        recommendedAction: candidate.recommendedAction ?? existing.recommendedAction,
      },
    });

    await this.evidenceService.attachEvidence(
      updated.id,
      organizationId,
      vehicleId,
      tripId,
      attribution.bookingId,
      attribution.customerId,
      candidate.evidence,
    );
  }
}
