export const DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES = {
  CREATE_TASK: 'CREATE_TASK',
  PREPARE_CUSTOMER_CONTACT: 'PREPARE_CUSTOMER_CONTACT',
  PREPARE_DRIVER_CONTACT: 'PREPARE_DRIVER_CONTACT',
  REVIEW_DEADLINE: 'REVIEW_DEADLINE',
  VEHICLE_INSPECTION: 'VEHICLE_INSPECTION',
  WORKSHOP_APPOINTMENT: 'WORKSHOP_APPOINTMENT',
  INSURANCE_REVIEW: 'INSURANCE_REVIEW',
  PAYMENT_REVIEW: 'PAYMENT_REVIEW',
  ASSIGN_RESPONSIBLE_USER: 'ASSIGN_RESPONSIBLE_USER',
  NO_FOLLOW_UP: 'NO_FOLLOW_UP',
} as const;

export type DocumentFollowUpSuggestionType =
  (typeof DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES)[keyof typeof DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES];

export const DOCUMENT_FOLLOW_UP_SUGGESTION_STATUSES = {
  SUGGESTED: 'SUGGESTED',
  ACCEPTED: 'ACCEPTED',
  DISMISSED: 'DISMISSED',
  SUPERSEDED: 'SUPERSEDED',
} as const;

export type DocumentFollowUpSuggestionStatus =
  (typeof DOCUMENT_FOLLOW_UP_SUGGESTION_STATUSES)[keyof typeof DOCUMENT_FOLLOW_UP_SUGGESTION_STATUSES];

export type DocumentFollowUpTargetEntity = {
  entityType: string;
  entityId?: string | null;
  label?: string | null;
};

export type DocumentFollowUpSuggestion = {
  suggestionId: string;
  extractionId: string;
  actionPlanId: string;
  type: DocumentFollowUpSuggestionType;
  title: string;
  rationale: string;
  suggestedDueAt: string | null;
  targetEntity: DocumentFollowUpTargetEntity | null;
  status: DocumentFollowUpSuggestionStatus;
  generatedByRule: string;
  acceptedByUserId: string | null;
  resultingEntityId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PublicDocumentFollowUpSuggestionDto = {
  suggestionId: string;
  extractionId: string;
  actionPlanId: string;
  type: DocumentFollowUpSuggestionType;
  title: string;
  rationale: string;
  suggestedDueAt: string | null;
  targetEntity: DocumentFollowUpTargetEntity | null;
  status: DocumentFollowUpSuggestionStatus;
  generatedByRule: string;
  acceptedByUserId: string | null;
  resultingEntityId: string | null;
};

export function toPublicFollowUpSuggestion(
  row: DocumentFollowUpSuggestion,
): PublicDocumentFollowUpSuggestionDto {
  return {
    suggestionId: row.suggestionId,
    extractionId: row.extractionId,
    actionPlanId: row.actionPlanId,
    type: row.type,
    title: row.title,
    rationale: row.rationale,
    suggestedDueAt: row.suggestedDueAt,
    targetEntity: row.targetEntity,
    status: row.status,
    generatedByRule: row.generatedByRule,
    acceptedByUserId: row.acceptedByUserId,
    resultingEntityId: row.resultingEntityId,
  };
}
