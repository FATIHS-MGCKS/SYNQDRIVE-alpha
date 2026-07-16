import { Injectable } from '@nestjs/common';
import { MisuseCaseStatus, Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import type { CaseCandidate } from './misuse-case.types';
import {
  resolveAttribution,
} from './misuse-case.types';
import { applyTelemetryLifecycle, resolveAttributionConfidence } from './misuse-case-lifecycle/misuse-case-lifecycle.transition';
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
import {
  buildRejectedEvidenceAudit,
  recalculateMisuseCaseEvidenceCounts,
} from './misuse-case-evidence-count/misuse-case-evidence-count';
import {
  appendSupersededRatingAudit,
  reconcileMisuseCaseRating,
} from './misuse-case-rating-reconciliation/misuse-case-rating-reconciliation';
import {
  applyCategoryEffectCaps,
  assessCandidateCategoryEvidenceStrength,
} from './misuse-case-category-evidence-strength/misuse-case-category-evidence-strength.gate';
import { buildCategoryEvidenceStrengthSummary } from './misuse-case-category-evidence-strength/misuse-case-category-evidence-strength';

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
    const recalc = recalculateMisuseCaseEvidenceCounts(candidate.evidence);

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
      evidence: recalc.qualifiedEvidence,
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

    const evidenceCaseFromCandidate = (candidate.evidenceSummary as Record<string, unknown> | undefined)
      ?.evidenceCase as
      | { title?: string; explanation?: string; evidenceLevel?: TripEvidenceLevel }
      | undefined;
    const displayTitle = evidenceCaseFromCandidate?.title ?? candidate.title;
    const displayDescription = evidenceCaseFromCandidate?.explanation ?? candidate.description;
    const evidenceLevel = evidenceCaseFromCandidate?.evidenceLevel ?? 'CHECK_RECOMMENDED';

    const attributionConfidence = resolveAttributionConfidence({
      attributionScope: attribution.attributionScope,
      assignmentStatus: attribution.assignmentStatusSnapshot,
      isPrivateTrip: attribution.isPrivateTripSnapshot,
    });

    const rating = reconcileMisuseCaseRating({
      caseType: candidate.type,
      qualifiedEvidence: recalc.qualifiedEvidence,
      evidenceLevel,
      attributionScope: attribution.attributionScope,
      attributionConfidence,
      clusterCount: (candidate.evidenceSummary as { clusterCount?: number } | undefined)?.clusterCount,
      coverageQuality: (candidate.evidenceSummary as { coverageQuality?: 'NONE' | 'SPARSE' | 'GOOD' } | undefined)
        ?.coverageQuality,
      modelVersion: fingerprints.modelVersion,
      existingSeverity: exactMatch?.severity ?? null,
      existingConfidence: exactMatch?.confidence ?? null,
    });

    const categoryAssessment = assessCandidateCategoryEvidenceStrength(candidate, attribution);
    if (!categoryAssessment.passes) {
      return;
    }

    const evidenceSummary = {
      eventTypes: [...new Set(recalc.qualifiedEvidence.map((e) => e.eventType))],
      sources: [...new Set(recalc.qualifiedEvidence.map((e) => e.sourceType))],
      qualifiedEvidenceKeys: fingerprints.qualifiedEvidenceKeys,
      eventCountModelVersion: recalc.modelVersion,
      ratingReconciliationModelVersion: rating.modelVersion,
      ...buildRejectedEvidenceAudit(recalc),
      ...appendSupersededRatingAudit(
        exactMatch?.evidenceSummary as Record<string, unknown> | null | undefined,
        rating,
      ),
      ...buildCategoryEvidenceStrengthSummary(categoryAssessment),
      ...(candidate.evidenceSummary ?? {}),
    };

    const baseLifecycleInput = {
      caseType: candidate.type,
      evidenceLevel,
      eventCount: recalc.eventCount,
      attributionScope: attribution.attributionScope,
      assignmentStatus: attribution.assignmentStatusSnapshot,
      isPrivateTrip: attribution.isPrivateTripSnapshot,
      inputFingerprint: fingerprints.logicalFingerprint,
      modelVersion: fingerprints.modelVersion,
      analysisRunId: upsertContext.analysisRunId ?? null,
      shouldResolve: rating.shouldResolve,
      resolutionReason: rating.resolutionReason,
      proxyOnly: rating.proxyOnly,
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
        recalc,
        rating,
        categoryAssessment,
      );
      return;
    }

    if (plan.action === 'UPDATE') {
      const existing = exactMatch!;
      const existingSnapshot = this.toLifecycleSnapshot(existing);
      await this.evidenceService.attachEvidence(
        existing.id,
        organizationId,
        vehicleId,
        tripId,
        attribution.bookingId,
        attribution.customerId,
        recalc.qualifiedEvidence,
      );

      const lifecycle = applyCategoryEffectCaps(
        applyTelemetryLifecycle({
          ...baseLifecycleInput,
          evidenceCount: recalc.eventCount,
          existing: existingSnapshot,
        }),
        categoryAssessment,
      );

      await this.prisma.misuseCase.update({
        where: { id: existing.id },
        data: {
          severity: rating.severity,
          confidence: rating.confidence,
          lastDetectedAt:
            candidate.lastDetectedAt > existing.lastDetectedAt
              ? candidate.lastDetectedAt
              : existing.lastDetectedAt,
          eventCount: recalc.eventCount,
          evidenceSummary: evidenceSummary as Prisma.InputJsonValue,
          description: displayDescription,
          recommendedAction: candidate.recommendedAction ?? existing.recommendedAction,
          informationalOnly: lifecycle.informationalOnly,
          status: lifecycle.status,
          modelVersion: fingerprints.modelVersion,
          inputFingerprint: fingerprints.logicalFingerprint,
          analysisRunId: upsertContext.analysisRunId ?? existing.analysisRunId,
          evidenceCount: recalc.eventCount,
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
      recalc,
      rating,
      categoryAssessment,
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
      shouldResolve?: boolean;
      resolutionReason?: string | null;
      proxyOnly?: boolean;
    },
    supersedesCaseId: string | null,
    recalc: ReturnType<typeof recalculateMisuseCaseEvidenceCounts>,
    rating: ReturnType<typeof reconcileMisuseCaseRating>,
    categoryAssessment: ReturnType<typeof assessCandidateCategoryEvidenceStrength>,
  ): Promise<void> {
    const lifecycle = applyCategoryEffectCaps(
      applyTelemetryLifecycle({
        ...baseLifecycleInput,
        evidenceCount: recalc.eventCount,
        existing: null,
      }),
      categoryAssessment,
    );

    const created = await this.prisma.misuseCase.create({
      data: {
        organizationId,
        vehicleId,
        tripId,
        bookingId: attribution.bookingId,
        customerId: attribution.customerId,
        category: candidate.category,
        type: candidate.type,
        severity: rating.severity,
        confidence: rating.confidence,
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
        eventCount: recalc.eventCount,
        evidenceSummary: evidenceSummary as Prisma.InputJsonValue,
        fingerprint: fingerprints.caseFingerprint,
        informationalOnly: lifecycle.informationalOnly,
        status: lifecycle.status,
        modelVersion: fingerprints.modelVersion,
        inputFingerprint: fingerprints.logicalFingerprint,
        analysisRunId: upsertContext.analysisRunId ?? null,
        evidenceCount: recalc.eventCount,
        attributionConfidence: lifecycle.attributionConfidence,
        decisionEligibility: lifecycle.decisionEligibility,
        supersedesCaseId,
        resolvedAt: lifecycle.resolvedAt,
        resolutionReason: lifecycle.resolutionReason,
      },
    });

    await this.evidenceService.attachEvidence(
      created.id,
      organizationId,
      vehicleId,
      tripId,
      attribution.bookingId,
      attribution.customerId,
      recalc.qualifiedEvidence,
    );
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
