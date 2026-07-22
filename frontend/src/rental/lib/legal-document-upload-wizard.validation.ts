import type { LegalDocumentDto } from '../../lib/api';
import { isLegalPdfFile } from './legal-documents.utils';
import { LEGAL_DOCUMENT_TYPE } from './legal-document-types';
import { LEGAL_UPLOAD_MAX_MB } from './legal-document-upload-wizard.constants';
import type {
  LegalDocumentUploadWizardErrors,
  LegalDocumentUploadWizardForm,
} from './legal-document-upload-wizard.types';
import type { LegalDocumentsTranslate } from './legal-documents-i18n';

const VERSION_LABEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._\-+ ]{0,63}$/;

export function validateLegalUploadWizardStep(
  step: number,
  form: LegalDocumentUploadWizardForm,
  file: File | null,
  t: LegalDocumentsTranslate,
  existingDocs: LegalDocumentDto[] = [],
): LegalDocumentUploadWizardErrors {
  const errors: LegalDocumentUploadWizardErrors = {};

  if (step >= 1) {
    if (!form.documentType.trim()) errors.documentType = t('legalDocuments.validation.documentTypeRequired');
    if (
      form.documentType === LEGAL_DOCUMENT_TYPE.CONSUMER_INFORMATION &&
      !form.legalVariant
    ) {
      errors.legalVariant = t('legalDocuments.validation.variantRequired');
    }
    if (!form.language.trim()) errors.language = t('legalDocuments.validation.languageRequired');
    if (!form.jurisdictionCountry.trim()) {
      errors.jurisdictionCountry = t('legalDocuments.validation.jurisdictionRequired');
    }
    if (!form.customerSegment) errors.customerSegment = t('legalDocuments.validation.customerSegmentRequired');
    if (!form.bookingChannel) errors.bookingChannel = t('legalDocuments.validation.bookingChannelRequired');
    if (!form.stationScopeMode) errors.stationScopeMode = t('legalDocuments.validation.stationScopeRequired');
    if (
      form.stationScopeMode === 'STATION_SPECIFIC' &&
      form.stationIds.length === 0
    ) {
      errors.stationIds = t('legalDocuments.validation.stationIdsRequired');
    }
  }

  if (step >= 2) {
    const versionLabel = form.versionLabel.trim();
    if (!versionLabel) {
      errors.versionLabel = t('legalDocuments.validation.versionLabelRequired');
    } else if (!VERSION_LABEL_PATTERN.test(versionLabel)) {
      errors.versionLabel = t('legalDocuments.validation.versionLabelFormat');
    } else if (isDuplicateVersionLabel(versionLabel, form, existingDocs)) {
      errors.versionLabel = t('legalDocuments.validation.versionLabelDuplicate');
    }

    if (form.validFrom && form.validUntil) {
      const from = new Date(form.validFrom);
      const until = new Date(form.validUntil);
      if (!Number.isNaN(from.getTime()) && !Number.isNaN(until.getTime()) && until <= from) {
        errors.validUntil = t('legalDocuments.validation.validUntilAfterFrom');
      }
    }
  }

  if (step >= 3) {
    if (!file) {
      errors.file = t('legalDocuments.validation.fileRequired');
    } else if (!isLegalPdfFile(file)) {
      errors.file = t('legalDocuments.validation.filePdfOnly');
    } else if (file.size > LEGAL_UPLOAD_MAX_MB * 1024 * 1024) {
      errors.file = t('legalDocuments.validation.fileTooLarge', { maxMb: LEGAL_UPLOAD_MAX_MB });
    }
  }

  return errors;
}

export function isDuplicateVersionLabel(
  versionLabel: string,
  form: LegalDocumentUploadWizardForm,
  existingDocs: LegalDocumentDto[],
): boolean {
  const normalized = versionLabel.trim().toLowerCase();
  return existingDocs.some(
    (doc) =>
      doc.documentType === form.documentType &&
      doc.versionLabel.trim().toLowerCase() === normalized &&
      doc.status !== 'ARCHIVED' &&
      doc.status !== 'REVOKED',
  );
}

export function hasValidationErrors(errors: LegalDocumentUploadWizardErrors): boolean {
  return Object.keys(errors).length > 0;
}

export function parseLegalDocumentApiError(
  err: unknown,
  t: LegalDocumentsTranslate,
): {
  message: string;
  field?: string;
  code?: string;
} {
  if (err instanceof Error) {
    const extended = err as Error & { field?: string; code?: string };
    return {
      message: extended.message || t('legalDocuments.error.unknown'),
      field: extended.field,
      code: extended.code,
    };
  }
  return { message: t('legalDocuments.error.unknown') };
}
