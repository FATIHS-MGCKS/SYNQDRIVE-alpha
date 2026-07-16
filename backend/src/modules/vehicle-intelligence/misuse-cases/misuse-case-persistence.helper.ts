import { Injectable } from '@nestjs/common';
import { MisuseCaseStatus, Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import type { CaseCandidate } from './misuse-case.types';
import {
  maxConfidence,
  maxSeverity,
  resolveAttribution,
} from './misuse-case.types';
import { applyTelemetryLifecycle } from './misuse-case-lifecycle/misuse-case-lifecycle.transition';
import type { TripEvidenceLevel } from '../trips/trip-evidence-level.types';
import type { MisuseCaseLifecycleSnapshot } from './misuse-case-lifecycle/misuse-case-lifecycle.types';
import {
  buildMisuseCaseFingerprintPair,
  buildMisuseCaseScope,
} from './misuse-case-fingerprint/misuse-case-fingerprint';
import {
  planMisuseCaseReconciliation,
  SUPERSEDE_RESOLUTION_REASON,
} from './misuse-case-fingerprint/misuse-case-fingerprint.reconciliation';
import { MisuseCaseEvidenceService } from './misuse-case-evidence.service';

import type { MisuseCaseUpsertContext } from './misuse-case-upsert.types';

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
    const fingerprints = buildMisuseCaseFingerprintPair({
      organizationId,
      vehicleId,
      scope: buildMisuseCaseScope({
        tripId,
        bookingId: attribution.bookingId,
      }),
      category: candidate.category,
      caseType: candidate.type,
      attributionScope: attribution.attributionScope,
      evidence: candidate.evidence,
    });

    const exactMatch = await this.prisma.misuseCase.findUnique({
      where: { fingerprint: fingerprints.caseFingerprint },
    });

    const priorVersion =
      exactMatch == null
        ? await this.prisma.misuseCase.findFirst({
            where: {
              organizationId,
              inputFingerprint: fingerprints.logicalFingerprint,
              status: { not: MisuseCaseStatus.SUPERSEDED },
              modelVersion: { not: fingerprints.modelVersion },
            },
            orderBy: { createdAt: 'desc' },
          })
        : null;

    const plan = planMisuseCaseReconciliation(exactMatch, priorVersion, fingerprints);

    const evidenceSummary = {
      eventTypes: [...new Set(candidate.evidence.map((e) => e.eventType))],
      sources: [...new Set(candidate.evidence.map((e) => e.sourceType))],
      qualifiedEvidenceKeys: fingerprints.qualifiedEvidenceKeys,
      ...(candidate.evidenceSummary ?? {}),
    };

    const evidenceCase = (evidenceSummary as Record<string, unknown>).evidenceCase as
      | { title?: string; explanation?: string; evidenceLevel?: TripEvidenceLevel }
      | undefined;
    const displayTitle = evidenceCase?.title ?? candidate.title;
    const displayDescription = evidenceCase?.explanation ?? candidate.description;
    const evidenceLevel = evidenceCase?.evidenceLevel ?? 'CHECK_RECOMMENDED';

    const baseLifecycleInput = {
      caseType: candidate.type,
      evidenceLevel,
      eventCount: candidate.eventCount,
      attributionScope: attribution.attributionScope,
      assignmentStatus: attribution.assignmentStatusSnapshot,
      isPrivateTrip: attribution.isPrivateTripSnapshot,
      inputFingerprint: fingerprints.logicalFingerprint,
      modelVersion: fingerprints.modelVersion,
      analysisRunId: upsertContext.analysisRunId ?? null,
    };

    if (plan.action === 'SUPERSEDE') {
      await this.prisma.misuseCase.update({
        where: { id: plan.priorCaseId },
        data: {
          status: MisuseCaseStatus.SUPERSEDED,
          decisionEligibility: 'NOT_ELIGIBLE',
          informationalOnly: true,
          resolvedAt: new Date(),
          resolutionReason: SUPERSEDE_RESOLUTION_REASON,
        },
      });
      await this.createCase(
        organizationId,
        vehicleId,
        tripId,
        candidate,
        attribution,
        upsertContext,
        fingerprints,
        evidenceSummary,
        displayTitle,
        displayDescription,
        baseLifecycleInput,
        plan.priorCaseId,
        0,
      );
      return;
    }

    if (plan.action === 'UPDATE') {
      const existing = exactMatch!;
      const existingSnapshot = this.toLifecycleSnapshot(existing);
      const evidenceCount = await this.evidenceService.attachEvidence(
        existing.id,
        organizationId,
        vehicleId,
        tripId,
        attribution.bookingId,
        attribution.customerId,
        candidate.evidence,
      );

      const lifecycle = applyTelemetryLifecycle({
        ...baseLifecycleInput,
        evidenceCount,
        existing: existingSnapshot,
      });

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
          modelVersion: fingerprints.modelVersion,
          inputFingerprint: fingerprints.logicalFingerprint,
          analysisRunId: upsertContext.analysisRunId ?? existing.analysisRunId,
          evidenceCount,
          attributionConfidence: lifecycle.attributionConfidence,
          decisionEligibility: lifecycle.decisionEligibility,
          resolvedAt: lifecycle.resolvedAt,
          resolutionReason: lifecycle.resolutionReason,
        },
      });
      return;
    }

    await this.createCase(
      organizationId,
      vehicleId,
      tripId,
      candidate,
      attribution,
      upsertContext,
      fingerprints,
      evidenceSummary,
      displayTitle,
      displayDescription,
      baseLifecycleInput,
      plan.priorCaseId,
      candidate.evidence.length,
    );
  }

  private async createCase(
    organizationId: string,
    vehicleId: string,
    tripId: string,
    candidate: CaseCandidate,
    attribution: ReturnType<typeof resolveAttribution>,
    upsertContext: MisuseCaseUpsertContext,
    fingerprints: ReturnType<typeof buildMisuseCaseFingerprintPair>,
    evidenceSummary: Record<string, unknown>,
    displayTitle: string,
    displayDescription: string,
    baseLifecycleInput: {
      caseType: CaseCandidate['type'];
      evidenceLevel: TripEvidenceLevel;
      eventCount: number;
      attributionScope: ReturnType<typeof resolveAttribution>['attributionScope'];
      assignmentStatus: ReturnType<typeof resolveAttribution>['assignmentStatusSnapshot'];
      isPrivateTrip: boolean;
      inputFingerprint: string;
      modelVersion: string;
      analysisRunId: string | null;
    },
    supersedesCaseId: string | null,
    projectedEvidenceCount: number,
  ): Promise<void> {
    const lifecycle = applyTelemetryLifecycle({
      ...baseLifecycleInput,
      evidenceCount: projectedEvidenceCount,
      existing: null,
    });

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
        fingerprint: fingerprints.caseFingerprint,
        informationalOnly: lifecycle.informationalOnly,
        status: lifecycle.status,
        modelVersion: fingerprints.modelVersion,
        inputFingerprint: fingerprints.logicalFingerprint,
        analysisRunId: upsertContext.analysisRunId ?? null,
        evidenceCount: 0,
        attributionConfidence: lifecycle.attributionConfidence,
        decisionEligibility: lifecycle.decisionEligibility,
        supersedesCaseId,
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
  }

  private toLifecycleSnapshot(
    row: Prisma.MisuseCaseGetPayload<object>,
  ): MisuseCaseLifecycleSnapshot {
    return {
      status: row.status,
      modelVersion: row.modelVersion,
      inputFingerprint: row.inputFingerprint,
      analysisRunId: row.analysisRunId,
      evidenceCount: row.evidenceCount,
      attributionConfidence: row.attributionConfidence,
      decisionEligibility: row.decisionEligibility,
      informationalOnly: row.informationalOnly,
      resolvedAt: row.resolvedAt,
      resolutionReason: row.resolutionReason,
    };
  }
}
