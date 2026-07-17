/** Frontend mirrors of backend document-extraction public DTOs. */

export type DocumentExtractionStatus =
  | 'PENDING'
  | 'QUEUED'
  | 'PROCESSING'
  | 'AWAITING_DOCUMENT_TYPE'
  | 'READY_FOR_REVIEW'
  | 'CONFIRMED'
  | 'APPLIED'
  | 'PARTIALLY_APPLIED'
  | 'FAILED'
  | 'REJECTED'
  | 'CANCELLED';

export type DocumentExtractionAction =
  | 'retry'
  | 'set_document_type'
  | 'reextract'
  | 'confirm'
  | 'retry_failed_actions'
  | 'delete_file'
  | 'download'
  | 'cancel';

export type DocumentExtractionStage =
  | 'UPLOAD'
  | 'STORAGE'
  | 'QUEUE'
  | 'OCR'
  | 'CLASSIFICATION'
  | 'EXTRACTION'
  | 'VALIDATION'
  | 'REVIEW'
  | 'APPLY';

export type DocumentExtractionErrorPhase =
  | 'UPLOAD'
  | 'STORAGE'
  | 'QUEUE'
  | 'OCR'
  | 'CLASSIFICATION'
  | 'EXTRACTION'
  | 'VALIDATION'
  | 'APPLY'
  | 'UNKNOWN';

export type DocumentUploadDuplicateStatus =
  | 'UNIQUE'
  | 'EXACT_DUPLICATE'
  | 'POSSIBLE_BUSINESS_DUPLICATE'
  | 'REUPLOAD_ALLOWED'
  | 'DUPLICATE_BLOCKED';

export type DocumentUploadRateLimitScope = 'organization' | 'user' | 'ip';

export type DocumentFileIdentificationStatus =
  | 'ACCEPTED'
  | 'REQUIRES_PASSWORD'
  | 'REJECTED_CORRUPT'
  | 'REJECTED_TOO_COMPLEX'
  | 'REJECTED_TOO_MANY_PAGES'
  | 'OCR_REQUIRED';

export interface UploadDuplicateEntityLinks {
  fineIds: string[];
  invoiceIds: string[];
  damageIds: string[];
  serviceEventIds: string[];
}

export interface UploadDuplicateExistingExtraction {
  id: string;
  vehicleId: string;
  organizationId: string | null;
  status: string;
  processingStage: string;
  sourceFileName: string | null;
  effectiveDocumentType: string | null;
  requestedDocumentType: string | null;
  contentSha256: string | null;
  createdAt: string;
  appliedAt: string | null;
  entityLinks: UploadDuplicateEntityLinks;
}

export interface PublicUploadDuplicate {
  status: DocumentUploadDuplicateStatus;
  relatedExtractionId: string | null;
  reuploadReason: string | null;
  existingExtraction: UploadDuplicateExistingExtraction | null;
  businessMatch: {
    matchedExtractionId: string;
    invoiceNumber?: string;
    referenceNumber?: string;
  } | null;
}

export interface DocumentExtractionMetadataOption {
  value: string;
  labelKey: string;
}

export interface DocumentExtractionMetadata {
  documentTypes: DocumentExtractionMetadataOption[];
  documentCategories: DocumentExtractionMetadataOption[];
  documentSubtypes: DocumentExtractionMetadataOption[];
  taxonomyVersion: string;
  schemaRegistryVersion: string;
  classificationOptions: DocumentExtractionMetadataOption[];
  mimeTypes: string[];
  extensions: string[];
  maxUploadBytes: number;
  maxUploadMb: number;
  statuses: DocumentExtractionMetadataOption[];
  stages: DocumentExtractionMetadataOption[];
  errorPhases: DocumentExtractionMetadataOption[];
  uploadDuplicateStatuses?: DocumentExtractionMetadataOption[];
}

export interface PublicDocumentSchemaField {
  key: string;
  label: string;
  type: string;
  enumValues?: string[];
  hint?: string;
  required?: boolean;
  sensitive?: boolean;
  uiGroup?: string;
  order?: number;
  labelKey?: string;
}

