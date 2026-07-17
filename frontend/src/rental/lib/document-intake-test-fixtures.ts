import type {
  DocumentExtractionStatus,
  PublicDocumentApplyResult,
  PublicDocumentExtractionArchiveItem,
  PublicDocumentFollowUpContactPrepare,
  PublicDocumentFollowUpSuggestion,
} from './document-extraction.types';

export const INTAKE_TEST_ORG_ID = 'org-test-001';
export const INTAKE_TEST_VEHICLE_ID = 'veh-test-001';
export const INTAKE_TEST_EXTRACTION_ID = 'ext-test-001';

export const intakeReadyForReview: Partial<PublicDocumentApplyResult> = {
  lifecycleStatus: 'APPLIED',
  extractionStatus: 'APPLIED',
  summary: 'Alle Pflichtaktionen wurden erfolgreich ausgefuehrt.',
  isTerminal: true,
  applyingInProgress: false,
  requiredActionsComplete: true,
  partiallyApplied: false,
  applyFailed: false,
  canRetryFailedActions: false,
  fingerprint: 'fp-ready',
  actions: [],
};

/** Status APPLIED but apply result still running — must NOT show done UI. */
export const intakeFalseAppliedWhileApplying: {
  status: DocumentExtractionStatus;
  applyResult: PublicDocumentApplyResult;
} = {
  status: 'APPLIED',
  applyResult: {
    lifecycleStatus: 'APPLYING',
    extractionStatus: 'CONFIRMED',
    summary: 'Uebernahme laeuft',
    detailSummary: 'Nicht abbrechen',
    isTerminal: false,
    applyingInProgress: true,
    nonCancellable: true,
    requiredActionsComplete: false,
    canRetryFailedActions: false,
    partiallyApplied: false,
    applyFailed: false,
    fingerprint: 'fp-applying',
    actions: [
      {
        actionIndex: 0,
        semanticAction: 'CREATE_SERVICE_EVENT',
        labelKey: 'documentAction.CREATE_SERVICE_EVENT',
        title: 'Service anlegen',
        requirement: 'REQUIRED',
        status: 'RUNNING',
        targetModule: 'service',
        targetModuleLabel: 'Service',
        resultEntityType: null,
        resultEntityId: null,
        entityLink: null,
        errorCode: null,
        errorMessage: null,
        skippedReason: null,
      },
    ],
  },
};

export const intakePartialApplyResult: PublicDocumentApplyResult = {
  lifecycleStatus: 'PARTIALLY_APPLIED',
  extractionStatus: 'PARTIALLY_APPLIED',
  summary: 'Pflichtaktionen erledigt, optionale Aktion fehlgeschlagen',
  detailSummary: null,
  isTerminal: true,
  applyingInProgress: false,
  nonCancellable: false,
  requiredActionsComplete: true,
  canRetryFailedActions: true,
  partiallyApplied: true,
  applyFailed: false,
  fingerprint: 'fp-partial',
  actions: [
    {
      actionIndex: 0,
      semanticAction: 'CREATE_INVOICE_DRAFT',
      labelKey: 'documentAction.CREATE_INVOICE_DRAFT',
      title: 'Rechnung anlegen',
      requirement: 'REQUIRED',
      status: 'SUCCEEDED',
      targetModule: 'invoices',
      targetModuleLabel: 'Rechnungen',
      resultEntityType: 'invoice',
      resultEntityId: 'inv-1',
      entityLink: {
        entityType: 'invoice',
        entityId: 'inv-1',
        label: 'Rechnung oeffnen',
        targetModule: 'invoices',
        targetModuleLabel: 'Rechnungen',
      },
      errorCode: null,
      errorMessage: null,
      skippedReason: null,
    },
    {
      actionIndex: 1,
      semanticAction: 'SUGGEST_ENTITY_LINK',
      labelKey: 'documentAction.SUGGEST_ENTITY_LINK',
      title: 'Verknuepfung vorschlagen',
      requirement: 'OPTIONAL',
      status: 'FAILED',
      targetModule: 'documents',
      targetModuleLabel: 'Dokumente',
      resultEntityType: null,
      resultEntityId: null,
      entityLink: null,
      errorCode: 'TECHNICAL_FAILURE',
      errorMessage: 'Technischer Fehler',
      skippedReason: null,
    },
  ],
};

