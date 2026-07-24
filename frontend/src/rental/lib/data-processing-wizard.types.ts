export type DataProcessingProcedureType =
  | 'INTERNAL_PROCESSING'
  | 'PROVIDER_ACCESS'
  | 'PARTNER_SHARING'
  | 'CONSENT'
  | 'PROCESSOR_AGREEMENT';

export type DataProcessingWizardStepId = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface DataProcessingWizardForm {
  procedureType: DataProcessingProcedureType | '';
  title: string;
  activityCode: string;
  description: string;
  purposeSummary: string;
  legalBasisType: string;
  legalReference: string;
  necessityAssessment: string;
  proportionalityAssessment: string;
  privacyNoticeVersion: string;
  purposes: string[];
  dataCategories: string[];
  dataSubjectTypes: string[];
  dataFrequency: string;
  dataVolumeScope: string;
  scopeKey: string;
  vehicleIds: string[];
  customerIds: string[];
  bookingIds: string[];
  stationIds: string[];
  processorName: string;
  recipientName: string;
  recipientCountry: string;
  thirdCountryTransfer: boolean;
  transferMechanism: string;
  dpaContractReference: string;
  requestingEntity: string;
  destination: string;
  moduleOrigin: string;
  retentionClass: string;
  retentionDurationDays: string;
  retentionStartEvent: string;
  deletionMethod: string;
  anonymizationAllowed: boolean;
  technicalOrganizationalMeasures: string;
  legalHold: boolean;
  legalHoldReason: string;
  retentionDescription: string;
  dpiaStatus: string;
  riskLevelNotes: string;
  reviewerUserId: string;
  reviewNotes: string;
  consentTextVersion: string;
  dataSubjectReference: string;
  subjectType: string;
  provider: string;
  grantedScopes: string[];
}

export type DataProcessingWizardErrors = Partial<Record<keyof DataProcessingWizardForm | '_form', string>>;

export interface DataProcessingWizardSubmitResult {
  processingActivityId: string;
  reviewSubmitted: boolean;
}

export const EMPTY_DATA_PROCESSING_WIZARD_FORM: DataProcessingWizardForm = {
  procedureType: '',
  title: '',
  activityCode: '',
  description: '',
  purposeSummary: '',
  legalBasisType: '',
  legalReference: '',
  necessityAssessment: '',
  proportionalityAssessment: '',
  privacyNoticeVersion: '',
  purposes: [],
  dataCategories: [],
  dataSubjectTypes: [],
  dataFrequency: '',
  dataVolumeScope: '',
  scopeKey: 'ORGANIZATION',
  vehicleIds: [],
  customerIds: [],
  bookingIds: [],
  stationIds: [],
  processorName: '',
  recipientName: '',
  recipientCountry: '',
  thirdCountryTransfer: false,
  transferMechanism: '',
  dpaContractReference: '',
  requestingEntity: '',
  destination: '',
  moduleOrigin: '',
  retentionClass: '',
  retentionDurationDays: '',
  retentionStartEvent: '',
  deletionMethod: '',
  anonymizationAllowed: false,
  technicalOrganizationalMeasures: '',
  legalHold: false,
  legalHoldReason: '',
  retentionDescription: '',
  dpiaStatus: 'DPIA_NOT_REQUIRED',
  riskLevelNotes: '',
  reviewerUserId: '',
  reviewNotes: '',
  consentTextVersion: '',
  dataSubjectReference: '',
  subjectType: 'CUSTOMER',
  provider: '',
  grantedScopes: [],
};
