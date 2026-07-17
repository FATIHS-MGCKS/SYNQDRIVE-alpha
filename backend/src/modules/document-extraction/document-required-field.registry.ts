import { ARCHIVE_ONLY_SEMANTIC_ACTIONS } from './document-action-planner.archive-rules';
import { EVIDENCE_SEMANTIC_ACTIONS } from './document-action-planner.evidence-rules';
import { FINE_SEMANTIC_ACTIONS } from './document-action-planner.fine-rules';
import { FINANCE_SEMANTIC_ACTIONS } from './document-action-planner.invoice-rules';
import { MAINTENANCE_SEMANTIC_ACTIONS } from './document-action-planner.maintenance-rules';
import type { DocumentRequiredFieldProfile, RequiredFieldStage } from './document-required-field.registry.types';

const VEHICLE_ENTITY_DRAFT_APPLY = [
  {
    entityType: 'VEHICLE' as const,
    stages: ['draft', 'apply'] as RequiredFieldStage[],
    confirmationRequired: true,
  },
];

const VEHICLE_ENTITY_APPLY_ONLY = [
  {
    entityType: 'VEHICLE' as const,
    stages: ['apply'] as RequiredFieldStage[],
    confirmationRequired: true,
  },
];

function profile(
  partial: DocumentRequiredFieldProfile,
): DocumentRequiredFieldProfile {
  return partial;
}

