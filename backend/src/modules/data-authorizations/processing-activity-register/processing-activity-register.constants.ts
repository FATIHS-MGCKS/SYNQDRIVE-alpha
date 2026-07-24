export const PROCESSING_ACTIVITY_REGISTER = {
  defaultLimit: 25,
  maxLimit: 100,
  exportTtlHours: 72,
  recordVersion: 'art30-register-v1',
  disclaimer:
    'Technisches Verzeichnis gemäß Art. 30 DSGVO — keine automatische Behauptung juristischer Vollständigkeit.',
} as const;

export const REGISTER_COMPLETENESS_STATUS = {
  INCOMPLETE: 'INCOMPLETE',
  PARTIALLY_COMPLETE: 'PARTIALLY_COMPLETE',
  COMPLETE_FOR_TECHNICAL_SCOPE: 'COMPLETE_FOR_TECHNICAL_SCOPE',
} as const;

export type RegisterCompletenessStatus =
  (typeof REGISTER_COMPLETENESS_STATUS)[keyof typeof REGISTER_COMPLETENESS_STATUS];

export const REGISTER_FIELD_KEYS = [
  'title',
  'purposeSummary',
  'dataCategories',
  'processingPurposes',
  'dataSubjectTypes',
  'recipientCategories',
  'internationalTransfers',
  'retention',
  'technicalOrganizationalMeasures',
  'controller',
  'processors',
  'legalBasis',
  'dpiaStatus',
  'reviewDate',
  'owner',
] as const;

export type RegisterFieldKey = (typeof REGISTER_FIELD_KEYS)[number];

export const REGISTER_BLOCKING_FIELDS: readonly RegisterFieldKey[] = [
  'legalBasis',
  'retention',
] as const;
