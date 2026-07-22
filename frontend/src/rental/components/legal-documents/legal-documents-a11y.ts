/** Stable DOM ids and screen-reader labels for Kunden-Rechtstexte. */

export const LEGAL_DOCS_MAIN_ID = 'legal-documents-main';
export const LEGAL_DOCS_HEADING_ID = 'legal-documents-page-heading';

export const LEGAL_VERSION_HISTORY_REGION_ID = 'legal-version-histories-region';

export function legalUploadFieldErrorId(field: string): string {
  return `legal-upload-field-error-${field}`;
}

export function legalLifecycleFieldErrorId(field: string): string {
  return `legal-lifecycle-field-error-${field}`;
}

export const LEGAL_UPLOAD_ERROR_SUMMARY_ID = 'legal-upload-error-summary';
export const LEGAL_LIFECYCLE_ERROR_SUMMARY_ID = 'legal-lifecycle-error-summary';
export const LEGAL_UPLOAD_PROGRESS_STATUS_ID = 'legal-upload-progress-status';

export const LEGAL_PDF_PREVIEW_TITLE = 'PDF-Vorschau des Rechtstexts';