export const DOCUMENT_REQUIRED_FIELD_PROFILES: DocumentRequiredFieldProfile[] = [
  // --- Archive-only ---
  profile({
    profileKey: 'archive.general_letter',
    effectiveDocumentType: 'OTHER',
    documentSubtypes: ['GENERAL_LETTER', null],
    planningMode: 'ARCHIVE_ONLY',
    requiredForReview: [],
    requiredForDraft: [],
    requiredForApply: [],
    optionalFields: ['description', 'eventDate'],
    conditionalFields: [],
    entityRequirements: [],
    allowedActions: [
      ARCHIVE_ONLY_SEMANTIC_ACTIONS.ARCHIVE_DOCUMENT,
      ARCHIVE_ONLY_SEMANTIC_ACTIONS.LINK_VEHICLE,
      ARCHIVE_ONLY_SEMANTIC_ACTIONS.SUGGEST_OWNER_REVIEW,
    ],
    blockingRules: [],
  }),
  profile({
    profileKey: 'archive.customer_correspondence',
    effectiveDocumentType: 'OTHER',
    documentSubtypes: ['CUSTOMER_CORRESPONDENCE'],
    planningMode: 'ARCHIVE_ONLY',
    requiredForReview: [],
    requiredForDraft: [],
    requiredForApply: [],
    optionalFields: ['description', 'eventDate'],
    conditionalFields: [],
    entityRequirements: [],
    allowedActions: [
      ARCHIVE_ONLY_SEMANTIC_ACTIONS.ARCHIVE_DOCUMENT,
      ARCHIVE_ONLY_SEMANTIC_ACTIONS.LINK_CUSTOMER,
      ARCHIVE_ONLY_SEMANTIC_ACTIONS.SUGGEST_OWNER_REVIEW,
    ],
    blockingRules: [],
  }),
  profile({
    profileKey: 'archive.driver_document',
    effectiveDocumentType: 'OTHER',
    documentSubtypes: ['DRIVER_DOCUMENT'],
    planningMode: 'ARCHIVE_ONLY',
    requiredForReview: [],
    requiredForDraft: [],
    requiredForApply: [],
    optionalFields: ['description', 'eventDate'],
    conditionalFields: [],
    entityRequirements: [],
    allowedActions: [
      ARCHIVE_ONLY_SEMANTIC_ACTIONS.ARCHIVE_DOCUMENT,
      ARCHIVE_ONLY_SEMANTIC_ACTIONS.LINK_DRIVER,
      ARCHIVE_ONLY_SEMANTIC_ACTIONS.SUGGEST_OWNER_REVIEW,
    ],
    blockingRules: [],
  }),
  profile({
    profileKey: 'archive.insurance_notice',
    effectiveDocumentType: 'OTHER',
    documentSubtypes: ['INSURANCE_NOTICE'],
    planningMode: 'ARCHIVE_ONLY',
    requiredForReview: [],
    requiredForDraft: [],
    requiredForApply: [],
    optionalFields: ['description', 'eventDate', 'validUntil'],
    conditionalFields: [],
    entityRequirements: [],
    allowedActions: [
      ARCHIVE_ONLY_SEMANTIC_ACTIONS.ARCHIVE_DOCUMENT,
      ARCHIVE_ONLY_SEMANTIC_ACTIONS.LINK_VEHICLE,
      ARCHIVE_ONLY_SEMANTIC_ACTIONS.SUGGEST_OWNER_REVIEW,
    ],
    blockingRules: [],
  }),
  profile({
    profileKey: 'archive.payment_proof',
    effectiveDocumentType: 'OTHER',
    documentSubtypes: ['PAYMENT_PROOF', 'ZAHLUNGSNACHWEIS', 'PAYMENT_RECEIPT'],
    planningMode: 'ARCHIVE_ONLY',
    requiredForReview: [],
    requiredForDraft: [],
    requiredForApply: [],
    optionalFields: ['eventDate', 'totalCents', 'invoiceNumber'],
    conditionalFields: [],
    entityRequirements: [],
    allowedActions: [ARCHIVE_ONLY_SEMANTIC_ACTIONS.ARCHIVE_DOCUMENT, ARCHIVE_ONLY_SEMANTIC_ACTIONS.LINK_VENDOR],
    blockingRules: [],
  }),
  profile({
    profileKey: 'archive.general_proof',
    effectiveDocumentType: 'OTHER',
    documentSubtypes: ['GENERAL_PROOF'],
    planningMode: 'ARCHIVE_ONLY',
    requiredForReview: [],
    requiredForDraft: [],
    requiredForApply: [],
    optionalFields: ['description', 'eventDate'],
    conditionalFields: [],
    entityRequirements: [],
    allowedActions: [ARCHIVE_ONLY_SEMANTIC_ACTIONS.ARCHIVE_DOCUMENT],
    blockingRules: [],
  }),
  profile({
    profileKey: 'archive.unknown_document_type',
    effectiveDocumentType: 'OTHER',
    documentSubtypes: ['UNKNOWN_DOCUMENT_TYPE', 'OTHER', 'UNSPECIFIED', 'STANDARD'],
    planningMode: 'ARCHIVE_ONLY',
    requiredForReview: [],
    requiredForDraft: [],
    requiredForApply: [],
    optionalFields: ['description'],
    conditionalFields: [],
    entityRequirements: [],
    allowedActions: [
      ARCHIVE_ONLY_SEMANTIC_ACTIONS.ARCHIVE_DOCUMENT,
      ARCHIVE_ONLY_SEMANTIC_ACTIONS.SUGGEST_OWNER_REVIEW,
    ],
    blockingRules: [
      {
        code: 'UNKNOWN_DOCUMENT_TYPE',
        message: 'Document type is unknown — manual review recommended before apply.',
        stages: ['apply'],
      },
    ],
  }),

  // --- Fine ---
  profile({
    profileKey: 'fine.fine_notice',
    effectiveDocumentType: 'FINE',
    documentSubtypes: ['PARKING_FINE', 'SPEEDING_FINE', 'STANDARD', 'UNSPECIFIED', null],
    planningMode: 'FINE',
    documentMode: 'FINE_NOTICE',
    requiredForReview: ['eventDate'],
    requiredForDraft: ['eventDate', 'totalCents', 'issuingAuthority'],
    requiredForApply: ['eventDate', 'totalCents', 'issuingAuthority'],
    optionalFields: ['offenseType', 'dueDate', 'location', 'eventTime'],
    conditionalFields: [
      {
        id: 'fine_reference_number',
        stages: ['draft', 'apply'],
        require: {
          kind: 'anyFieldPresent',
          fieldKeys: ['reportNumber', 'referenceNumber', 'caseNumber', 'fileNumber'],
        },
        message: 'At least one reference number field must be confirmed.',
      },
    ],
    entityRequirements: VEHICLE_ENTITY_DRAFT_APPLY,
    allowedActions: [
      FINE_SEMANTIC_ACTIONS.CREATE_FINE_DRAFT,
      FINE_SEMANTIC_ACTIONS.LINK_VEHICLE,
      FINE_SEMANTIC_ACTIONS.LINK_BOOKING,
      FINE_SEMANTIC_ACTIONS.LINK_DRIVER,
      FINE_SEMANTIC_ACTIONS.SUGGEST_DRIVER_REVIEW,
      FINE_SEMANTIC_ACTIONS.SUGGEST_DEADLINE_TASK,
    ],
    blockingRules: [
      {
        code: 'MISSING_OFFENSE_TIME',
        message: 'Offense time is required before booking or driver attribution.',
        stages: ['apply'],
      },
      {
        code: 'MULTIPLE_DRIVER_CANDIDATES',
        message: 'Multiple driver candidates — no automatic driver assignment.',
        stages: ['apply'],
      },
    ],
  }),
  profile({
    profileKey: 'fine.hearing_form',
    effectiveDocumentType: 'FINE',
    documentSubtypes: ['HEARING_FORM', 'ANHOERUNGSBOGEN', 'ANHORUNGSBOGEN', 'HEARING_NOTICE'],
    planningMode: 'FINE',
    documentMode: 'HEARING_FORM',
    requiredForReview: ['eventDate'],
    requiredForDraft: ['eventDate', 'issuingAuthority'],
    requiredForApply: ['eventDate', 'issuingAuthority'],
    optionalFields: ['reportNumber', 'referenceNumber', 'dueDate'],
    conditionalFields: [
      {
        id: 'hearing_reference_number',
        stages: ['draft', 'apply'],
        require: {
          kind: 'anyFieldPresent',
          fieldKeys: ['reportNumber', 'referenceNumber', 'caseNumber', 'fileNumber'],
        },
      },
    ],
    entityRequirements: VEHICLE_ENTITY_APPLY_ONLY,
    allowedActions: [
      FINE_SEMANTIC_ACTIONS.LINK_VEHICLE,
      FINE_SEMANTIC_ACTIONS.SUGGEST_DEADLINE_TASK,
      FINE_SEMANTIC_ACTIONS.SUGGEST_CUSTOMER_CONTACT,
    ],
    blockingRules: [],
  }),
  profile({
    profileKey: 'fine.driver_inquiry',
    effectiveDocumentType: 'FINE',
    documentSubtypes: ['DRIVER_INQUIRY', 'FAHRERERMITTLUNG', 'DRIVER_IDENTIFICATION'],
    planningMode: 'FINE',
    documentMode: 'DRIVER_INQUIRY',
    requiredForReview: ['eventDate'],
    requiredForDraft: ['eventDate', 'issuingAuthority'],
    requiredForApply: ['eventDate', 'issuingAuthority'],
    optionalFields: ['reportNumber', 'referenceNumber', 'dueDate'],
    conditionalFields: [
      {
        id: 'driver_inquiry_reference',
        stages: ['draft', 'apply'],
        require: {
          kind: 'anyFieldPresent',
          fieldKeys: ['reportNumber', 'referenceNumber', 'caseNumber', 'fileNumber'],
        },
      },
    ],
    entityRequirements: VEHICLE_ENTITY_APPLY_ONLY,
    allowedActions: [
      FINE_SEMANTIC_ACTIONS.LINK_VEHICLE,
      FINE_SEMANTIC_ACTIONS.LINK_DRIVER,
      FINE_SEMANTIC_ACTIONS.SUGGEST_DRIVER_REVIEW,
      FINE_SEMANTIC_ACTIONS.SUGGEST_CUSTOMER_CONTACT,
    ],
    blockingRules: [
      {
        code: 'MISSING_OFFENSE_TIME',
        message: 'Offense time is required before driver attribution.',
        stages: ['apply'],
      },
    ],
  }),

  // --- Finance ---
  profile({
    profileKey: 'finance.incoming_invoice',
    effectiveDocumentType: 'INVOICE',
    documentSubtypes: ['INCOMING_INVOICE', 'EINGANGSRECHNUNG', 'VENDOR_INVOICE', 'STANDARD', 'UNSPECIFIED', null],
    planningMode: 'FINANCE',
    documentMode: 'INCOMING_INVOICE',
    requiredForReview: ['invoiceNumber'],
    requiredForDraft: ['invoiceNumber'],
    requiredForApply: ['invoiceNumber'],
    optionalFields: ['eventDate', 'dueDate', 'vendorName', 'taxLines'],
    conditionalFields: [
      {
        id: 'invoice_amount_semantics',
        stages: ['draft', 'apply'],
        require: {
          kind: 'anyFieldPresent',
          fieldKeys: ['totalCents', 'grossCents', 'netCents', 'taxLines'],
        },
        message: 'Amount or tax lines must be confirmed explicitly.',
      },
      {
        id: 'invoice_explicit_semantics',
        stages: ['apply'],
        require: {
          kind: 'anyFieldPresent',
          fieldKeys: ['amountSemantics', 'taxSemantics'],
        },
        message: 'Amount and tax semantics must be explicit or marked unclear.',
      },
    ],
    entityRequirements: [],
    allowedActions: [
      FINANCE_SEMANTIC_ACTIONS.CREATE_INVOICE_DRAFT,
      FINANCE_SEMANTIC_ACTIONS.LINK_VENDOR,
      FINANCE_SEMANTIC_ACTIONS.LINK_VEHICLE,
      FINANCE_SEMANTIC_ACTIONS.SUGGEST_PAYMENT_REVIEW,
    ],
    blockingRules: [
      {
        code: 'UNCLEAR_AMOUNT_OR_TAX_SEMANTICS',
        message: 'Amount or tax semantics are unclear.',
        stages: ['apply'],
      },
    ],
  }),
  profile({
    profileKey: 'finance.credit_note',
    effectiveDocumentType: 'INVOICE',
    documentSubtypes: ['CREDIT_NOTE', 'GUTSCHRIFT', 'CREDIT_MEMO'],
    planningMode: 'FINANCE',
    documentMode: 'CREDIT_NOTE',
    requiredForReview: ['invoiceNumber'],
    requiredForDraft: ['invoiceNumber'],
    requiredForApply: ['invoiceNumber'],
    optionalFields: ['eventDate', 'taxLines', 'isCreditNote'],
    conditionalFields: [
      {
        id: 'credit_note_amount',
        stages: ['draft', 'apply'],
        require: {
          kind: 'anyFieldPresent',
          fieldKeys: ['totalCents', 'grossCents', 'netCents', 'taxLines'],
        },
      },
    ],
    entityRequirements: [],
    allowedActions: [
      FINANCE_SEMANTIC_ACTIONS.CREATE_CREDIT_NOTE_DRAFT,
      FINANCE_SEMANTIC_ACTIONS.LINK_VENDOR,
      FINANCE_SEMANTIC_ACTIONS.LINK_EXISTING_INVOICE,
    ],
    blockingRules: [],
  }),
  profile({
    profileKey: 'finance.payment_reminder',
    effectiveDocumentType: 'INVOICE',
    documentSubtypes: ['PAYMENT_REMINDER', 'MAHNUNG', 'DUNNING', 'REMINDER'],
    planningMode: 'FINANCE',
    documentMode: 'PAYMENT_REMINDER',
    requiredForReview: [],
    requiredForDraft: [],
    requiredForApply: [],
    optionalFields: ['invoiceNumber', 'dueDate', 'totalCents', 'eventDate'],
    conditionalFields: [
      {
        id: 'reminder_invoice_link',
        stages: ['apply'],
        require: { kind: 'anyFieldPresent', fieldKeys: ['invoiceNumber', 'linkedInvoiceId'] },
        message: 'Existing invoice reference should be confirmed for reminders.',
      },
    ],
    entityRequirements: [],
    allowedActions: [
      FINANCE_SEMANTIC_ACTIONS.LINK_EXISTING_INVOICE,
      FINANCE_SEMANTIC_ACTIONS.SUGGEST_DUE_DATE_TASK,
      FINANCE_SEMANTIC_ACTIONS.SUGGEST_PAYMENT_REVIEW,
    ],
    blockingRules: [],
  }),
  profile({
    profileKey: 'finance.payment_proof',
    effectiveDocumentType: 'INVOICE',
    documentSubtypes: ['PAYMENT_PROOF', 'ZAHLUNGSNACHWEIS', 'PAYMENT_RECEIPT'],
    planningMode: 'FINANCE',
    documentMode: 'PAYMENT_PROOF',
    requiredForReview: [],
    requiredForDraft: [],
    requiredForApply: [],
    optionalFields: ['eventDate', 'totalCents', 'invoiceNumber'],
    conditionalFields: [],
    entityRequirements: [],
    allowedActions: [FINANCE_SEMANTIC_ACTIONS.ARCHIVE_ONLY, FINANCE_SEMANTIC_ACTIONS.LINK_EXISTING_INVOICE],
    blockingRules: [],
  }),

  // --- Evidence ---
  profile({
    profileKey: 'evidence.tire',
    effectiveDocumentType: 'TIRE',
    documentSubtypes: ['STANDARD', 'UNSPECIFIED', 'ROUTINE_MAINTENANCE', null],
    planningMode: 'EVIDENCE',
    documentMode: 'TIRE',
    requiredForReview: [],
    requiredForDraft: [],
    requiredForApply: [],
    optionalFields: ['eventDate', 'odometerKm'],
    conditionalFields: [
      {
        id: 'tire_tread_depth',
        stages: ['draft', 'apply'],
        require: {
          kind: 'nestedAnyPresent',
          parentKey: 'treadDepthMm',
          childKeys: ['fl', 'fr', 'rl', 'rr'],
        },
        message: 'At least one confirmed tread depth (mm) is required.',
      },
    ],
    entityRequirements: VEHICLE_ENTITY_DRAFT_APPLY,
    allowedActions: [
      EVIDENCE_SEMANTIC_ACTIONS.CREATE_TIRE_MEASUREMENT,
      EVIDENCE_SEMANTIC_ACTIONS.SUGGEST_REMEASUREMENT,
      EVIDENCE_SEMANTIC_ACTIONS.SUGGEST_WORKSHOP_TASK,
    ],
    blockingRules: [
      {
        code: 'TREAD_OUT_OF_RANGE',
        message: 'Tread depth outside plausible mm range.',
        stages: ['apply'],
      },
    ],
  }),
  profile({
    profileKey: 'evidence.brake',
    effectiveDocumentType: 'BRAKE',
    documentSubtypes: ['STANDARD', 'UNSPECIFIED', null],
    planningMode: 'EVIDENCE',
    documentMode: 'BRAKE',
    requiredForReview: ['eventDate'],
    requiredForDraft: ['eventDate'],
    requiredForApply: ['eventDate'],
    optionalFields: ['serviceKind', 'scopeCsv', 'odometerKm'],
    conditionalFields: [
      {
        id: 'brake_measurement',
        stages: ['draft', 'apply'],
        require: {
          kind: 'anyFieldPresent',
          fieldKeys: ['frontPadMm', 'rearPadMm', 'frontDiscMm', 'rearDiscMm'],
        },
      },
    ],
    entityRequirements: VEHICLE_ENTITY_DRAFT_APPLY,
    allowedActions: [
      EVIDENCE_SEMANTIC_ACTIONS.CREATE_BRAKE_EVIDENCE,
      EVIDENCE_SEMANTIC_ACTIONS.SUGGEST_WORKSHOP_TASK,
    ],
    blockingRules: [],
  }),
  profile({
    profileKey: 'evidence.battery',
    effectiveDocumentType: 'BATTERY',
    documentSubtypes: ['STANDARD', 'UNSPECIFIED', null],
    planningMode: 'EVIDENCE',
    documentMode: 'BATTERY',
    requiredForReview: ['eventDate', 'scope'],
    requiredForDraft: ['eventDate', 'scope'],
    requiredForApply: ['eventDate', 'scope'],
    optionalFields: ['recordKind', 'sohPercent'],
    conditionalFields: [
      {
        id: 'battery_measurement',
        stages: ['draft', 'apply'],
        require: {
          kind: 'anyFieldPresent',
          fieldKeys: ['voltageV', 'restingVoltage', 'sohPercent'],
        },
      },
    ],
    entityRequirements: VEHICLE_ENTITY_DRAFT_APPLY,
    allowedActions: [
      EVIDENCE_SEMANTIC_ACTIONS.CREATE_BATTERY_EVIDENCE,
      EVIDENCE_SEMANTIC_ACTIONS.SUGGEST_REMEASUREMENT,
    ],
    blockingRules: [
      {
        code: 'LV_VOLTAGE_RANGE',
        message: 'LV voltage outside plausible range.',
        stages: ['apply'],
      },
    ],
  }),
  profile({
    profileKey: 'evidence.workshop_measurement',
    effectiveDocumentType: 'SERVICE',
    documentSubtypes: [
      'WORKSHOP_MEASUREMENT',
      'WORKSHOP_REPORT',
      'TECHNICAL_MEASUREMENT',
      'MEASUREMENT_REPORT',
      'TECHNICAL_REPORT',
    ],
    planningMode: 'EVIDENCE',
    documentMode: 'WORKSHOP_MEASUREMENT',
    requiredForReview: ['eventDate'],
    requiredForDraft: ['eventDate'],
    requiredForApply: ['eventDate'],
    optionalFields: ['workshopName', 'odometerKm', 'description', 'notes'],
    conditionalFields: [
      {
        id: 'workshop_measurement_payload',
        stages: ['draft', 'apply'],
        require: {
          kind: 'anyOfConditions',
          conditions: [
            { kind: 'fieldPresent', fieldKey: 'description' },
            { kind: 'fieldPresent', fieldKey: 'notes' },
            { kind: 'anyFieldPresent', fieldKeys: ['frontPadMm', 'rearPadMm', 'frontDiscMm', 'rearDiscMm'] },
            { kind: 'anyFieldPresent', fieldKeys: ['voltageV', 'restingVoltage', 'sohPercent'] },
            {
              kind: 'nestedAnyPresent',
              parentKey: 'treadDepthMm',
              childKeys: ['fl', 'fr', 'rl', 'rr'],
            },
          ],
        },
        message: 'Workshop report needs description or at least one measurement.',
      },
    ],
    entityRequirements: VEHICLE_ENTITY_DRAFT_APPLY,
    allowedActions: [
      EVIDENCE_SEMANTIC_ACTIONS.CREATE_SERVICE_EVENT,
      EVIDENCE_SEMANTIC_ACTIONS.CREATE_TIRE_MEASUREMENT,
      EVIDENCE_SEMANTIC_ACTIONS.CREATE_BRAKE_EVIDENCE,
      EVIDENCE_SEMANTIC_ACTIONS.CREATE_BATTERY_EVIDENCE,
      EVIDENCE_SEMANTIC_ACTIONS.SUGGEST_WORKSHOP_TASK,
    ],
    blockingRules: [],
  }),

  // --- Maintenance ---
  profile({
    profileKey: 'maintenance.service',
    effectiveDocumentType: 'SERVICE',
    documentSubtypes: ['ROUTINE_MAINTENANCE', 'STANDARD', 'UNSPECIFIED', null],
    planningMode: 'MAINTENANCE',
    requiredForReview: [],
    requiredForDraft: ['eventDate'],
    requiredForApply: ['eventDate'],
    optionalFields: ['workshopName', 'description', 'odometerKm', 'costCents'],
    conditionalFields: [],
    entityRequirements: VEHICLE_ENTITY_DRAFT_APPLY,
    allowedActions: [
      MAINTENANCE_SEMANTIC_ACTIONS.CREATE_SERVICE_EVENT,
      MAINTENANCE_SEMANTIC_ACTIONS.LINK_VEHICLE,
      MAINTENANCE_SEMANTIC_ACTIONS.SUGGEST_REPAIR_TASK,
    ],
    blockingRules: [],
  }),
  profile({
    profileKey: 'maintenance.oil_change',
    effectiveDocumentType: 'OIL_CHANGE',
    documentSubtypes: ['STANDARD', 'UNSPECIFIED', null],
    planningMode: 'MAINTENANCE',
    requiredForReview: [],
    requiredForDraft: ['eventDate'],
    requiredForApply: ['eventDate'],
    optionalFields: ['workshopName', 'odometerKm'],
    conditionalFields: [],
    entityRequirements: VEHICLE_ENTITY_DRAFT_APPLY,
    allowedActions: [MAINTENANCE_SEMANTIC_ACTIONS.CREATE_SERVICE_EVENT],
    blockingRules: [],
  }),
  profile({
    profileKey: 'maintenance.tuv_report',
    effectiveDocumentType: 'TUV_REPORT',
    documentSubtypes: ['INSPECTION_PASS', 'INSPECTION_FAIL', 'FAILED', 'WITH_DEFECTS', 'MANGEL', 'STANDARD', null],
    planningMode: 'MAINTENANCE',
    requiredForReview: ['eventDate'],
    requiredForDraft: ['eventDate', 'validUntil'],
    requiredForApply: ['eventDate', 'validUntil'],
    optionalFields: ['result', 'defects', 'workshopName'],
    conditionalFields: [],
    entityRequirements: VEHICLE_ENTITY_DRAFT_APPLY,
    allowedActions: [
      MAINTENANCE_SEMANTIC_ACTIONS.UPDATE_TUV_COMPLIANCE,
      MAINTENANCE_SEMANTIC_ACTIONS.SUGGEST_VEHICLE_INSPECTION,
      MAINTENANCE_SEMANTIC_ACTIONS.SUGGEST_REPAIR_TASK,
    ],
    blockingRules: [],
  }),
  profile({
    profileKey: 'maintenance.bokraft_report',
    effectiveDocumentType: 'BOKRAFT_REPORT',
    documentSubtypes: ['STANDARD', 'UNSPECIFIED', null],
    planningMode: 'MAINTENANCE',
    requiredForReview: ['eventDate'],
    requiredForDraft: ['eventDate', 'validUntil'],
    requiredForApply: ['eventDate', 'validUntil'],
    optionalFields: ['workshopName', 'result'],
    conditionalFields: [],
    entityRequirements: VEHICLE_ENTITY_DRAFT_APPLY,
    allowedActions: [MAINTENANCE_SEMANTIC_ACTIONS.UPDATE_BOKRAFT_COMPLIANCE],
    blockingRules: [],
  }),
  profile({
    profileKey: 'maintenance.damage',
    effectiveDocumentType: 'DAMAGE',
    documentSubtypes: ['STANDARD', 'UNSPECIFIED', null],
    planningMode: 'MAINTENANCE',
    requiredForReview: ['description'],
    requiredForDraft: ['description'],
    requiredForApply: ['description'],
    optionalFields: ['severity', 'eventDate', 'location'],
    conditionalFields: [],
    entityRequirements: VEHICLE_ENTITY_DRAFT_APPLY,
    allowedActions: [
      MAINTENANCE_SEMANTIC_ACTIONS.CREATE_DAMAGE_DRAFT,
      MAINTENANCE_SEMANTIC_ACTIONS.SUGGEST_INSURANCE_REVIEW,
      MAINTENANCE_SEMANTIC_ACTIONS.SUGGEST_REPAIR_TASK,
    ],
    blockingRules: [],
  }),
  profile({
    profileKey: 'maintenance.accident',
    effectiveDocumentType: 'ACCIDENT',
    documentSubtypes: ['STANDARD', 'UNSPECIFIED', null],
    planningMode: 'MAINTENANCE',
    requiredForReview: ['eventDate'],
    requiredForDraft: ['eventDate'],
    requiredForApply: ['eventDate'],
    optionalFields: ['description', 'location'],
    conditionalFields: [],
    entityRequirements: VEHICLE_ENTITY_DRAFT_APPLY,
    allowedActions: [
      MAINTENANCE_SEMANTIC_ACTIONS.CREATE_INSPECTION_DRAFT,
      MAINTENANCE_SEMANTIC_ACTIONS.SUGGEST_INSURANCE_REVIEW,
    ],
    blockingRules: [],
  }),
  profile({
    profileKey: 'maintenance.vehicle_condition',
    effectiveDocumentType: 'VEHICLE_CONDITION',
    documentSubtypes: ['STANDARD', 'UNSPECIFIED', null],
    planningMode: 'MAINTENANCE',
    requiredForReview: ['eventDate', 'description'],
    requiredForDraft: ['eventDate', 'description'],
    requiredForApply: ['eventDate', 'description'],
    optionalFields: ['odometerKm', 'defects'],
    conditionalFields: [],
    entityRequirements: VEHICLE_ENTITY_DRAFT_APPLY,
    allowedActions: [
      MAINTENANCE_SEMANTIC_ACTIONS.CREATE_INSPECTION_DRAFT,
      MAINTENANCE_SEMANTIC_ACTIONS.SUGGEST_VEHICLE_INSPECTION,
    ],
    blockingRules: [],
  }),
];

export const DOCUMENT_REQUIRED_FIELD_PROFILE_BY_KEY = new Map(
  DOCUMENT_REQUIRED_FIELD_PROFILES.map((row) => [row.profileKey, row]),
);

export function listDocumentRequiredFieldProfiles(): DocumentRequiredFieldProfile[] {
  return [...DOCUMENT_REQUIRED_FIELD_PROFILES];
}

export function getDocumentRequiredFieldProfile(
  profileKey: string,
): DocumentRequiredFieldProfile | null {
  return DOCUMENT_REQUIRED_FIELD_PROFILE_BY_KEY.get(profileKey) ?? null;
}
