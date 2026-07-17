import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { TasksService } from '@modules/tasks/tasks.service';
import { TaskAutomationOutboxEnqueueService } from '@modules/tasks/outbox/task-automation-outbox-enqueue.service';
import { TaskAutomationOutboxExecutionContext } from '@modules/tasks/outbox/task-automation-outbox-execution.context';
import { buildOutboxMeta } from '@modules/tasks/outbox/task-automation-outbox-meta.util';
import { sanitizeAutomationError } from '@modules/tasks/outbox/task-automation-outbox-error.util';
import {
  automationOutboxIdentity,
} from '@modules/tasks/automation/task-automation-rule.util';
import type { DocumentActionPlan } from './document-action-plan.types';
import { DocumentSchemaRegistryService } from './document-schema-registry.service';
import { resolveDocumentTaxonomy } from './document-taxonomy.util';
import { resolveVersionedFollowUpRules } from './document-follow-up-subtype-rules.catalog';
import { resolveDocumentFollowUpActionResultIds } from './document-follow-up-action-results.util';
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
import { buildDocumentFollowUpTaskMaterialization } from './document-follow-up-task.materializer';
import {
  DOCUMENT_FOLLOW_UP_SUGGESTION_STATUSES,
  DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES,
  type DocumentFollowUpSuggestion,
  type PublicDocumentFollowUpSuggestionDto,
  toPublicFollowUpSuggestion,
} from './document-follow-up-suggestion.types';

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
  private readonly logger = new Logger(DocumentFollowUpSuggestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tasksService: TasksService,
    private readonly schemaRegistry: DocumentSchemaRegistryService,
    private readonly outboxEnqueue: TaskAutomationOutboxEnqueueService,
    private readonly outboxContext: TaskAutomationOutboxExecutionContext,
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
      const versionedRules = resolveVersionedFollowUpRules(taxonomy.documentSubtype);
      registryRules =
        versionedRules.length > 0 ? versionedRules : schema.followUpSuggestionRules;
    } catch {
      registryRules = resolveVersionedFollowUpRules(taxonomy.documentSubtype);
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
    const confirmedData = (input.record.confirmedData ?? {}) as Record<string, unknown>;
    const actionResults = resolveDocumentFollowUpActionResultIds(input.record.plausibility);
    const materialization = buildDocumentFollowUpTaskMaterialization({
      extractionId: input.record.id,
      vehicleId: input.record.vehicleId,
      confirmedData,
      suggestion: input.suggestion,
      userId: input.userId,
      actionResults,
    });

    const customerId =
      input.suggestion.type === DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES.PREPARE_DRIVER_CONTACT
        ? materialization.links.driverId ?? materialization.links.customerId
        : materialization.links.customerId ?? materialization.links.driverId;

    try {
      const task = await this.tasksService.upsertByDedup(input.orgId, materialization.dedupKey, {
        title: materialization.title,
        description: materialization.description,
        category: materialization.category,
        type: materialization.type,
        source: materialization.source,
        sourceType: materialization.sourceType,
        priority: materialization.priority,
        vehicleId: materialization.links.vehicleId,
        bookingId: materialization.links.bookingId,
        customerId: customerId ?? undefined,
        vendorId: materialization.links.vendorId ?? undefined,
        documentId: materialization.links.documentId,
        fineId: materialization.links.fineId ?? undefined,
        invoiceId: materialization.links.invoiceId ?? undefined,
        dueDate: materialization.dueDate,
        checklist: materialization.checklist,
        metadata: materialization.metadata,
      });
      return task.id;
    } catch (err: unknown) {
      await this.enqueueMaterializationFailure({
        orgId: input.orgId,
        extractionId: input.record.id,
        suggestion: input.suggestion,
        materialization,
        err,
      });
      throw err;
    }
  }

  private async enqueueMaterializationFailure(input: {
    orgId: string;
    extractionId: string;
    suggestion: DocumentFollowUpSuggestion;
    materialization: ReturnType<typeof buildDocumentFollowUpTaskMaterialization>;
    err: unknown;
  }): Promise<void> {
    if (this.outboxContext.fromOutbox) {
      return;
    }

    const catalogKey = input.materialization.automationCatalogKey ?? 'DOCUMENT_PACKAGE_INCOMPLETE';

    await this.outboxEnqueue.enqueueFailure(
      buildOutboxMeta({
        organizationId: input.orgId,
        ...automationOutboxIdentity(catalogKey),
        entityType: 'DOCUMENT',
        entityId: input.extractionId,
        operation: 'MATERIALIZE_INSIGHT_TASK',
        payload: {
          operation: 'MATERIALIZE_INSIGHT_TASK',
          vehicleId: input.materialization.links.vehicleId ?? undefined,
          dedupKey: input.materialization.dedupKey,
          insightDedupKey: input.materialization.dedupKey,
          insightType: `DOCUMENT_FOLLOW_UP:${input.suggestion.type}`,
        },
      }),
      input.err,
    );
    this.logger.warn(
      `materializeAcceptedSuggestion(${input.extractionId}/${input.suggestion.suggestionId}) failed: ${sanitizeAutomationError(input.err)}`,
    );
  }
}
