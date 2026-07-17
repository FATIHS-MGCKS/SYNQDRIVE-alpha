import type { DocumentEntityType } from '@prisma/client';

export interface PublicConditionalFieldRuleDto {
  id: string;
  stages: string[];
  require: Record<string, unknown>;
  message?: string;
}

export interface PublicEntityRequirementRuleDto {
  entityType: DocumentEntityType;
  stages: string[];
  confirmationRequired: boolean;
}

export interface PublicRegistryBlockingRuleDto {
  code: string;
  message: string;
  stages: string[];
}

export interface PublicDocumentRequiredFieldProfileDto {
  profileKey: string;
  effectiveDocumentType: string;
  documentSubtypes: Array<string | null>;
  planningMode: string;
  documentMode?: string;
  requiredForReview: string[];
  requiredForDraft: string[];
  requiredForApply: string[];
  optionalFields: string[];
  conditionalFields: PublicConditionalFieldRuleDto[];
  entityRequirements: PublicEntityRequirementRuleDto[];
  allowedActions: string[];
  blockingRules: PublicRegistryBlockingRuleDto[];
}

export interface PublicDocumentRequiredFieldRegistryDto {
  version: string;
  profiles: PublicDocumentRequiredFieldProfileDto[];
}
