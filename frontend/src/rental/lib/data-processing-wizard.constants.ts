import type { DataProcessingProcedureType, DataProcessingWizardStepId } from './data-processing-wizard.types';

export const DATA_PROCESSING_WIZARD_STEPS: Array<{
  id: DataProcessingWizardStepId;
  labelKey: string;
}> = [
  { id: 1, labelKey: 'dataProcessing.wizard.steps.procedureType' },
  { id: 2, labelKey: 'dataProcessing.wizard.steps.purposeLegal' },
  { id: 3, labelKey: 'dataProcessing.wizard.steps.dataSubjects' },
  { id: 4, labelKey: 'dataProcessing.wizard.steps.resources' },
  { id: 5, labelKey: 'dataProcessing.wizard.steps.recipients' },
  { id: 6, labelKey: 'dataProcessing.wizard.steps.retention' },
  { id: 7, labelKey: 'dataProcessing.wizard.steps.riskReview' },
];

export const DATA_PROCESSING_PROCEDURE_TYPES: Array<{
  value: DataProcessingProcedureType;
  labelKey: string;
  descriptionKey: string;
  permissionKey: keyof import('./data-processing-permissions').DataProcessingPermissions;
}> = [
  {
    value: 'INTERNAL_PROCESSING',
    labelKey: 'dataProcessing.wizard.procedure.internal',
    descriptionKey: 'dataProcessing.wizard.procedure.internalHint',
    permissionKey: 'canCreateInternal',
  },
  {
    value: 'PROVIDER_ACCESS',
    labelKey: 'dataProcessing.wizard.procedure.provider',
    descriptionKey: 'dataProcessing.wizard.procedure.providerHint',
    permissionKey: 'canCreateProvider',
  },
  {
    value: 'PARTNER_SHARING',
    labelKey: 'dataProcessing.wizard.procedure.partner',
    descriptionKey: 'dataProcessing.wizard.procedure.partnerHint',
    permissionKey: 'canCreatePartnerSharing',
  },
  {
    value: 'CONSENT',
    labelKey: 'dataProcessing.wizard.procedure.consent',
    descriptionKey: 'dataProcessing.wizard.procedure.consentHint',
    permissionKey: 'canCreateConsent',
  },
  {
    value: 'PROCESSOR_AGREEMENT',
    labelKey: 'dataProcessing.wizard.procedure.processor',
    descriptionKey: 'dataProcessing.wizard.procedure.processorHint',
    permissionKey: 'canCreateProcessor',
  },
];

export const LEGAL_BASIS_TYPE_OPTIONS = [
  { value: 'CONTRACT', labelKey: 'dataProcessing.wizard.legalBasis.CONTRACT' },
  { value: 'LEGAL_OBLIGATION', labelKey: 'dataProcessing.wizard.legalBasis.LEGAL_OBLIGATION' },
  { value: 'LEGITIMATE_INTERESTS', labelKey: 'dataProcessing.wizard.legalBasis.LEGITIMATE_INTERESTS' },
  { value: 'CONSENT', labelKey: 'dataProcessing.wizard.legalBasis.CONSENT' },
  { value: 'VITAL_INTERESTS', labelKey: 'dataProcessing.wizard.legalBasis.VITAL_INTERESTS' },
  { value: 'PUBLIC_TASK', labelKey: 'dataProcessing.wizard.legalBasis.PUBLIC_TASK' },
  { value: 'OTHER_WITH_LEGAL_REFERENCE', labelKey: 'dataProcessing.wizard.legalBasis.OTHER_WITH_LEGAL_REFERENCE' },
] as const;

export const DATA_SUBJECT_TYPE_OPTIONS = [
  { value: 'CUSTOMER', labelKey: 'dataProcessing.wizard.subjectType.CUSTOMER' },
  { value: 'DRIVER', labelKey: 'dataProcessing.wizard.subjectType.DRIVER' },
  { value: 'EMPLOYEE', labelKey: 'dataProcessing.wizard.subjectType.EMPLOYEE' },
  { value: 'VEHICLE_OWNER', labelKey: 'dataProcessing.wizard.subjectType.VEHICLE_OWNER' },
  { value: 'OTHER', labelKey: 'dataProcessing.wizard.subjectType.OTHER' },
] as const;

export const DATA_FREQUENCY_OPTIONS = [
  { value: 'ONE_OFF', labelKey: 'dataProcessing.wizard.frequency.ONE_OFF' },
  { value: 'OCCASIONAL', labelKey: 'dataProcessing.wizard.frequency.OCCASIONAL' },
  { value: 'REGULAR', labelKey: 'dataProcessing.wizard.frequency.REGULAR' },
  { value: 'CONTINUOUS', labelKey: 'dataProcessing.wizard.frequency.CONTINUOUS' },
] as const;

