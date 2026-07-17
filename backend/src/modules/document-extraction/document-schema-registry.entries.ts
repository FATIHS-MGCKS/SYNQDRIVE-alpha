import {
  DOCUMENT_FIELD_SCHEMAS,
  type ApplyDocumentExtractionType,
} from './document-extraction.schemas';
import { ARCHIVE_SEMANTIC_ACTIONS } from './document-action-planner.archive-rules';
import { DAMAGE_SEMANTIC_ACTIONS } from './document-action-planner.damage-rules';
import { FINE_SEMANTIC_ACTIONS } from './document-action-planner.fine-rules';
import { FINANCE_SEMANTIC_ACTIONS } from './document-action-planner.invoice-rules';
import { INSPECTION_SEMANTIC_ACTIONS } from './document-action-planner.inspection-rules';
import { buildUiFieldMetadata } from './document-schema-registry.field-meta';
import {
  DOCUMENT_SCHEMA_REGISTRY_VERSION,
  type DocumentSubtypeSchemaEntry,
} from './document-schema-registry.types';
import { DOCUMENT_SUBTYPES } from './document-taxonomy.types';

function fieldsFor(legacy: ApplyDocumentExtractionType) {
  return () => DOCUMENT_FIELD_SCHEMAS[legacy] ?? DOCUMENT_FIELD_SCHEMAS.OTHER;
}

function technicalLegacyTypes(): readonly ApplyDocumentExtractionType[] {
  return ['SERVICE', 'OIL_CHANGE', 'TIRE', 'BRAKE', 'BATTERY'];
}

function technicalFields(legacy: ApplyDocumentExtractionType) {
  return DOCUMENT_FIELD_SCHEMAS[legacy] ?? DOCUMENT_FIELD_SCHEMAS.SERVICE;
}

function archiveActions() {
  return [
    { semanticAction: ARCHIVE_SEMANTIC_ACTIONS.ARCHIVE_DOCUMENT, requirement: 'REQUIRED' as const },
    { semanticAction: ARCHIVE_SEMANTIC_ACTIONS.SUGGEST_ENTITY_LINK, requirement: 'OPTIONAL' as const },
    { semanticAction: ARCHIVE_SEMANTIC_ACTIONS.SUGGEST_DEADLINE_REMINDER, requirement: 'OPTIONAL' as const },
    { semanticAction: ARCHIVE_SEMANTIC_ACTIONS.NO_AUTOMATIC_OUTREACH, requirement: 'INFORMATIONAL' as const },
  ];
}

function correspondenceFollowUps() {
  return [
    {
      code: 'SUGGEST_ENTITY_LINK_REVIEW',
      message: 'Review suggested entity links before archiving.',
      trigger: 'missing_booking' as const,
      severity: 'INFO' as const,
    },
    {
      code: 'SUGGEST_DEADLINE_REVIEW',
      message: 'Detected deadlines are suggestions only — confirm before creating tasks.',
      trigger: 'deadline_detected' as const,
      severity: 'INFO' as const,
    },
  ];
}

function makeEntry(
  partial: Omit<DocumentSubtypeSchemaEntry, 'schemaVersion' | 'uiFields'> & {
    uiFields?: DocumentSubtypeSchemaEntry['uiFields'];
  },
): DocumentSubtypeSchemaEntry {
  const requiredFields = partial.requiredFields;
  return {
    ...partial,
    schemaVersion: DOCUMENT_SCHEMA_REGISTRY_VERSION,
    uiFields:
      partial.uiFields ??
      ((legacy) => buildUiFieldMetadata(partial.extractionFields(legacy), requiredFields)),
  };
}

