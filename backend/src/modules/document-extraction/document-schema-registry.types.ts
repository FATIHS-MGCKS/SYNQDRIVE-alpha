import type { ApplyDocumentExtractionType, FieldDef } from './document-extraction.schemas';
import type { DocumentCategory, DocumentSubtype } from './document-taxonomy.types';
import type { PlausibilityCheck } from './document-plausibility.types';
import type { PlausibilityVehicleContext, PlausibilityRunOptions } from './document-extraction-plausibility.service';

export const DOCUMENT_SCHEMA_REGISTRY_VERSION = '1.0.0' as const;

export const DOCUMENT_ENTITY_RESOLVER_KEYS = [
  'vehicle',
  'booking',
  'customer',
  'driver',
  'partner',
] as const;

export type DocumentEntityResolverKey = (typeof DOCUMENT_ENTITY_RESOLVER_KEYS)[number];

export const DOCUMENT_PLAUSIBILITY_RULE_KEYS = [
  'invoice',
  'archive',
  'inspection',
  'damage',
  'tire',
  'brake',
  'battery',
  'fine',
  'cross_document_consistency',
  'none',
] as const;

export type DocumentPlausibilityRuleKey = (typeof DOCUMENT_PLAUSIBILITY_RULE_KEYS)[number];

export type DocumentActionRequirement = 'REQUIRED' | 'OPTIONAL' | 'INFORMATIONAL';

export type DocumentAllowedAction = {
  semanticAction: string;
  requirement: DocumentActionRequirement;
};

import type { DocumentFollowUpSuggestionType } from './document-follow-up-suggestion.types';

export type DocumentFollowUpRuleTrigger =
  | 'missing_driver'
  | 'missing_customer'
  | 'missing_booking'
  | 'missing_vendor'
  | 'deadline_detected'
  | 'duplicate_reference'
  | 'defect_detected'
  | 'reinspection_due'
  | 'next_service_due'
  | 'mileage_threshold'
  | 'payment_approval_needed'
  | 'customer_contact_relevant'
  | 'insurance_context'
  | 'archive_ready';

export type DocumentFollowUpSuggestionRule = {
  code: string;
  message: string;
  trigger: DocumentFollowUpRuleTrigger;
  severity: 'INFO' | 'WARNING';
  ruleVersion?: string;
  title?: string;
  rationale?: string;
  suggestionType?: DocumentFollowUpSuggestionType;
};

export type DocumentUiFieldMetadata = FieldDef & {
  required?: boolean;
  sensitive?: boolean;
  uiGroup?: string;
  order?: number;
  labelKey?: string;
};

export type DocumentPlausibilityCollector = (
  legacyDocumentType: ApplyDocumentExtractionType,
  fields: Record<string, unknown>,
  context: PlausibilityVehicleContext,
  options?: PlausibilityRunOptions,
) => Array<Omit<PlausibilityCheck, 'explanation'>>;

export type DocumentSubtypeSchemaEntry = {
  subtype: DocumentSubtype;
  category: DocumentCategory;
  schemaVersion: typeof DOCUMENT_SCHEMA_REGISTRY_VERSION;
  legacyDocumentTypes: readonly ApplyDocumentExtractionType[];
  extractionFields: (legacyDocumentType: ApplyDocumentExtractionType) => FieldDef[];
  requiredFields: readonly string[];
  plausibilityRules: readonly DocumentPlausibilityRuleKey[];
  entityResolvers: readonly DocumentEntityResolverKey[];
  allowedActions: readonly DocumentAllowedAction[];
  followUpSuggestionRules: readonly DocumentFollowUpSuggestionRule[];
  uiFields: (legacyDocumentType: ApplyDocumentExtractionType) => DocumentUiFieldMetadata[];
};

export type DocumentSchemaRegistryResolveInput = {
  documentSubtype?: string | null;
  legacyDocumentType?: string | null;
};

export type PublicDocumentSubtypeSchemaDto = {
  subtype: DocumentSubtype;
  category: DocumentCategory;
  schemaVersion: string;
  legacyDocumentTypes: ApplyDocumentExtractionType[];
  requiredFields: string[];
  plausibilityRules: DocumentPlausibilityRuleKey[];
  entityResolvers: DocumentEntityResolverKey[];
  allowedActions: DocumentAllowedAction[];
  followUpSuggestionRules: DocumentFollowUpSuggestionRule[];
  fields: DocumentUiFieldMetadata[];
};