export const RETENTION_CLASS_OPTIONS = [
  { value: 'OPERATIONAL', labelKey: 'dataProcessing.wizard.retentionClass.OPERATIONAL' },
  { value: 'TELEMETRY', labelKey: 'dataProcessing.wizard.retentionClass.TELEMETRY' },
  { value: 'ANALYTICS', labelKey: 'dataProcessing.wizard.retentionClass.ANALYTICS' },
  { value: 'AUDIT_EVIDENCE', labelKey: 'dataProcessing.wizard.retentionClass.AUDIT_EVIDENCE' },
  { value: 'LEGAL_EVIDENCE', labelKey: 'dataProcessing.wizard.retentionClass.LEGAL_EVIDENCE' },
  { value: 'CUSTOMER_DATA', labelKey: 'dataProcessing.wizard.retentionClass.CUSTOMER_DATA' },
  { value: 'FINANCIAL', labelKey: 'dataProcessing.wizard.retentionClass.FINANCIAL' },
] as const;

export const RETENTION_START_EVENT_OPTIONS = [
  { value: 'PROCESSING_START', labelKey: 'dataProcessing.wizard.retentionStart.PROCESSING_START' },
  { value: 'PROCESSING_END', labelKey: 'dataProcessing.wizard.retentionStart.PROCESSING_END' },
  { value: 'CONSENT_WITHDRAWAL', labelKey: 'dataProcessing.wizard.retentionStart.CONSENT_WITHDRAWAL' },
  { value: 'CONTRACT_END', labelKey: 'dataProcessing.wizard.retentionStart.CONTRACT_END' },
  { value: 'LAST_ACTIVITY', labelKey: 'dataProcessing.wizard.retentionStart.LAST_ACTIVITY' },
  { value: 'MANUAL_ANCHOR', labelKey: 'dataProcessing.wizard.retentionStart.MANUAL_ANCHOR' },
] as const;

export const DELETION_METHOD_OPTIONS = [
  { value: 'HARD_DELETE', labelKey: 'dataProcessing.wizard.deletion.HARD_DELETE' },
  { value: 'ANONYMIZE', labelKey: 'dataProcessing.wizard.deletion.ANONYMIZE' },
  { value: 'REDACT', labelKey: 'dataProcessing.wizard.deletion.REDACT' },
  { value: 'ARCHIVE_THEN_DELETE', labelKey: 'dataProcessing.wizard.deletion.ARCHIVE_THEN_DELETE' },
] as const;

export const DPIA_STATUS_OPTIONS = [
  { value: 'DPIA_NOT_REQUIRED', labelKey: 'dataProcessing.wizard.dpia.DPIA_NOT_REQUIRED' },
  { value: 'DPIA_REQUIRED', labelKey: 'dataProcessing.wizard.dpia.DPIA_REQUIRED' },
  { value: 'DPIA_IN_PROGRESS', labelKey: 'dataProcessing.wizard.dpia.DPIA_IN_PROGRESS' },
  { value: 'DPIA_APPROVED', labelKey: 'dataProcessing.wizard.dpia.DPIA_APPROVED' },
  { value: 'DPIA_REJECTED', labelKey: 'dataProcessing.wizard.dpia.DPIA_REJECTED' },
  { value: 'DPIA_REVIEW_DUE', labelKey: 'dataProcessing.wizard.dpia.DPIA_REVIEW_DUE' },
] as const;

export const TRANSFER_MECHANISM_OPTIONS = [
  { value: 'ADEQUACY_DECISION', labelKey: 'dataProcessing.wizard.transfer.ADEQUACY_DECISION' },
  { value: 'STANDARD_CONTRACTUAL_CLAUSES', labelKey: 'dataProcessing.wizard.transfer.STANDARD_CONTRACTUAL_CLAUSES' },
  { value: 'BINDING_CORPORATE_RULES', labelKey: 'dataProcessing.wizard.transfer.BINDING_CORPORATE_RULES' },
  { value: 'EXPLICIT_CONSENT', labelKey: 'dataProcessing.wizard.transfer.EXPLICIT_CONSENT' },
  { value: 'OTHER_SAFEGUARD', labelKey: 'dataProcessing.wizard.transfer.OTHER_SAFEGUARD' },
  { value: 'NO_TRANSFER', labelKey: 'dataProcessing.wizard.transfer.NO_TRANSFER' },
] as const;

export const PROVIDER_SCOPE_SUGGESTIONS = ['TELEMETRY', 'LOCATION', 'TRIPS', 'HEALTH', 'COMMANDS'] as const;