export interface PublicDocumentSubtypeSchema {
  subtype: string;
  category: string;
  schemaVersion: string;
  legacyDocumentTypes: string[];
  requiredFields: string[];
  plausibilityRules: string[];
  entityResolvers: string[];
  allowedActions: Array<{ semanticAction: string; requirement: string }>;
  followUpSuggestionRules: Array<{
    code: string;
    message: string;
    trigger: string;
    severity: string;
  }>;
  fields: PublicDocumentSchemaField[];
}

export interface DocumentSchemaRegistryResponse {
  registryVersion: string;
  subtypes: PublicDocumentSubtypeSchema[];
}

export type DocumentActionPreviewStatus =
  | 'READY'
  | 'BLOCKED'
  | 'DISABLED'
  | 'SUGGESTION'
  | 'INFORMATIONAL';

export interface PublicDocumentActionPreviewField {
  key: string;
  label: string;
  value: string;
}

export interface PublicDocumentActionPreviewIssue {
  code: string;
  message: string;
}

export interface PublicDocumentActionPreviewCard {
  semanticAction: string;
  labelKey: string;
  title: string;
  targetModule: string;
  targetModuleLabel: string;
  targetEntityType: string | null;
  targetEntityLabel: string | null;
  requirement: 'REQUIRED' | 'OPTIONAL' | 'INFORMATIONAL';
  status: DocumentActionPreviewStatus;
  sequence: number;
  writableFields: PublicDocumentActionPreviewField[];
  missingPrerequisites: PublicDocumentActionPreviewIssue[];
  conflicts: PublicDocumentActionPreviewIssue[];
  toggleable: boolean;
  enabled: boolean;
}

export interface PublicDocumentActionPlanPreview {
  planId: string | null;
  fingerprint: string;
  planVersion: number;
  planOutcome: string;
  planStatus: 'PREVIEW' | 'INVALIDATED' | 'STALE';
  summary: string;
  blocked: boolean;
  canConfirm: boolean;
  confirmBlockedReason: string | null;
  disabledOptionalActions: string[];
  actions: PublicDocumentActionPreviewCard[];
}

export type PublicDocumentApplyActionStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'SKIPPED';

export interface PublicDocumentApplyEntityLink {
  entityType: string;
  entityId: string;
  label: string;
  targetModule: string;
  targetModuleLabel: string;
}

export interface PublicDocumentApplyActionResult {
  actionIndex: number;
  semanticAction: string;
  labelKey: string;
  title: string;
  requirement: 'REQUIRED' | 'OPTIONAL' | 'INFORMATIONAL';
  status: PublicDocumentApplyActionStatus;
  targetModule: string;
  targetModuleLabel: string;
  resultEntityType: string | null;
  resultEntityId: string | null;
  entityLink: PublicDocumentApplyEntityLink | null;
  errorCode: string | null;
  errorMessage: string | null;
  skippedReason: string | null;
}

export interface PublicDocumentApplyResult {
  lifecycleStatus: string;
  extractionStatus: string;
  summary: string;
  detailSummary: string | null;
  isTerminal: boolean;
  applyingInProgress: boolean;
  nonCancellable: boolean;
  requiredActionsComplete: boolean;
  canRetryFailedActions: boolean;
  partiallyApplied: boolean;
  applyFailed: boolean;
  fingerprint: string | null;
  actions: PublicDocumentApplyActionResult[];
}

export type DocumentFollowUpSuggestionType =
  | 'CREATE_TASK'
  | 'PREPARE_CUSTOMER_CONTACT'
  | 'PREPARE_DRIVER_CONTACT'
  | 'REVIEW_DEADLINE'
  | 'VEHICLE_INSPECTION'
  | 'WORKSHOP_APPOINTMENT'
  | 'INSURANCE_REVIEW'
  | 'PAYMENT_REVIEW'
  | 'ASSIGN_RESPONSIBLE_USER'
  | 'NO_FOLLOW_UP';

export type DocumentFollowUpSuggestionStatus =
  | 'SUGGESTED'
  | 'ACCEPTED'
  | 'DISMISSED'
  | 'SUPERSEDED';

