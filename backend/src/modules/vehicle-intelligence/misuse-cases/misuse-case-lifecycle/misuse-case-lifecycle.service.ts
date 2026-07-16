import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  MisuseEvidenceSourceType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import type { TripEvidenceLevel } from '../../trips/trip-evidence-level.types';
import { MISUSE_CASE_LIFECYCLE_VERSION } from './misuse-case-lifecycle.config';
import {
  applyManualLifecycleTransition,
  type ManualTransitionAction,
} from './misuse-case-lifecycle.transition';
import type { MisuseCaseLifecycleSnapshot } from './misuse-case-lifecycle.types';

@Injectable()
export class MisuseCaseLifecycleService {
  constructor(private readonly prisma: PrismaService) {}

  async transition(
    orgId: string,
    caseId: string,
    action: ManualTransitionAction,
    opts?: { resolutionReason?: string; operatorNote?: string },
  ) {
    const row = await this.prisma.misuseCase.findFirst({
      where: { id: caseId, organizationId: orgId },
      include: {
        evidence: { select: { sourceType: true } },
      },
    });
    if (!row) throw new NotFoundException('Misuse case not found');

    const evidenceLevel = this.readEvidenceLevel(row.evidenceSummary);
    const evidenceSources = row.evidence.map((e) => e.sourceType);

    let transition;
    try {
      transition = applyManualLifecycleTransition({
        action,
        existing: this.toSnapshot(row),
        caseType: row.type,
        evidenceLevel,
        evidenceSources,
        resolutionReason: opts?.resolutionReason,
        operatorNote: opts?.operatorNote,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new BadRequestException(message);
    }

    if (action === 'CONFIRM' && !evidenceSources.includes(MisuseEvidenceSourceType.MANUAL_VERIFICATION)) {
      await this.prisma.misuseCaseEvidence.create({
        data: {
          caseId: row.id,
          sourceType: MisuseEvidenceSourceType.MANUAL_VERIFICATION,
          sourceId: `manual:${row.id}`,
          organizationId: orgId,
          vehicleId: row.vehicleId,
          tripId: row.tripId,
          bookingId: row.bookingId,
          customerId: row.customerId,
          eventType: 'MANUAL_CONFIRMATION',
          occurredAt: new Date(),
          snapshotJson: {
            operatorNote: opts?.operatorNote ?? opts?.resolutionReason ?? null,
            modelVersion: MISUSE_CASE_LIFECYCLE_VERSION,
          } as Prisma.InputJsonValue,
        },
      });
    }

    return this.prisma.misuseCase.update({
      where: { id: row.id },
      data: {
        status: transition.status,
        decisionEligibility: transition.decisionEligibility,
        informationalOnly: transition.informationalOnly,
        attributionConfidence: transition.attributionConfidence,
        resolvedAt: transition.resolvedAt,
        resolutionReason: transition.resolutionReason,
      },
    });
  }

  private toSnapshot(
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

  private readEvidenceLevel(evidenceSummary: unknown): TripEvidenceLevel {
    if (!evidenceSummary || typeof evidenceSummary !== 'object') return 'CHECK_RECOMMENDED';
    const evidenceCase = (evidenceSummary as Record<string, unknown>).evidenceCase;
    if (!evidenceCase || typeof evidenceCase !== 'object') return 'CHECK_RECOMMENDED';
    const level = (evidenceCase as Record<string, unknown>).evidenceLevel;
    if (typeof level === 'string') return level as TripEvidenceLevel;
    return 'CHECK_RECOMMENDED';
  }
}
