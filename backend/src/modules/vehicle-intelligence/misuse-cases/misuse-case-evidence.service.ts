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
import { MISUSE_CASE_LIFECYCLE_VERSION } from './misuse-case-lifecycle/misuse-case-lifecycle.config';
import { buildMisuseCaseInputFingerprint } from './misuse-case-lifecycle/misuse-case-lifecycle.fingerprint';
import { applyTelemetryLifecycle } from './misuse-case-lifecycle/misuse-case-lifecycle.transition';
import type { TripEvidenceLevel } from '../trips/trip-evidence-level.types';
import type { MisuseCaseLifecycleSnapshot } from './misuse-case-lifecycle/misuse-case-lifecycle.types';

export type MisuseCaseUpsertContext = {
  tripEndTime: Date | null;
  behaviorEventCount: number;
  drivingEventCount: number;
  contextAnchorCount: number;
  dimoSafetyEventCount: number;
  dtcEventCount: number;
  analysisRunId?: string | null;
};

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
    upsertContext: MisuseCaseUpsertContext,
  ): Promise<void> {
    const fingerprint = buildCaseFingerprint(organizationId, tripId, candidate.type);
    const inputFingerprint = buildMisuseCaseInputFingerprint({
      organizationId,
      tripId,
      vehicleId,
      caseType: candidate.type,
      tripEndTimeIso: upsertContext.tripEndTime?.toISOString() ?? null,
      behaviorEventCount: upsertContext.behaviorEventCount,
      drivingEventCount: upsertContext.drivingEventCount,
      contextAnchorCount: upsertContext.contextAnchorCount,
      dimoSafetyEventCount: upsertContext.dimoSafetyEventCount,
      dtcEventCount: upsertContext.dtcEventCount,
      modelVersion: MISUSE_CASE_LIFECYCLE_VERSION,
    });

    const existing = await this.prisma.misuseCase.findUnique({
      where: { fingerprint },
    });

    const evidenceSummary = {
      eventTypes: [...new Set(candidate.evidence.map((e) => e.eventType))],
      sources: [...new Set(candidate.evidence.map((e) => e.sourceType))],
      ...(candidate.evidenceSummary ?? {}),
    };

    const evidenceCase = (evidenceSummary as Record<string, unknown>).evidenceCase as
      | { title?: string; explanation?: string; evidenceLevel?: TripEvidenceLevel }
      | undefined;
    const displayTitle = evidenceCase?.title ?? candidate.title;
    const displayDescription = evidenceCase?.explanation ?? candidate.description;
    const evidenceLevel = evidenceCase?.evidenceLevel ?? 'CHECK_RECOMMENDED';

    const existingSnapshot: MisuseCaseLifecycleSnapshot | null = existing
      ? {
          status: existing.status,
          modelVersion: existing.modelVersion,
          inputFingerprint: existing.inputFingerprint,
          analysisRunId: existing.analysisRunId,
          evidenceCount: existing.evidenceCount,
          attributionConfidence: existing.attributionConfidence,
          decisionEligibility: existing.decisionEligibility,
          informationalOnly: existing.informationalOnly,
          resolvedAt: existing.resolvedAt,
          resolutionReason: existing.resolutionReason,
        }
      : null;

    const projectedEvidenceCount = existing
      ? existing.evidenceCount + candidate.evidence.length
      : candidate.evidence.length;

    const lifecycle = applyTelemetryLifecycle({
      caseType: candidate.type,
      evidenceLevel,
      eventCount: candidate.eventCount,
      evidenceCount: projectedEvidenceCount,
      attributionScope: attribution.attributionScope,
      assignmentStatus: attribution.assignmentStatusSnapshot,
      isPrivateTrip: attribution.isPrivateTripSnapshot,
      inputFingerprint,
      modelVersion: MISUSE_CASE_LIFECYCLE_VERSION,
      analysisRunId: upsertContext.analysisRunId ?? null,
      existing: existingSnapshot,
    });

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
          title: displayTitle,
          description: displayDescription,
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
          informationalOnly: lifecycle.informationalOnly,
          status: lifecycle.status,
          modelVersion: MISUSE_CASE_LIFECYCLE_VERSION,
          inputFingerprint,
          analysisRunId: upsertContext.analysisRunId ?? null,
          evidenceCount: 0,
          attributionConfidence: lifecycle.attributionConfidence,
          decisionEligibility: lifecycle.decisionEligibility,
          resolvedAt: lifecycle.resolvedAt,
          resolutionReason: lifecycle.resolutionReason,
        },
      });
      const evidenceCount = await this.evidenceService.attachEvidence(
        created.id,
        organizationId,
        vehicleId,
        tripId,
        attribution.bookingId,
        attribution.customerId,
        candidate.evidence,
      );
      if (evidenceCount > 0) {
        await this.prisma.misuseCase.update({
          where: { id: created.id },
          data: { evidenceCount },
        });
      }
      return;
    }

    const evidenceCount = await this.evidenceService.attachEvidence(
      existing.id,
      organizationId,
      vehicleId,
      tripId,
      attribution.bookingId,
      attribution.customerId,
      candidate.evidence,
    );

    await this.prisma.misuseCase.update({
      where: { id: existing.id },
      data: {
        severity: maxSeverity(existing.severity, candidate.severity),
        confidence: maxConfidence(existing.confidence, candidate.confidence),
        lastDetectedAt:
          candidate.lastDetectedAt > existing.lastDetectedAt
            ? candidate.lastDetectedAt
            : existing.lastDetectedAt,
        eventCount: candidate.eventCount,
        evidenceSummary: evidenceSummary as Prisma.InputJsonValue,
        description: displayDescription,
        recommendedAction: candidate.recommendedAction ?? existing.recommendedAction,
        informationalOnly: lifecycle.informationalOnly,
        status: lifecycle.status,
        modelVersion: MISUSE_CASE_LIFECYCLE_VERSION,
        inputFingerprint,
        analysisRunId: upsertContext.analysisRunId ?? existing.analysisRunId,
        evidenceCount,
        attributionConfidence: lifecycle.attributionConfidence,
        decisionEligibility: lifecycle.decisionEligibility,
        resolvedAt: lifecycle.resolvedAt,
        resolutionReason: lifecycle.resolutionReason,
      },
    });
  }
}
