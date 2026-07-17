import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { TaskType } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { TasksService } from '@modules/tasks/tasks.service';
import type { DocumentActionPlan } from './document-action-plan.types';
import { DocumentSchemaRegistryService } from './document-schema-registry.service';
import { resolveDocumentTaxonomy } from './document-taxonomy.util';
import {
  buildFollowUpSuggestions,
  isFollowUpSuggestionAcceptable,
  mergeFollowUpSuggestionsIdempotent,
} from './document-follow-up-suggestion.generator';
import {
  readFollowUpSuggestions,
  storeFollowUpSuggestions,
  supersedeFollowUpSuggestions,
} from './document-follow-up-suggestion.store';
import {
  DOCUMENT_FOLLOW_UP_SUGGESTION_STATUSES,
  DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES,
  type DocumentFollowUpSuggestion,
  type PublicDocumentFollowUpSuggestionDto,
  toPublicFollowUpSuggestion,
} from './document-follow-up-suggestion.types';
import { readAcceptedEntityLinks } from './document-fine-extraction.rules';

type ExtractionRecord = {
  id: string;
  organizationId: string | null;
  vehicleId: string | null;
  documentType?: string | null;
  effectiveDocumentType?: string | null;
  detectedDocumentSubtype?: string | null;
  confirmedData: unknown;
  plausibility: unknown;
};

