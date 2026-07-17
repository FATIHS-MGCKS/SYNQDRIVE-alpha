import { Prisma, TaskPriority, TaskSource, TaskType } from '@prisma/client';
import { checklistForType } from '@modules/tasks/task-templates';
import {
  buildAutomationMetadataBlock,
  invoicePaymentCheckDedupKey,
} from '@modules/tasks/automation/task-automation-rule.util';
import type { TaskAutomationCatalogKey } from '@modules/tasks/automation/task-automation-rule.types';
import { readAcceptedEntityLinks } from './document-fine-extraction.rules';
import type { DocumentFollowUpActionResultIds } from './document-follow-up-action-results.util';
import {
  DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES,
  type DocumentFollowUpSuggestion,
  type DocumentFollowUpSuggestionType,
} from './document-follow-up-suggestion.types';

export type DocumentFollowUpTaskLinks = {
  vehicleId: string | null;
  bookingId: string | null;
  customerId: string | null;
  driverId: string | null;
  vendorId: string | null;
  documentId: string;
  fineId: string | null;
  invoiceId: string | null;
};

export type DocumentFollowUpTaskMaterialization = {
  dedupKey: string;
  title: string;
  description: string;
  category: string;
  type: TaskType;
  source: string;
  sourceType: TaskSource;
  priority: TaskPriority;
  links: DocumentFollowUpTaskLinks;
  dueDate: Date | null;
  checklist: ReturnType<typeof checklistForType>;
  metadata: Prisma.InputJsonValue;
  preparedOnly: boolean;
  automationCatalogKey: TaskAutomationCatalogKey | null;
};

const PREPARED_CONTACT_TYPES = new Set<DocumentFollowUpSuggestionType>([
  DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES.PREPARE_CUSTOMER_CONTACT,
  DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES.PREPARE_DRIVER_CONTACT,
]);

function readEntityLinks(confirmedData: Record<string, unknown>): DocumentFollowUpTaskLinks {
  const accepted = readAcceptedEntityLinks(confirmedData);
  const byType = new Map(accepted.map((link) => [link.entityType, link.entityId]));
  return {
    vehicleId: byType.get('vehicle') ?? null,
    bookingId: byType.get('booking') ?? null,
    customerId: byType.get('customer') ?? null,
    driverId: byType.get('driver') ?? byType.get('driver_customer') ?? null,
    vendorId: byType.get('vendor') ?? byType.get('partner') ?? null,
    documentId: '',
    fineId: null,
    invoiceId: null,
  };
}