export interface PublicDocumentFollowUpSuggestion {
  suggestionId: string;
  extractionId: string;
  actionPlanId: string;
  type: DocumentFollowUpSuggestionType;
  title: string;
  rationale: string;
  suggestedDueAt: string | null;
  dueDateConfirmed?: boolean;
  targetEntity: { entityType: string; entityId?: string | null; label?: string | null } | null;
  status: DocumentFollowUpSuggestionStatus;
  generatedByRule: string;
  acceptedByUserId: string | null;
  resultingEntityId: string | null;
}

export type DocumentFollowUpContactTarget = 'CUSTOMER' | 'DRIVER' | 'VENDOR' | 'INSURANCE';

export interface PublicDocumentFollowUpContactPrepare {
  suggestionId: string;
  extractionId: string;
  contactTarget: DocumentFollowUpContactTarget;
  recipient: {
    entityType: string;
    entityId: string | null;
    displayName: string | null;
    email: string | null;
    emailSource: string;
  };
  sender: {
    fromEmail: string;
    fromName: string;
    replyToEmail: string | null;
  };
  subject: string;
  bodyText: string;
  bodyHtml: string;
  documentReference: {
    extractionId: string;
    fileName: string | null;
    documentType: string | null;
    documentSubtype: string | null;
    displayLabel: string;
    referenceHint: string | null;
  };
  attachmentOffer: {
    extractionId: string;
    fileName: string | null;
    mimeType: string | null;
    sizeBytes: number | null;
    available: boolean;
    defaultSelected: false;
  };
  excludedSensitiveFields: string[];
  preparedOnly: true;
  canSend: boolean;
  sendBlockedReason: string | null;
}

export interface PublicFieldProvenance {
  fieldKey: string;
  rawValue: unknown;
  normalizedValue: unknown;
  confidence: number | null;
  page: number | null;
  textEvidence: string | null;
  sourceType:
    | 'ai_extraction'
    | 'ai_merged'
    | 'ai_conflict'
    | 'missing'
    | 'user_correction'
    | 'user_confirmed';
  manuallyEdited: boolean;
  confirmedValue: unknown;
  confirmedBy: string | null;
  confirmedAt: string | null;
}

export interface PublicVehicleDisplay {
  id: string;
  licensePlate: string | null;
  vin: string | null;
  make: string | null;
  model: string | null;
}

export interface PublicUploadContextDisplay {
  entityType: string;
  entityId: string;
  sourceSurface: string;
  providedAt: string;
  providedByUserId: string | null;
  confirmationStatus: 'CANDIDATE';
  label: string;
  resolverStatus: 'PENDING' | 'ALIGNED' | 'CONFLICT' | 'NO_SIGNAL';
  conflicts: Array<{
    field: string;
    message: string;
    contextValue: string | null;
    resolvedValue: string | null;
    severity: 'INFO' | 'WARNING';
  }>;
}

export interface PublicVehicleCandidate {
  vehicleId: string;
  confidence: number;
  matchReasons: string[];
  conflicts: Array<{
    code: string;
    field: string;
    message: string;
    severity: 'BLOCKER' | 'WARNING';
  }>;
  rank: number;
  confirmationRequired: boolean;
}

export interface PublicBookingCandidate {
  bookingId: string;
  confidence: number;
  matchReasons: string[];
  conflicts: Array<{
    code: string;
    field: string;
    message: string;
    severity: 'BLOCKER' | 'WARNING';
  }>;
  temporalOverlap: boolean;
  rank: number;
  confirmationRequired: boolean;
}

export interface PublicCustomerCandidate {
  customerId: string;
  confidence: number;
  matchReasons: string[];
  conflicts: Array<{
    code: string;
    field: string;
    message: string;
    severity: 'BLOCKER' | 'WARNING';
  }>;
  rank: number;
  confirmationRequired: boolean;
  displayLabel: string;
}