@Injectable()
export class DocumentFollowUpSuggestionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tasksService: TasksService,
    private readonly schemaRegistry: DocumentSchemaRegistryService,
  ) {}

  listForRecord(record: ExtractionRecord): PublicDocumentFollowUpSuggestionDto[] {
    return readFollowUpSuggestions(record.plausibility).map(toPublicFollowUpSuggestion);
  }

  generateForPlan(input: {
    record: ExtractionRecord;
    plan: DocumentActionPlan;
    confirmedData: Record<string, unknown>;
  }): DocumentFollowUpSuggestion[] {
    const documentType =
      input.record.effectiveDocumentType ?? input.record.documentType ?? input.plan.documentType;
    const taxonomy = resolveDocumentTaxonomy({
      legacyDocumentType: documentType,
      documentSubtype: input.record.detectedDocumentSubtype,
    });
    let registryRules: readonly import('./document-schema-registry.types').DocumentFollowUpSuggestionRule[] =
      [];
    try {
      const schema = this.schemaRegistry.resolveSchema({
        legacyDocumentType: documentType,
        documentSubtype: taxonomy.documentSubtype,
      });
      registryRules = schema.followUpSuggestionRules;
    } catch {
      registryRules = [];
    }

    return buildFollowUpSuggestions({
      extractionId: input.record.id,
      plan: input.plan,
      confirmedData: input.confirmedData,
      registryRules,
    });
  }

  async syncForActionPlan(input: {
    record: ExtractionRecord;
    plan: DocumentActionPlan;
    confirmedData: Record<string, unknown>;
  }): Promise<DocumentFollowUpSuggestion[]> {
    const generated = this.generateForPlan(input);
    const existing = readFollowUpSuggestions(input.record.plausibility);
    const merged = mergeFollowUpSuggestionsIdempotent(existing, generated);
    const plausibility = storeFollowUpSuggestions(input.record.plausibility, merged);
    await this.prisma.vehicleDocumentExtraction.update({
      where: { id: input.record.id },
      data: { plausibility: plausibility as Prisma.InputJsonValue },
    });
    return merged;
  }

  async supersedeForRecord(extractionId: string, plausibility: unknown): Promise<void> {
    const next = supersedeFollowUpSuggestions(plausibility);
    await this.prisma.vehicleDocumentExtraction.update({
      where: { id: extractionId },
      data: { plausibility: next as Prisma.InputJsonValue },
    });
  }

  async acceptSuggestion(input: {
    record: ExtractionRecord;
    suggestionId: string;
    userId: string | null;
  }): Promise<PublicDocumentFollowUpSuggestionDto> {
    const orgId = input.record.organizationId;
    if (!orgId) {
      throw new BadRequestException('Organization scope required to accept follow-up suggestions');
    }

    const suggestions = readFollowUpSuggestions(input.record.plausibility);
    const index = suggestions.findIndex((row) => row.suggestionId === input.suggestionId);
    if (index < 0) {
      throw new NotFoundException('Follow-up suggestion not found');
    }
    const suggestion = suggestions[index];
    if (!isFollowUpSuggestionAcceptable(suggestion)) {
      throw new BadRequestException('Follow-up suggestion cannot be accepted');
    }

    const resultingEntityId = await this.materializeAcceptedSuggestion({
      orgId,
      record: input.record,
      suggestion,
      userId: input.userId,
    });

    const now = new Date().toISOString();
    const updated: DocumentFollowUpSuggestion = {
      ...suggestion,
      status: DOCUMENT_FOLLOW_UP_SUGGESTION_STATUSES.ACCEPTED,
      acceptedByUserId: input.userId,
      resultingEntityId,
      updatedAt: now,
    };
    const nextSuggestions = [...suggestions];
    nextSuggestions[index] = updated;
    const plausibility = storeFollowUpSuggestions(input.record.plausibility, nextSuggestions);
    await this.prisma.vehicleDocumentExtraction.update({
      where: { id: input.record.id },
      data: { plausibility: plausibility as Prisma.InputJsonValue },
    });
    return toPublicFollowUpSuggestion(updated);
  }

  async dismissSuggestion(input: {
    record: ExtractionRecord;
    suggestionId: string;
    userId: string | null;
  }): Promise<PublicDocumentFollowUpSuggestionDto> {
    const suggestions = readFollowUpSuggestions(input.record.plausibility);
    const index = suggestions.findIndex((row) => row.suggestionId === input.suggestionId);
    if (index < 0) {
      throw new NotFoundException('Follow-up suggestion not found');
    }
    const suggestion = suggestions[index];
    if (suggestion.status !== DOCUMENT_FOLLOW_UP_SUGGESTION_STATUSES.SUGGESTED) {
      throw new BadRequestException('Follow-up suggestion cannot be dismissed');
    }
    if (suggestion.type === DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES.NO_FOLLOW_UP) {
      throw new BadRequestException('Informational follow-up suggestions cannot be dismissed');
    }

    const now = new Date().toISOString();
    const updated: DocumentFollowUpSuggestion = {
      ...suggestion,
      status: DOCUMENT_FOLLOW_UP_SUGGESTION_STATUSES.DISMISSED,
      acceptedByUserId: input.userId,
      updatedAt: now,
    };
    const nextSuggestions = [...suggestions];
    nextSuggestions[index] = updated;
    const plausibility = storeFollowUpSuggestions(input.record.plausibility, nextSuggestions);
    await this.prisma.vehicleDocumentExtraction.update({
      where: { id: input.record.id },
      data: { plausibility: plausibility as Prisma.InputJsonValue },
    });
    return toPublicFollowUpSuggestion(updated);
  }

  private async materializeAcceptedSuggestion(input: {
    orgId: string;
    record: ExtractionRecord;
    suggestion: DocumentFollowUpSuggestion;
    userId: string | null;
  }): Promise<string> {
    const links = readAcceptedEntityLinks(
      (input.record.confirmedData ?? {}) as Record<string, unknown>,
    );
    const byType = new Map(links.map((link) => [link.entityType, link.entityId]));
    const vehicleId = input.record.vehicleId ?? byType.get('vehicle') ?? null;
    const customerId = byType.get('customer') ?? null;
    const bookingId = byType.get('booking') ?? null;
    const driverId = byType.get('driver') ?? byType.get('driver_customer') ?? null;
    const vendorId = byType.get('vendor') ?? byType.get('partner') ?? null;

    const dedupKey = `document-follow-up:${input.record.id}:${input.suggestion.suggestionId}`;
    const taskType = this.resolveTaskType(input.suggestion.type);
    const preparedOnly = this.isContactPrepareType(input.suggestion.type);

    const task = await this.tasksService.upsertByDedup(input.orgId, dedupKey, {
      title: input.suggestion.title,
      description: input.suggestion.rationale,
      category: 'document_follow_up',
      type: taskType,
      source: 'DOCUMENT_FOLLOW_UP',
      sourceType: 'DOCUMENT',
      priority: 'NORMAL',
      vehicleId,
      bookingId,
      customerId: customerId ?? driverId ?? undefined,
      vendorId: vendorId ?? undefined,
      documentId: input.record.id,
      dueDate: input.suggestion.suggestedDueAt ? new Date(input.suggestion.suggestedDueAt) : null,
      metadata: {
        followUpSuggestionId: input.suggestion.suggestionId,
        followUpSuggestionType: input.suggestion.type,
        generatedByRule: input.suggestion.generatedByRule,
        actionPlanId: input.suggestion.actionPlanId,
        preparedOnly,
        acceptedByUserId: input.userId,
        noAutomaticContact: preparedOnly,
      } as Prisma.InputJsonValue,
    });

    return task.id;
  }

  private resolveTaskType(type: DocumentFollowUpSuggestion['type']): TaskType {
    switch (type) {
      case DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES.VEHICLE_INSPECTION:
        return 'VEHICLE_INSPECTION';
      case DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES.PAYMENT_REVIEW:
        return 'INVOICE_REQUIRED';
      case DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES.PREPARE_CUSTOMER_CONTACT:
      case DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES.PREPARE_DRIVER_CONTACT:
        return 'CUSTOMER_FOLLOWUP';
      case DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES.INSURANCE_REVIEW:
      case DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES.WORKSHOP_APPOINTMENT:
        return 'REPAIR';
      default:
        return 'DOCUMENT_REVIEW';
    }
  }

  private isContactPrepareType(type: DocumentFollowUpSuggestion['type']): boolean {
    return (
      type === DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES.PREPARE_CUSTOMER_CONTACT ||
      type === DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES.PREPARE_DRIVER_CONTACT
    );
  }
}