export const intakeFollowUpSuggestion: PublicDocumentFollowUpSuggestion = {
  suggestionId: 'sug-1',
  extractionId: INTAKE_TEST_EXTRACTION_ID,
  actionPlanId: 'plan-1',
  type: 'PREPARE_CUSTOMER_CONTACT',
  title: 'Kundenkontakt vorbereiten',
  rationale: 'Kein Kunde verknuepft.',
  suggestedDueAt: null,
  dueDateConfirmed: false,
  targetEntity: { entityType: 'customer', entityId: null, label: 'Kunde zuordnen' },
  status: 'SUGGESTED',
  generatedByRule: 'registry:MISSING_CUSTOMER',
  acceptedByUserId: null,
  resultingEntityId: null,
};

export const intakeContactPrepareDraft: PublicDocumentFollowUpContactPrepare = {
  suggestionId: 'sug-1',
  extractionId: INTAKE_TEST_EXTRACTION_ID,
  contactTarget: 'CUSTOMER',
  recipient: {
    entityType: 'customer',
    entityId: 'cust-1',
    displayName: 'Max Mustermann',
    email: 'max@example.com',
    emailSource: 'customer_record',
  },
  sender: {
    fromEmail: 'fleet@synqdrive.eu',
    fromName: 'SynqDrive Fleet',
    replyToEmail: 'noreply@synqdrive.eu',
  },
  subject: 'Rueckfrage zu Rechnung RE-2026-001',
  bodyText: 'Guten Tag, bitte pruefen Sie die angehaengte Rechnung.',
  bodyHtml: '<p>Guten Tag, bitte pruefen Sie die angehaengte Rechnung.</p>',
  documentReference: {
    extractionId: INTAKE_TEST_EXTRACTION_ID,
    fileName: 'service.pdf',
    documentType: 'SERVICE',
    documentSubtype: 'SERVICE_REPORT',
    displayLabel: 'Servicebericht service.pdf',
    referenceHint: 'RE-2026-001',
  },
  attachmentOffer: {
    extractionId: INTAKE_TEST_EXTRACTION_ID,
    fileName: 'service.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 1024,
    available: true,
    defaultSelected: false,
  },
  excludedSensitiveFields: ['iban', 'rawText'],
  preparedOnly: true,
  canSend: true,
  sendBlockedReason: null,
};

export function makeArchiveItem(
  overrides: Partial<PublicDocumentExtractionArchiveItem> = {},
): PublicDocumentExtractionArchiveItem {
  return {
    id: INTAKE_TEST_EXTRACTION_ID,
    organizationId: INTAKE_TEST_ORG_ID,
    vehicleId: INTAKE_TEST_VEHICLE_ID,
    vehicle: {
      id: INTAKE_TEST_VEHICLE_ID,
      licensePlate: 'M-SY 1',
      vin: null,
      make: 'Demo',
      model: 'Fahrzeug',
    },
    sourceFileName: 'service.pdf',
    mimeType: 'application/pdf',
    status: 'APPLIED',
    documentCategory: 'TECHNICAL',
    documentSubtype: 'SERVICE_REPORT',
    effectiveDocumentType: 'SERVICE',
    acceptedEntityLinks: [],
    actionSummary: {
      status: 'SUCCEEDED',
      lifecycleStatus: 'APPLIED',
      summary: 'Erfolgreich abgelegt',
      succeededCount: 1,
      failedCount: 0,
      pendingCount: 0,
    },
    followUpSummary: {
      status: 'NONE',
      openCount: 0,
      acceptedCount: 0,
      dismissedCount: 0,
      primaryType: null,
      primaryTitle: null,
    },
    uploader: { id: 'user-1', displayName: 'Test User' },
    invoiceNumber: null,
    caseReference: null,
    documentDate: '2026-06-01',
    uploadedAt: '2026-07-17T10:00:00.000Z',
    appliedAt: '2026-07-17T11:00:00.000Z',
    updatedAt: '2026-07-17T11:00:00.000Z',
    canDownload: true,
    ...overrides,
  };
}