export const DOCUMENT_SUBTYPE_SCHEMA_ENTRIES: DocumentSubtypeSchemaEntry[] = [
  makeEntry({
    subtype: 'INVOICE',
    category: 'FINANCE',
    legacyDocumentTypes: ['INVOICE'],
    extractionFields: fieldsFor('INVOICE'),
    requiredFields: ['invoiceNumber', 'totalCents', 'eventDate'],
    plausibilityRules: ['invoice', 'cross_document_consistency'],
    entityResolvers: ['vehicle', 'booking', 'customer', 'partner'],
    allowedActions: [
      { semanticAction: FINANCE_SEMANTIC_ACTIONS.CREATE_INVOICE_DRAFT, requirement: 'REQUIRED' },
      { semanticAction: FINANCE_SEMANTIC_ACTIONS.LINK_VENDOR, requirement: 'OPTIONAL' },
    ],
    followUpSuggestionRules: [
      {
        code: 'MISSING_VENDOR_MATCH',
        message: 'Confirm vendor/partner link when invoice supplier is ambiguous.',
        trigger: 'missing_vendor',
        severity: 'WARNING',
      },
    ],
  }),
  makeEntry({
    subtype: 'CREDIT_NOTE',
    category: 'FINANCE',
    legacyDocumentTypes: ['INVOICE'],
    extractionFields: fieldsFor('INVOICE'),
    requiredFields: ['invoiceNumber', 'totalCents', 'eventDate'],
    plausibilityRules: ['invoice', 'cross_document_consistency'],
    entityResolvers: ['vehicle', 'booking', 'customer', 'partner'],
    allowedActions: [
      { semanticAction: FINANCE_SEMANTIC_ACTIONS.CREATE_CREDIT_NOTE_DRAFT, requirement: 'REQUIRED' },
      { semanticAction: FINANCE_SEMANTIC_ACTIONS.LINK_VENDOR, requirement: 'OPTIONAL' },
    ],
    followUpSuggestionRules: [
      {
        code: 'LINK_SOURCE_INVOICE',
        message: 'Link credit note to the original invoice when reference is available.',
        trigger: 'duplicate_reference',
        severity: 'INFO',
      },
    ],
  }),
  makeEntry({
    subtype: 'REMINDER',
    category: 'FINANCE',
    legacyDocumentTypes: ['INVOICE'],
    extractionFields: fieldsFor('INVOICE'),
    requiredFields: ['invoiceNumber', 'dueDate'],
    plausibilityRules: ['invoice', 'cross_document_consistency'],
    entityResolvers: ['vehicle', 'booking', 'customer', 'partner'],
    allowedActions: [
      { semanticAction: FINANCE_SEMANTIC_ACTIONS.LINK_EXISTING_INVOICE, requirement: 'OPTIONAL' },
      { semanticAction: ARCHIVE_SEMANTIC_ACTIONS.ARCHIVE_DOCUMENT, requirement: 'REQUIRED' },
    ],
    followUpSuggestionRules: [
      {
        code: 'LINK_OVERDUE_INVOICE',
        message: 'Link payment reminder to the referenced invoice before follow-up.',
        trigger: 'duplicate_reference',
        severity: 'WARNING',
      },
    ],
  }),
  makeEntry({
    subtype: 'PAYMENT_PROOF',
    category: 'FINANCE',
    legacyDocumentTypes: ['OTHER', 'INVOICE'],
    extractionFields: (legacy) => DOCUMENT_FIELD_SCHEMAS[legacy] ?? DOCUMENT_FIELD_SCHEMAS.OTHER,
    requiredFields: ['eventDate', 'referenceNumber'],
    plausibilityRules: ['archive', 'cross_document_consistency'],
    entityResolvers: ['vehicle', 'booking', 'customer', 'partner'],
    allowedActions: archiveActions(),
    followUpSuggestionRules: correspondenceFollowUps(),
  }),
  makeEntry({
    subtype: 'FINE_NOTICE',
    category: 'AUTHORITY',
    legacyDocumentTypes: ['FINE'],
    extractionFields: fieldsFor('FINE'),
    requiredFields: ['eventDate', 'offenseType', 'totalCents'],
    plausibilityRules: ['fine', 'cross_document_consistency'],
    entityResolvers: ['vehicle', 'booking', 'customer', 'driver', 'partner'],
    allowedActions: [
      { semanticAction: FINE_SEMANTIC_ACTIONS.CREATE_FINE_DRAFT, requirement: 'REQUIRED' },
      { semanticAction: FINE_SEMANTIC_ACTIONS.SUGGEST_ENTITY_LINK, requirement: 'OPTIONAL' },
      { semanticAction: FINE_SEMANTIC_ACTIONS.SUGGEST_DRIVER_ASSIGNMENT, requirement: 'OPTIONAL' },
    ],
    followUpSuggestionRules: [
      {
        code: 'MISSING_DRIVER_ASSIGNMENT',
        message: 'Driver assignment is not confirmed — review driver candidates.',
        trigger: 'missing_driver',
        severity: 'WARNING',
      },
      {
        code: 'MISSING_BOOKING_CONTEXT',
        message: 'Booking link helps forward the fine to the responsible customer.',
        trigger: 'missing_booking',
        severity: 'INFO',
      },
    ],
  }),
  makeEntry({
    subtype: 'DRIVER_IDENTIFICATION_REQUEST',
    category: 'AUTHORITY',
    legacyDocumentTypes: ['FINE', 'OTHER'],
    extractionFields: (legacy) => DOCUMENT_FIELD_SCHEMAS[legacy] ?? DOCUMENT_FIELD_SCHEMAS.OTHER,
    requiredFields: ['dueDate', 'reportNumber'],
    plausibilityRules: ['archive', 'fine', 'cross_document_consistency'],
    entityResolvers: ['vehicle', 'booking', 'driver', 'customer'],
    allowedActions: [
      { semanticAction: FINE_SEMANTIC_ACTIONS.SUGGEST_DRIVER_ASSIGNMENT, requirement: 'REQUIRED' },
      { semanticAction: ARCHIVE_SEMANTIC_ACTIONS.ARCHIVE_DOCUMENT, requirement: 'REQUIRED' },
    ],
    followUpSuggestionRules: [
      {
        code: 'DRIVER_IDENTIFICATION_REQUIRED',
        message: 'Authority requests driver identification — confirm driver link before response.',
        trigger: 'missing_driver',
        severity: 'WARNING',
      },
    ],
  }),
  makeEntry({
    subtype: 'SERVICE_REPORT',
    category: 'TECHNICAL',
    legacyDocumentTypes: technicalLegacyTypes(),
    extractionFields: technicalFields,
    requiredFields: ['eventDate'],
    plausibilityRules: ['tire', 'brake', 'battery', 'cross_document_consistency'],
    entityResolvers: ['vehicle', 'partner'],
    allowedActions: [
      { semanticAction: 'CREATE_SERVICE_EVENT', requirement: 'OPTIONAL' },
      { semanticAction: 'APPLY_TIRE_MEASUREMENT', requirement: 'OPTIONAL' },
      { semanticAction: 'APPLY_BRAKE_MEASUREMENT', requirement: 'OPTIONAL' },
      { semanticAction: 'APPLY_BATTERY_MEASUREMENT', requirement: 'OPTIONAL' },
    ],
    followUpSuggestionRules: [
      {
        code: 'CONFIRM_WORKSHOP_VENDOR',
        message: 'Confirm workshop/vendor link for service documentation.',
        trigger: 'missing_vendor',
        severity: 'INFO',
      },
    ],
  }),
  makeEntry({
    subtype: 'TUV_REPORT',
    category: 'COMPLIANCE',
    legacyDocumentTypes: ['TUV_REPORT'],
    extractionFields: fieldsFor('TUV_REPORT'),
    requiredFields: ['eventDate', 'validUntil'],
    plausibilityRules: ['inspection', 'cross_document_consistency'],
    entityResolvers: ['vehicle'],
    allowedActions: [
      { semanticAction: INSPECTION_SEMANTIC_ACTIONS.CREATE_COMPLIANCE_SERVICE_EVENT, requirement: 'REQUIRED' },
      { semanticAction: INSPECTION_SEMANTIC_ACTIONS.UPDATE_VEHICLE_COMPLIANCE_DATES, requirement: 'OPTIONAL' },
      { semanticAction: INSPECTION_SEMANTIC_ACTIONS.SUGGEST_DEFECT_REMEDIATION, requirement: 'OPTIONAL' },
    ],
    followUpSuggestionRules: [
      {
        code: 'SUGGEST_REINSPECTION',
        message: 'Review defect remediation and re-inspection suggestions.',
        trigger: 'deadline_detected',
        severity: 'INFO',
      },
    ],
  }),
  makeEntry({
    subtype: 'BOKRAFT_REPORT',
    category: 'COMPLIANCE',
    legacyDocumentTypes: ['BOKRAFT_REPORT'],
    extractionFields: fieldsFor('BOKRAFT_REPORT'),
    requiredFields: ['eventDate', 'validUntil'],
    plausibilityRules: ['inspection', 'cross_document_consistency'],
    entityResolvers: ['vehicle'],
    allowedActions: [
      { semanticAction: INSPECTION_SEMANTIC_ACTIONS.CREATE_COMPLIANCE_SERVICE_EVENT, requirement: 'REQUIRED' },
      { semanticAction: INSPECTION_SEMANTIC_ACTIONS.UPDATE_VEHICLE_COMPLIANCE_DATES, requirement: 'OPTIONAL' },
    ],
    followUpSuggestionRules: [],
  }),
  makeEntry({
    subtype: 'DAMAGE_REPORT',
    category: 'INSURANCE',
    legacyDocumentTypes: ['DAMAGE'],
    extractionFields: fieldsFor('DAMAGE'),
    requiredFields: ['eventDate', 'damageType'],
    plausibilityRules: ['damage', 'cross_document_consistency'],
    entityResolvers: ['vehicle', 'booking', 'customer', 'driver', 'partner'],
    allowedActions: [
      { semanticAction: DAMAGE_SEMANTIC_ACTIONS.CREATE_DAMAGE_DRAFT, requirement: 'REQUIRED' },
      { semanticAction: DAMAGE_SEMANTIC_ACTIONS.LINK_EXISTING_DAMAGE, requirement: 'OPTIONAL' },
      { semanticAction: DAMAGE_SEMANTIC_ACTIONS.ARCHIVE_DOCUMENT, requirement: 'OPTIONAL' },
    ],
    followUpSuggestionRules: [
      {
        code: 'LINK_EXISTING_DAMAGE',
        message: 'Check for an existing open damage record before creating a duplicate.',
        trigger: 'duplicate_reference',
        severity: 'WARNING',
      },
    ],
  }),
  makeEntry({
    subtype: 'ACCIDENT_REPORT',
    category: 'INSURANCE',
    legacyDocumentTypes: ['ACCIDENT'],
    extractionFields: fieldsFor('ACCIDENT'),
    requiredFields: ['eventDate', 'description'],
    plausibilityRules: ['damage', 'cross_document_consistency'],
    entityResolvers: ['vehicle', 'booking', 'customer', 'driver', 'partner'],
    allowedActions: [
      { semanticAction: DAMAGE_SEMANTIC_ACTIONS.CREATE_DAMAGE_RECORD, requirement: 'REQUIRED' },
      { semanticAction: DAMAGE_SEMANTIC_ACTIONS.ARCHIVE_DOCUMENT, requirement: 'OPTIONAL' },
    ],
    followUpSuggestionRules: [
      {
        code: 'MISSING_DRIVER_CONTEXT',
        message: 'Accident reports often need a confirmed driver assignment.',
        trigger: 'missing_driver',
        severity: 'INFO',
      },
    ],
  }),
  makeEntry({
    subtype: 'INSURANCE_LETTER',
    category: 'INSURANCE',
    legacyDocumentTypes: ['OTHER', 'VEHICLE_CONDITION'],
    extractionFields: (legacy) => DOCUMENT_FIELD_SCHEMAS[legacy] ?? DOCUMENT_FIELD_SCHEMAS.OTHER,
    requiredFields: ['documentDate', 'sender'],
    plausibilityRules: ['archive', 'cross_document_consistency'],
    entityResolvers: ['vehicle', 'booking', 'customer', 'partner'],
    allowedActions: archiveActions(),
    followUpSuggestionRules: correspondenceFollowUps(),
  }),
  makeEntry({
    subtype: 'CUSTOMER_CORRESPONDENCE',
    category: 'CUSTOMER',
    legacyDocumentTypes: ['OTHER'],
    extractionFields: fieldsFor('OTHER'),
    requiredFields: ['documentDate', 'summary'],
    plausibilityRules: ['archive', 'cross_document_consistency'],
    entityResolvers: ['vehicle', 'booking', 'customer'],
    allowedActions: archiveActions(),
    followUpSuggestionRules: [
      {
        code: 'MISSING_CUSTOMER_LINK',
        message: 'Confirm customer link for correspondence archiving.',
        trigger: 'missing_customer',
        severity: 'WARNING',
      },
      ...correspondenceFollowUps(),
    ],
  }),
  makeEntry({
    subtype: 'DRIVER_DOCUMENT',
    category: 'DRIVER',
    legacyDocumentTypes: ['OTHER'],
    extractionFields: fieldsFor('OTHER'),
    requiredFields: ['documentDate'],
    plausibilityRules: ['archive', 'cross_document_consistency'],
    entityResolvers: ['vehicle', 'booking', 'driver', 'customer'],
    allowedActions: archiveActions(),
    followUpSuggestionRules: [
      {
        code: 'MISSING_DRIVER_LINK',
        message: 'Confirm driver link before archiving driver-related documents.',
        trigger: 'missing_driver',
        severity: 'WARNING',
      },
    ],
  }),
  makeEntry({
    subtype: 'OTHER',
    category: 'GENERAL',
    legacyDocumentTypes: ['OTHER', 'VEHICLE_CONDITION'],
    extractionFields: (legacy) => DOCUMENT_FIELD_SCHEMAS[legacy] ?? DOCUMENT_FIELD_SCHEMAS.OTHER,
    requiredFields: ['summary'],
    plausibilityRules: ['archive', 'cross_document_consistency'],
    entityResolvers: ['vehicle', 'booking', 'customer', 'driver', 'partner'],
    allowedActions: archiveActions(),
    followUpSuggestionRules: correspondenceFollowUps(),
  }),
];

export function assertSubtypeRegistryCompleteness(): void {
  const registered = new Set(DOCUMENT_SUBTYPE_SCHEMA_ENTRIES.map((row) => row.subtype));
  for (const subtype of DOCUMENT_SUBTYPES) {
    if (!registered.has(subtype)) {
      throw new Error(`Missing document schema registry entry for subtype: ${subtype}`);
    }
  }
}

assertSubtypeRegistryCompleteness();
