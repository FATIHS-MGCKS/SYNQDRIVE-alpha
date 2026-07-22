import type { LegalDocumentDto } from '../../lib/api';
import { isLegalPdfFile } from './legal-documents.utils';
import { LEGAL_DOCUMENT_TYPE } from './legal-document-types';
import { LEGAL_UPLOAD_MAX_MB } from './legal-document-upload-wizard.constants';
import type {
  LegalDocumentUploadWizardErrors,
  LegalDocumentUploadWizardForm,
} from './legal-document-upload-wizard.types';

const VERSION_LABEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._\-+ ]{0,63}$/;

export function validateLegalUploadWizardStep(
  step: number,
  form: LegalDocumentUploadWizardForm,
  file: File | null,
  existingDocs: LegalDocumentDto[] = [],
): LegalDocumentUploadWizardErrors {
  const errors: LegalDocumentUploadWizardErrors = {};

  if (step >= 1) {
    if (!form.documentType.trim()) errors.documentType = 'Dokumenttyp ist erforderlich.';
    if (
      form.documentType === LEGAL_DOCUMENT_TYPE.CONSUMER_INFORMATION &&
      !form.legalVariant
    ) {
      errors.legalVariant = 'Dokumentvariante ist erforderlich.';
    }
    if (!form.language.trim()) errors.language = 'Sprache ist erforderlich.';
    if (!form.jurisdictionCountry.trim()) {
      errors.jurisdictionCountry = 'Jurisdiktion ist erforderlich.';
    }
    if (!form.customerSegment) errors.customerSegment = 'Kundensegment ist erforderlich.';
    if (!form.bookingChannel) errors.bookingChannel = 'Buchungskanal ist erforderlich.';
    if (!form.stationScopeMode) errors.stationScopeMode = 'Geltungsbereich ist erforderlich.';
    if (
      form.stationScopeMode === 'STATION_SPECIFIC' &&
      form.stationIds.length === 0
    ) {
      errors.stationIds = 'Mindestens eine Station auswählen.';
    }
  }

  if (step >= 2) {
    const versionLabel = form.versionLabel.trim();
    if (!versionLabel) {
      errors.versionLabel = 'Versionsbezeichnung ist erforderlich.';
    } else if (!VERSION_LABEL_PATTERN.test(versionLabel)) {
      errors.versionLabel =
        'Nur Buchstaben, Zahlen, Punkt, Bindestrich und Leerzeichen (max. 64 Zeichen).';
    } else if (isDuplicateVersionLabel(versionLabel, form, existingDocs)) {
      errors.versionLabel =
        'Diese Versionsbezeichnung existiert bereits für den gewählten Dokumenttyp.';
    }

    if (form.validFrom && form.validUntil) {
      const from = new Date(form.validFrom);
      const until = new Date(form.validUntil);
      if (!Number.isNaN(from.getTime()) && !Number.isNaN(until.getTime()) && until <= from) {
        errors.validUntil = '„Gültig bis“ muss nach „Gültig ab“ liegen.';
      }
    }
  }

  if (step >= 3) {
    if (!file) {
      errors.file = 'PDF-Datei ist erforderlich.';
    } else if (!isLegalPdfFile(file)) {
      errors.file = 'Nur PDF-Dateien sind erlaubt (inkl. iOS-Dateiauswahl ohne MIME-Typ).';
    } else if (file.size > LEGAL_UPLOAD_MAX_MB * 1024 * 1024) {
      errors.file = `Datei überschreitet ${LEGAL_UPLOAD_MAX_MB} MB.`;
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

export function parseLegalDocumentApiError(err: unknown): {
  message: string;
  field?: string;
  code?: string;
} {
  if (err instanceof Error) {
    const extended = err as Error & { field?: string; code?: string };
    return {
      message: extended.message || 'Unbekannter Fehler',
      field: extended.field,
      code: extended.code,
    };
  }
  return { message: 'Unbekannter Fehler' };
}
