import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  appendExtractionActionAudit,
} from './document-content-cache.util';
import { DOCUMENT_ACTION_PLAN_INVALIDATION_REASONS } from './document-action-plan.types';
import {
  assertActionPlanEditable,
  invalidateDocumentActionPlan,
  readDocumentActionPlanState,
} from './document-action-plan.store';
import type { DocumentEntityLinkOperation } from './document-entity-link.types';
import {
  applyEntityLinkOperations,
  appendSupersededEntityLinks,
  readConfirmedDataObject,
  resolveVehicleIdFromEntityLinks,
} from './document-entity-link.util';
import { DocumentEntityLinkValidationService } from './document-entity-link.validation';
import { DocumentFollowUpResyncService } from './document-follow-up-resync.service';
import { DocumentExtractionArchiveIndexService } from './document-extraction-archive-index.service';
import { toPublicDocumentExtraction } from './document-extraction-public.mapper';

const EDITABLE_EXTRACTION_STATUSES = new Set(['READY_FOR_REVIEW', 'CONFIRMED']);

@Injectable()
export class DocumentEntityLinkService {
  private readonly validation = new DocumentEntityLinkValidationService(this.prisma);

  constructor(
    private readonly prisma: PrismaService,
    private readonly followUpResyncService: DocumentFollowUpResyncService,
    private readonly archiveIndexService: DocumentExtractionArchiveIndexService,
  ) {}

  async updateForVehicle(
    vehicleId: string,
    extractionId: string,
    operations: DocumentEntityLinkOperation[],
    userId?: string | null,
  ) {
    const record = await this.prisma.vehicleDocumentExtraction.findFirst({
      where: { id: extractionId, vehicleId },
      include: { vehicle: { select: { organizationId: true } } },
    });
    if (!record) {
      throw new NotFoundException('Document extraction not found');
    }
    if (record.vehicle?.organizationId && record.organizationId !== record.vehicle.organizationId) {
      throw new NotFoundException('Document extraction not found');
    }

    if (!record.organizationId) {
      throw new NotFoundException('Document extraction not found');
    }

    return this.applyUpdate({
      record,
      operations,
      userId,
      scope: 'vehicle',
      organizationId: record.organizationId,
      vehicleId: record.vehicleId,
    });
  }

  async updateForOrg(
    orgId: string,
    extractionId: string,
    operations: DocumentEntityLinkOperation[],
    userId?: string | null,
  ) {
    const record = await this.prisma.vehicleDocumentExtraction.findFirst({
      where: { id: extractionId, organizationId: orgId },
    });
    if (!record) {
      throw new NotFoundException('Document extraction not found');
    }

    return this.applyUpdate({
      record,
      operations,
      userId,
      scope: 'org',
      organizationId: orgId,
      vehicleId: record.vehicleId,
    });
  }

  private async applyUpdate(input: {
    record: {
      id: string;
      status: string;
      confirmedData: Prisma.JsonValue;
      plausibility: Prisma.JsonValue;
      organizationId: string | null;
      vehicleId: string | null;
    };
    operations: DocumentEntityLinkOperation[];
    userId?: string | null;
    scope: 'vehicle' | 'org';
    organizationId: string;
    vehicleId: string | null;
  }) {
    if (!EDITABLE_EXTRACTION_STATUSES.has(input.record.status)) {
      throw new BadRequestException(
        `Entity links cannot be changed while extraction is in status ${input.record.status}`,
      );
    }
    if (['APPLIED', 'PARTIALLY_APPLIED', 'CANCELLED'].includes(input.record.status)) {
      throw new BadRequestException('Entity links cannot be changed after apply or cancellation');
    }

    assertActionPlanEditable(input.record.plausibility);

    let operationResult;
    try {
      operationResult = applyEntityLinkOperations({
        confirmedData: input.record.confirmedData,
        operations: input.operations,
        userId: input.userId,
      });
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }

    if (!operationResult.changed) {
      return toPublicDocumentExtraction(
        await this.prisma.vehicleDocumentExtraction.findUniqueOrThrow({
          where: { id: input.record.id },
        }),
      );
    }

    const nextVehicleId = this.resolveNextVehicleId({
      scope: input.scope,
      currentVehicleId: input.vehicleId,
      links: operationResult.acceptedEntityLinks,
      operations: input.operations,
    });

    await this.validation.validateLinks({
      organizationId: input.organizationId,
      vehicleId: nextVehicleId,
      links: operationResult.acceptedEntityLinks,
      scope: input.scope,
    });

    const confirmedBase = readConfirmedDataObject(input.record.confirmedData);
    const nextConfirmedData = {
      ...confirmedBase,
      acceptedEntityLinks: operationResult.acceptedEntityLinks,
    };

    const planState = readDocumentActionPlanState(input.record.plausibility);
    let plausibilityPayload: Record<string, unknown> = input.record.plausibility as Record<
      string,
      unknown
    >;
    if (planState.actionPlan && planState.actionPlan.status !== 'INVALIDATED') {
      plausibilityPayload = invalidateDocumentActionPlan(
        plausibilityPayload,
        DOCUMENT_ACTION_PLAN_INVALIDATION_REASONS.CONFIRMED_DATA_CHANGED,
      );
    }
    plausibilityPayload = appendSupersededEntityLinks(
      plausibilityPayload,
      operationResult.superseded,
    );
    plausibilityPayload = appendExtractionActionAudit(plausibilityPayload, {
      action: 'update_entity_links',
      at: new Date().toISOString(),
      userId: input.userId ?? null,
      details: {
        operations: input.operations,
        acceptedEntityLinks: operationResult.acceptedEntityLinks,
        supersededCount: operationResult.superseded.length,
        planInvalidated: Boolean(planState.actionPlan && planState.actionPlan.status !== 'INVALIDATED'),
      },
    });

    const updated = await this.prisma.vehicleDocumentExtraction.update({
      where: { id: input.record.id },
      data: {
        confirmedData: nextConfirmedData as Prisma.InputJsonValue,
        plausibility: plausibilityPayload as Prisma.InputJsonValue,
        ...(input.scope === 'org' ? { vehicleId: nextVehicleId } : {}),
      },
    });

    await this.followUpResyncService.resyncAfterPlanChange(updated);
    const refreshed = await this.prisma.vehicleDocumentExtraction.findUniqueOrThrow({
      where: { id: updated.id },
    });
    await this.archiveIndexService.upsertForRecord(refreshed);

    return toPublicDocumentExtraction(refreshed);
  }

  private resolveNextVehicleId(input: {
    scope: 'vehicle' | 'org';
    currentVehicleId: string | null;
    links: Array<{ entityType: string; entityId: string }>;
    operations: DocumentEntityLinkOperation[];
  }): string | null {
    if (input.scope === 'vehicle') {
      return input.currentVehicleId;
    }

    const touchedVehicle = input.operations.some((row) => row.entityType === 'vehicle');
    if (!touchedVehicle) {
      return input.currentVehicleId;
    }

    const removedVehicle = input.operations.some(
      (row) => row.entityType === 'vehicle' && row.operation === 'remove',
    );
    if (removedVehicle) {
      return null;
    }

    return resolveVehicleIdFromEntityLinks(input.currentVehicleId, input.links);
  }
}
