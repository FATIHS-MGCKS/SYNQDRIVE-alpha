import type { DocumentEntityType, DocumentExtractionType } from '@prisma/client';

export const DOCUMENT_REQUIRED_FIELD_REGISTRY_VERSION = 'document-required-field-registry-v1';

export const REQUIRED_FIELD_STAGES = ['review', 'draft', 'apply'] as const;

export type RequiredFieldStage = (typeof REQUIRED_FIELD_STAGES)[number];

export type RequiredFieldCondition =
  | { kind: 'fieldPresent'; fieldKey: string }
  | { kind: 'anyFieldPresent'; fieldKeys: string[] }
  | { kind: 'allFieldsPresent'; fieldKeys: string[] }
  | { kind: 'whenEquals'; fieldKey: string; equals: string | number | boolean }
  | { kind: 'nestedAnyPresent'; parentKey: string; childKeys: string[] }
  | { kind: 'anyOfConditions'; conditions: RequiredFieldCondition[] };

export type ConditionalFieldRule = {
  id: string;
  stages: RequiredFieldStage[];
  require: RequiredFieldCondition;
  message?: string;
};

export type EntityRequirementRule = {
  entityType: DocumentEntityType;
  stages: RequiredFieldStage[];
  confirmationRequired: boolean;
};

export type RegistryBlockingRule = {
  code: string;
  message: string;
  stages: RequiredFieldStage[];
};

export type DocumentRequiredFieldProfile = {
  profileKey: string;
  effectiveDocumentType: DocumentExtractionType;
  /** Canonical subtype keys; `null` in list = default when subtype is absent or unmatched. */
  documentSubtypes: Array<string | null>;
  planningMode: 'ARCHIVE_ONLY' | 'FINE' | 'FINANCE' | 'EVIDENCE' | 'MAINTENANCE' | 'DOWNSTREAM';
  documentMode?: string;
  requiredForReview: string[];
  requiredForDraft: string[];
  requiredForApply: string[];
  optionalFields: string[];
  conditionalFields: ConditionalFieldRule[];
  entityRequirements: EntityRequirementRule[];
  allowedActions: string[];
  blockingRules: RegistryBlockingRule[];
};

export type RequiredFieldEvaluationContext = {
  confirmedData: Record<string, unknown>;
  entityLinks: Array<{ entityType: string; entityId?: string | null }>;
};

export type RequiredFieldStageEvaluation = {
  missingFieldKeys: string[];
  missingConditionalRuleIds: string[];
  missingEntityTypes: DocumentEntityType[];
  satisfiedFieldKeys: string[];
};

export type RequiredFieldProfileEvaluation = {
  profileKey: string;
  registryVersion: string;
  byStage: Record<RequiredFieldStage, RequiredFieldStageEvaluation>;
};
