import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { DocumentCategory, DocumentEntityLink, DocumentExtractionType, Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { DocumentActionPlanRepository } from './document-action-plan.repository';
import {
  buildDocumentActionPreviewRows,
  summarizeBlockingReasons,
} from './document-action-plan-preview.mapper';
import { DocumentActionRepository } from './document-action.repository';
import { planDocumentActions } from './document-action-planner.engine';
import type { DocumentActionPlanEntityLinkSnapshot } from './document-action-plan.types';
import {
  DEFAULT_DOCUMENT_DOWNSTREAM_CAPABILITIES,
} from './document-action-planner.capabilities';
import { DOCUMENT_ACTION_PLANNER_VERSION } from './document-action-planner.types';
import type { DocumentEntityCandidateSnapshot } from './document-action-planner.types';
import { DocumentEntityCandidateRepository } from './document-entity-candidate.repository';
import { DocumentEntityLinkRepository } from './document-entity-link.repository';
import { assertExtractionInOrganization } from './document-entity.scope';
import type { ApplyDocumentExtractionType } from './document-extraction.schemas';
import {
  DocumentExtractionPlausibilityService,
  type PlausibilityResult,
} from './document-extraction-plausibility.service';
import { resolveEffectiveDocumentType } from './document-extraction-lifecycle.util';
import { findVehicleEntityId } from './document-action-planner.requirements';
import type { PublicDocumentActionPlanDto } from './dto/public-document-action-plan.dto';

function mapEffectiveTypeToCategory(
  effectiveType: DocumentExtractionType | null,
): DocumentCategory | null {
  switch (effectiveType) {
    case 'SERVICE':
      return 'SERVICE';
    case 'OIL_CHANGE':
    case 'BRAKE':
    case 'TIRE':
    case 'BATTERY':
      return 'MAINTENANCE';
    case 'TUV_REPORT':
    case 'BOKRAFT_REPORT':
      return 'INSPECTION';
    case 'INVOICE':
    case 'FINE':
      return 'FINANCE';
    case 'DAMAGE':
    case 'ACCIDENT':
      return 'DAMAGE';
    case 'VEHICLE_CONDITION':
      return 'CONDITION';
    case 'OTHER':
      return 'GENERAL';
    default:
      return null;
  }
}

function toEntityLinkSnapshots(links: DocumentEntityLink[]): DocumentActionPlanEntityLinkSnapshot[] {
  return links
    .map((link) => ({
      role: link.entityType === 'VEHICLE' ? 'PRIMARY_VEHICLE' : String(link.entityType),
      entityType: String(link.entityType),
      entityId: String(link.entityId),
    }))
    .sort((a, b) => {
      const left = `${a.role}|${a.entityType}|${a.entityId}`;
      const right = `${b.role}|${b.entityType}|${b.entityId}`;
      return left.localeCompare(right);
    });
}

function toCandidateSnapshots(
  candidates: Array<{
    entityType: DocumentEntityLink['entityType'];
    entityId: string | null;
    confidence: Prisma.Decimal | null;
    status: string;
    matchReasons: unknown;
  }>,
): DocumentEntityCandidateSnapshot[] {
  return candidates.map((candidate) => ({
    entityType: candidate.entityType,
    entityId: candidate.entityId,
    confidence: candidate.confidence == null ? null : Number(candidate.confidence),
    status: candidate.status,
    matchReasonCodes: Array.isArray(candidate.matchReasons)
      ? (candidate.matchReasons as Array<{ code?: string }>)
          .map((reason) => reason.code)
          .filter((code): code is string => Boolean(code))
      : [],
  }));
}

@Injectable()
export class DocumentExtractionApplyPlanService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly plausibilityService: DocumentExtractionPlausibilityService,
    private readonly entityLinkRepository: DocumentEntityLinkRepository,
    private readonly entityCandidateRepository: DocumentEntityCandidateRepository,
    private readonly actionPlanRepository: DocumentActionPlanRepository,
    private readonly actionRepository: DocumentActionRepository,
  ) {}

  /**
   * Apply dry-run: plan + persist preview rows only — no downstream domain writes.
   */
  async dryRunActionPlan(
    organizationId: string,
    extractionId: string,
    generatedByUserId?: string | null,
  ): Promise<PublicDocumentActionPlanDto> {
    const scoped = await assertExtractionInOrganization(
      this.prisma,
      organizationId,
      extractionId,
    );
    const resolvedOrganizationId = scoped.organizationId ?? organizationId;

    const record = await this.prisma.vehicleDocumentExtraction.findFirst({
      where: {
        id: extractionId,
        OR: [{ organizationId }, { vehicle: { organizationId } }],
      },
      include: {
        vehicle: {
          select: {
            id: true,
            vin: true,
            licensePlate: true,
            mileageKm: true,
            organizationId: true,
          },
        },
      },
    });
    if (!record) {
      throw new NotFoundException('Document extraction not found for organization');
    }

    if (
      record.confirmedData == null ||
      typeof record.confirmedData !== 'object' ||
      Array.isArray(record.confirmedData)
    ) {
      throw new BadRequestException('Action plan dry-run requires confirmed review data');
    }

    const effectiveDocumentType = resolveEffectiveDocumentType(record);
    if (!effectiveDocumentType) {
      throw new BadRequestException('Effective document type must be set before action planning');
    }

    const confirmedData = record.confirmedData as Record<string, unknown>;
    const entityLinks = await this.entityLinkRepository.listActiveByExtraction(
      resolvedOrganizationId,
      extractionId,
    );
    const entityLinkSnapshots = toEntityLinkSnapshots(entityLinks);
    const vehicleEntityId =
      record.vehicleId ??
      findVehicleEntityId(entityLinkSnapshots) ??
      entityLinks.find((link) => link.entityType === 'VEHICLE')?.entityId ??
      null;

    const candidates = await this.entityCandidateRepository.listProposedByExtraction(
      resolvedOrganizationId,
      extractionId,
    );

    const plausibility = await this.runPlanningPlausibility(
      effectiveDocumentType as ApplyDocumentExtractionType,
      confirmedData,
      vehicleEntityId,
    );

    const plannerInput = {
      organizationId: resolvedOrganizationId,
      extractionId,
      documentCategory: record.documentCategory ?? mapEffectiveTypeToCategory(effectiveDocumentType),
      documentSubtype: record.documentSubtype,
      effectiveDocumentType,
      confirmedData,
      plausibility,
      entityLinks: entityLinkSnapshots,
      entityCandidates: toCandidateSnapshots(candidates),
      featureFlags: {
        documentIntakeV2: true,
        actionPreviewEnabled: true,
        autoApplyEnabled: false,
        archiveOnlyFallback: true,
      },
      downstreamCapabilities: { ...DEFAULT_DOCUMENT_DOWNSTREAM_CAPABILITIES },
      plannerVersion: DOCUMENT_ACTION_PLANNER_VERSION,
      applyMode: 'PREVIEW' as const,
      applySafetyDecision: {
        plannerVersion: DOCUMENT_ACTION_PLANNER_VERSION,
        plausibilityOverallStatus: plausibility.overallStatus,
      },
    };

    const plannerResult = planDocumentActions(plannerInput);
    const previewRows = buildDocumentActionPreviewRows(plannerResult, vehicleEntityId);

    const planResult = await this.actionPlanRepository.resolveOrCreatePlan({
      organizationId: resolvedOrganizationId,
      extractionId,
      inputFingerprint: plannerResult.planDraft.inputFingerprint,
      identity: {
        effectiveDocumentType,
        confirmedData,
        entityLinks: entityLinkSnapshots,
        applyMode: 'PREVIEW',
        applySafetyDecision: plannerInput.applySafetyDecision,
      },
      snapshot: {
        ...plannerResult.planDraft.snapshot,
        preview: previewRows,
      },
      summary: plannerResult.planDraft.summary,
      blockingReasons: plannerResult.blockingReasons,
      generatedBy: generatedByUserId ?? null,
      applyMode: 'PREVIEW',
    });

    let persistedActions = await this.actionRepository.listByPlan(
      resolvedOrganizationId,
      planResult.plan.id,
    );

    if (planResult.created) {
      await this.actionRepository.createPlannedActions({
        organizationId: resolvedOrganizationId,
        extractionId,
        actionPlanId: planResult.plan.id,
        actions: plannerResult.actions,
      });
      persistedActions = await this.actionRepository.listByPlan(
        resolvedOrganizationId,
        planResult.plan.id,
      );
    }

    return {
      planId: planResult.plan.id,
      extractionId,
      organizationId: resolvedOrganizationId,
      planVersion: planResult.plan.planVersion,
      inputFingerprint: planResult.plan.inputFingerprint,
      applyMode: planResult.plan.applyMode,
      isBlocked: plannerResult.planDraft.isBlocked,
      deduplicated: planResult.deduplicated,
      created: planResult.created,
      supersededPlanId: planResult.supersededPlanId,
      summary: plannerResult.planDraft.summary,
      effectiveDocumentType,
      blockingReasons: summarizeBlockingReasons(plannerResult.blockingReasons),
      missingRequirements: plannerResult.missingRequirements.map((missing) => ({
        code: missing.code,
        message: missing.message,
        fieldKeys: missing.fieldKeys,
        entityType: missing.entityType ? String(missing.entityType) : undefined,
      })),
      followUpCandidateTypes: plannerResult.followUpCandidateTypes,
      actions: previewRows.map((row) => ({
        sequence: row.sequence,
        actionType: row.actionType,
        previewStatus: row.previewStatus,
        requirement: row.requirement ?? 'REQUIRED',
        targetEntityType: row.targetEntityType,
        targetEntityId: row.targetEntityId,
        preview: row.preview,
        blocked: row.blocked,
      })),
      plausibilityOverallStatus: plausibility.overallStatus,
    };
  }

  private async runPlanningPlausibility(
    documentType: ApplyDocumentExtractionType,
    confirmedData: Record<string, unknown>,
    vehicleId: string | null,
  ): Promise<PlausibilityResult> {
    if (!vehicleId) {
      return this.plausibilityService.runChecks(documentType, confirmedData, {});
    }

    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { vin: true, licensePlate: true, mileageKm: true },
    });
    const latest = await this.prisma.vehicleLatestState.findUnique({
      where: { vehicleId },
      select: { odometerKm: true },
    });

    return this.plausibilityService.runChecks(documentType, confirmedData, {
      vin: vehicle?.vin,
      licensePlate: vehicle?.licensePlate,
      lastKnownOdometerKm: latest?.odometerKm ?? vehicle?.mileageKm ?? null,
    });
  }
}