export interface PublicDriverCandidate {
  driverCustomerId: string;
  confidence: number;
  matchReasons: string[];
  conflicts: Array<{
    code: string;
    field: string;
    message: string;
    severity: 'BLOCKER' | 'WARNING';
  }>;
  rank: number;
  confirmationRequired: boolean;
  displayLabel: string;
  driverRole: 'PRIMARY' | 'ADDITIONAL' | 'UNKNOWN';
}

export interface PublicPartnerCandidate {
  vendorId: string;
  confidence: number;
  matchReasons: string[];
  conflicts: Array<{
    code: string;
    field: string;
    message: string;
    severity: 'BLOCKER' | 'WARNING';
  }>;
  rank: number;
  confirmationRequired: boolean;
  displayLabel: string;
  partnerKind: string;
  vendorCategory: string;
}

export interface PublicPartnerNewSuggestion {
  partnerKind: string;
  confirmationRequired: true;
  displayLabel: string;
  sourceField: string;
}

export interface PublicEntityCandidateRank {
  entityType: string;
  entityId: string;
  score: number;
  confidenceLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  positiveReasons: string[];
  negativeReasons: string[];
  conflicts: Array<{
    code: string;
    field: string;
    message: string;
    severity: 'BLOCKER' | 'WARNING';
  }>;
  rank: number;
  autoSelectEligibility: boolean;
}

export interface PublicEntityCandidateRanking {
  rankingVersion: string;
  evaluatedAt: string;
  documentType: string;
  preselectionBlocked: boolean;
  preselectionBlockedReason: string | null;
  candidates: PublicEntityCandidateRank[];
}

export interface PublicDocumentExtraction {
  id: string;
  vehicleId: string | null;
  organizationId: string | null;
  uploadContext: PublicUploadContextDisplay | null;
  vehicleCandidates: PublicVehicleCandidate[] | null;
  bookingCandidates: PublicBookingCandidate[] | null;
  customerCandidates: PublicCustomerCandidate[] | null;
  driverCandidates: PublicDriverCandidate[] | null;
  partnerCandidates: PublicPartnerCandidate[] | null;
  partnerNewSuggestion: PublicPartnerNewSuggestion | null;
  entityCandidateRanking: PublicEntityCandidateRanking | null;
  vehicle: PublicVehicleDisplay | null;
  status: DocumentExtractionStatus;
  processingStage: DocumentExtractionStage;
  sourceFileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  requestedDocumentType: string | null;
  detectedDocumentType: string | null;
  effectiveDocumentType: string | null;
  documentType: string | null;
  classificationMode: 'MANUAL' | 'AUTO';
  classificationConfidence: number | null;
  documentCategory: string | null;
  documentSubtype: string | null;
  documentTaxonomyVersion: string | null;
  archiveRecommended: boolean;
  errorPhase: DocumentExtractionErrorPhase | null;
  errorCode: string | null;
  errorMessage: string | null;
  processingAttempts: number;
  extractedData: Record<string, unknown> | null;
  plausibility: unknown;
  confirmedData: unknown;
  fieldProvenance: PublicFieldProvenance[] | null;
  fieldCorrectionCount: number | null;
  queuedAt: string | null;
  appliedAt: string | null;
  createdAt: string;
  updatedAt: string;
  hasStoredFile: boolean;
  allowedActions: DocumentExtractionAction[];
  uploadDuplicateStatus?: DocumentUploadDuplicateStatus | null;
  relatedExtractionId?: string | null;
  reuploadReason?: string | null;
  uploadDuplicate?: PublicUploadDuplicate | null;
  applyResult?: PublicDocumentApplyResult | null;
}

export type PublicDocumentExtractionSummary = Omit<
  PublicDocumentExtraction,
  'extractedData' | 'confirmedData' | 'plausibility' | 'fieldProvenance'
> & {
  extractedData: null;
  confirmedData: null;
  plausibility: null;
  fieldProvenance: null;
};

export interface DocumentExtractionListResponse {
  data: PublicDocumentExtractionSummary[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export interface ActiveExtractionPointer {
  orgId: string;
  extractionId: string;
  vehicleId?: string | null;
  updatedAt: string;
}