function resolveTaskType(type: DocumentFollowUpSuggestionType): TaskType {
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

function resolveAutomationCatalogKey(
  type: DocumentFollowUpSuggestionType,
): TaskAutomationCatalogKey | null {
  switch (type) {
    case DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES.PAYMENT_REVIEW:
      return 'INVOICE_PAYMENT_CHECK';
    case DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES.VEHICLE_INSPECTION:
      return 'VEHICLE_INSPECTION_TUV_DUE';
    case DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES.WORKSHOP_APPOINTMENT:
    case DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES.INSURANCE_REVIEW:
      return 'REPAIR_REQUIRED';
    case DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES.CREATE_TASK:
    case DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES.ASSIGN_RESPONSIBLE_USER:
      return 'DOCUMENT_PACKAGE_INCOMPLETE';
    default:
      return null;
  }
}

function resolveCategory(type: DocumentFollowUpSuggestionType): string {
  switch (type) {
    case DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES.PAYMENT_REVIEW:
      return 'Finance';
    case DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES.VEHICLE_INSPECTION:
      return 'TÜV';
    case DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES.WORKSHOP_APPOINTMENT:
    case DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES.INSURANCE_REVIEW:
      return 'Maintenance';
    case DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES.REVIEW_DEADLINE:
      return 'fine';
    case DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES.PREPARE_CUSTOMER_CONTACT:
    case DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES.PREPARE_DRIVER_CONTACT:
      return 'Customer';
    default:
      return 'document_follow_up';
  }
}

function resolveDedupKey(input: {
  extractionId: string;
  suggestion: DocumentFollowUpSuggestion;
  actionResults: DocumentFollowUpActionResultIds;
}): string {
  const { suggestion, extractionId, actionResults } = input;

  if (
    suggestion.type === DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES.PAYMENT_REVIEW &&
    actionResults.invoiceId
  ) {
    return invoicePaymentCheckDedupKey(actionResults.invoiceId);
  }

  if (actionResults.fineId) {
    if (
      suggestion.type === DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES.REVIEW_DEADLINE ||
      suggestion.type === DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES.PREPARE_DRIVER_CONTACT ||
      suggestion.generatedByRule.includes('FINE') ||
      suggestion.generatedByRule.includes('SUGGEST_DRIVER_ASSIGNMENT')
    ) {
      return `document-extraction:fine:${extractionId}`;
    }
  }

  return `document-follow-up:${extractionId}:${suggestion.suggestionId}`;
}

function resolveDueDate(suggestion: DocumentFollowUpSuggestion): Date | null {
  if (!suggestion.suggestedDueAt || !suggestion.dueDateConfirmed) {
    return null;
  }
  const parsed = new Date(suggestion.suggestedDueAt);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function buildDocumentFollowUpTaskMaterialization(input: {
  extractionId: string;
  vehicleId: string | null;
  confirmedData: Record<string, unknown>;
  suggestion: DocumentFollowUpSuggestion;
  userId: string | null;
  actionResults: DocumentFollowUpActionResultIds;
}): DocumentFollowUpTaskMaterialization {
  const links = readEntityLinks(input.confirmedData);
  links.documentId = input.extractionId;
  links.vehicleId = input.vehicleId ?? links.vehicleId;
  links.fineId = input.actionResults.fineId;
  links.invoiceId = input.actionResults.invoiceId;

  const taskType = resolveTaskType(input.suggestion.type);
  const preparedOnly = PREPARED_CONTACT_TYPES.has(input.suggestion.type);
  const automationCatalogKey = resolveAutomationCatalogKey(input.suggestion.type);
  const dedupKey = resolveDedupKey({
    extractionId: input.extractionId,
    suggestion: input.suggestion,
    actionResults: input.actionResults,
  });

  const actionResultIds = {
    fineId: input.actionResults.fineId,
    invoiceId: input.actionResults.invoiceId,
    damageId: input.actionResults.damageId,
    serviceEventId: input.actionResults.serviceEventId,
    tireMeasurementId: input.actionResults.tireMeasurementId,
  };

  const metadata: Record<string, unknown> = {
    followUpSuggestionId: input.suggestion.suggestionId,
    followUpSuggestionType: input.suggestion.type,
    generatedByRule: input.suggestion.generatedByRule,
    actionPlanId: input.suggestion.actionPlanId,
    documentExtractionId: input.extractionId,
    actionResultIds,
    preparedOnly,
    acceptedByUserId: input.userId,
    noAutomaticContact: preparedOnly,
    documentFollowUp: {
      suggestionId: input.suggestion.suggestionId,
      suggestionType: input.suggestion.type,
      actionPlanId: input.suggestion.actionPlanId,
      actionResultIds,
      dueDateConfirmed: input.suggestion.dueDateConfirmed ?? false,
    },
  };

  if (automationCatalogKey) {
    metadata.automation = buildAutomationMetadataBlock(automationCatalogKey);
    metadata.generatedKey = dedupKey;
  }

  if (input.actionResults.damageId) {
    metadata.damageId = input.actionResults.damageId;
  }
  if (input.actionResults.serviceEventId) {
    metadata.serviceEventId = input.actionResults.serviceEventId;
  }

  return {
    dedupKey,
    title: input.suggestion.title,
    description: input.suggestion.rationale,
    category: resolveCategory(input.suggestion.type),
    type: taskType,
    source: 'DOCUMENT_FOLLOW_UP',
    sourceType: 'DOCUMENT',
    priority: 'NORMAL',
    links,
    dueDate: resolveDueDate(input.suggestion),
    checklist: checklistForType(taskType),
    metadata: metadata as Prisma.InputJsonValue,
    preparedOnly,
    automationCatalogKey,
  };
}
