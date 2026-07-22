import type { LegalDocumentUploadWizardForm } from './legal-document-upload-wizard.types';
import { LEGAL_DOCUMENT_TYPE } from './legal-document-types';

export function toIsoDateTime(value: string): string | undefined {
  if (!value.trim()) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

export function buildLegalUploadParams(form: LegalDocumentUploadWizardForm, file: File) {
  return {
    documentType: form.documentType,
    versionLabel: form.versionLabel.trim(),
    title: form.title.trim() || undefined,
    language: form.language,
    legalVariant:
      form.documentType === LEGAL_DOCUMENT_TYPE.CONSUMER_INFORMATION
        ? form.legalVariant || undefined
        : undefined,
    changeSummary: form.changeSummary.trim() || undefined,
    legalOwnerName: form.legalOwnerName.trim() || undefined,
    jurisdictionCountry: form.jurisdictionCountry,
    customerSegment: form.customerSegment,
    bookingChannel: form.bookingChannel,
    productScope: form.productScope || undefined,
    stationScopeMode: form.stationScopeMode,
    stationIds:
      form.stationScopeMode === 'STATION_SPECIFIC' ? form.stationIds : undefined,
    isMandatory: form.isMandatory,
    validFrom: toIsoDateTime(form.validFrom),
    validUntil: toIsoDateTime(form.validUntil),
    file,
  };
}

export function isScanStatusBlocking(scanStatus: string | null | undefined): boolean {
  return Boolean(scanStatus && scanStatus !== 'SCAN_PASSED');
}

export function scanStatusErrorMessage(scanStatus: string): string {
  if (scanStatus === 'SCAN_FAILED') {
    return 'Malware-Scan fehlgeschlagen — Entwurf wurde nicht freigegeben.';
  }
  return `Malware-Scan-Status: ${scanStatus}`;
}
