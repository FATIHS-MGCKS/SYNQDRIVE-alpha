import type { LegalDocumentDto } from '../../lib/api';
import type { ConsumerInformationVariant } from './legal-document-types';

export interface LegalDocumentUploadWizardForm {
  documentType: string;
  legalVariant: ConsumerInformationVariant | '';
  language: string;
  jurisdictionCountry: string;
  customerSegment: string;
  bookingChannel: string;
  stationScopeMode: string;
  stationIds: string[];
  productScope: string;
  isMandatory: boolean;
  versionLabel: string;
  title: string;
  validFrom: string;
  validUntil: string;
  changeSummary: string;
  legalOwnerName: string;
}

export type LegalDocumentUploadWizardErrors = Partial<Record<keyof LegalDocumentUploadWizardForm | 'file', string>>;

export interface LegalDocumentUploadWizardSubmitMode {
  kind: 'draft' | 'review';
}

export interface LegalDocumentUploadWizardResult {
  document: LegalDocumentDto;
  submittedForReview: boolean;
}

export const EMPTY_LEGAL_UPLOAD_WIZARD_FORM: LegalDocumentUploadWizardForm = {
  documentType: '',
  legalVariant: '',
  language: 'de',
  jurisdictionCountry: 'DE',
  customerSegment: 'BOTH',
  bookingChannel: 'ALL',
  stationScopeMode: 'ORGANIZATION_WIDE',
  stationIds: [],
  productScope: '',
  isMandatory: true,
  versionLabel: '',
  title: '',
  validFrom: '',
  validUntil: '',
  changeSummary: '',
  legalOwnerName: '',
};
