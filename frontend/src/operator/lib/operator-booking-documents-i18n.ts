/**
 * Operator Booking Documents Panel presentation adapter (P2.2.38).
 * Document type/status machine values, ordering, and API payloads stay unchanged.
 */
import {
  DEFAULT_PRODUCT_LOCALE,
  isSupportedLocale,
  type SupportedLocale,
} from '../../i18n/locales';
import { translateKey } from '../../i18n/LanguageContext';
import type { TranslationKey } from '../../i18n/translations/en';
import type { GeneratedDocumentDto } from '../../lib/api';
import type {
  OperatorBookingDocumentGroupKey,
  OperatorDocumentAvailability,
} from '../documents/operatorBookingDocuments.utils';

const BOOKING_DOCUMENT_TYPE_KEYS: Record<string, TranslationKey> = {
  BOOKING_INVOICE: 'email.docType.BOOKING_INVOICE',
  DEPOSIT_RECEIPT: 'email.docType.DEPOSIT_RECEIPT',
  RENTAL_CONTRACT: 'email.docType.RENTAL_CONTRACT',
  TERMS_AND_CONDITIONS: 'email.docType.TERMS_AND_CONDITIONS',
  WITHDRAWAL_INFORMATION: 'email.docType.WITHDRAWAL_INFORMATION',
  PRIVACY_POLICY: 'email.docType.PRIVACY_POLICY',
  HANDOVER_PICKUP: 'email.docType.HANDOVER_PICKUP',
  HANDOVER_RETURN: 'email.docType.HANDOVER_RETURN',
  FINAL_INVOICE: 'email.docType.FINAL_INVOICE',
};

const CUSTOMER_DOCUMENT_TYPE_KEYS: Record<string, TranslationKey> = {
  ID_FRONT: 'operator.bookings.documents.customerType.ID_FRONT',
  ID_BACK: 'operator.bookings.documents.customerType.ID_BACK',
  LICENSE_FRONT: 'operator.bookings.documents.customerType.LICENSE_FRONT',
  LICENSE_BACK: 'operator.bookings.documents.customerType.LICENSE_BACK',
};

const AVAILABILITY_KEYS: Record<OperatorDocumentAvailability, TranslationKey> = {
  available: 'operator.bookings.documents.availability.available',
  missing: 'operator.bookings.documents.availability.missing',
  generating: 'operator.bookings.documents.availability.generating',
  failed: 'operator.bookings.documents.availability.failed',
};

const GROUP_KEYS: Record<OperatorBookingDocumentGroupKey, TranslationKey> = {
  contractTerms: 'operator.bookings.documents.group.contractTerms',
  pickup: 'operator.bookings.documents.group.pickup',
  return: 'operator.bookings.documents.group.return',
  invoiceDeposit: 'operator.bookings.documents.group.invoiceDeposit',
};

const BOOKING_LOAD_ERROR_DE = 'Dokumente konnten nicht geladen werden';
const CUSTOMER_LOAD_ERROR_DE = 'Kundendokumente konnten nicht geladen werden';

export function resolveOperatorBookingDocumentsLocale(
  locale: string | null | undefined,
): SupportedLocale {
  return isSupportedLocale(locale) ? locale : DEFAULT_PRODUCT_LOCALE;
}

export function obd(
  locale: string,
  key: TranslationKey,
  vars?: Record<string, string | number>,
): string {
  return translateKey(resolveOperatorBookingDocumentsLocale(locale), key, vars).text;
}

export function operatorBookingDocumentsSectionTitle(
  locale: string,
  section: 'booking' | 'customer',
): string {
  return obd(
    locale,
    section === 'booking'
      ? 'operator.bookings.documents.section.booking'
      : 'operator.bookings.documents.section.customer',
  );
}

export function operatorBookingDocumentsReloadLabel(locale: string): string {
  return obd(locale, 'operator.bookings.documents.reload');
}

export function operatorBookingDocumentsBundleStatusLabel(locale: string): string {
  return obd(locale, 'operator.bookings.documents.bundleStatus');
}

export function operatorBookingDocumentsLoadingLabel(
  locale: string,
  section: 'booking' | 'customer',
): string {
  return obd(
    locale,
    section === 'booking'
      ? 'operator.bookings.documents.loading.booking'
      : 'operator.bookings.documents.loading.customer',
  );
}

export function operatorBookingDocumentsEmptyLabel(
  locale: string,
  section: 'booking' | 'customer',
): string {
  return obd(
    locale,
    section === 'booking'
      ? 'operator.bookings.documents.empty.booking'
      : 'operator.bookings.documents.empty.customer',
  );
}

export function operatorBookingDocumentsOpenLabel(locale: string): string {
  return obd(locale, 'common.open');
}

export function operatorBookingDocumentsGroupLabel(
  locale: string,
  groupKey: OperatorBookingDocumentGroupKey,
): string {
  return obd(locale, GROUP_KEYS[groupKey]);
}

export function operatorBookingDocumentsMoreGroupLabel(locale: string): string {
  return obd(locale, 'operator.bookings.documents.group.more');
}

export function operatorBookingDocumentTypeLabel(
  locale: string,
  documentType: string,
): string {
  const key = BOOKING_DOCUMENT_TYPE_KEYS[documentType];
  return key ? obd(locale, key) : documentType;
}

export function operatorBookingDocumentSlotLabel(
  locale: string,
  documentType: string,
  dynamicTitle?: string | null,
): string {
  if (dynamicTitle?.trim()) return dynamicTitle;
  const key = BOOKING_DOCUMENT_TYPE_KEYS[documentType];
  if (key) return obd(locale, key);
  if (documentType.toUpperCase().includes('DAMAGE')) {
    return operatorBookingDocumentsDamageReportDefaultLabel(locale);
  }
  return documentType;
}

export function operatorBookingDocumentAvailabilityLabel(
  locale: string,
  availability: OperatorDocumentAvailability,
): string {
  return obd(locale, AVAILABILITY_KEYS[availability]);
}

export function operatorCustomerDocumentTypeLabel(locale: string, type: string): string {
  const key = CUSTOMER_DOCUMENT_TYPE_KEYS[type];
  return key ? obd(locale, key) : type;
}

export function operatorBookingDocumentsDamageReportDefaultLabel(locale: string): string {
  return obd(locale, 'operator.bookings.documents.damageReportDefault');
}

export function operatorBookingDocumentsAiUploadTitle(locale: string): string {
  return obd(locale, 'operator.bookings.documents.aiUpload.title');
}

export function operatorBookingDocumentsAiUploadSubtitle(locale: string): string {
  return obd(locale, 'operator.bookings.documents.aiUpload.subtitle');
}

export function operatorBookingDocumentsLoadErrorLabel(
  locale: string,
  error: string | null | undefined,
  section: 'booking' | 'customer',
): string {
  if (!error) return '';
  const fallback =
    section === 'booking'
      ? obd(locale, 'operator.bookings.documents.error.bookingLoad')
      : obd(locale, 'operator.bookings.documents.error.customerLoad');
  if (error === BOOKING_LOAD_ERROR_DE || error === CUSTOMER_LOAD_ERROR_DE) {
    return fallback;
  }
  return error;
}

export function formatOperatorDocumentMeta(
  locale: string,
  doc: GeneratedDocumentDto,
): string {
  const activeLocale = resolveOperatorBookingDocumentsLocale(locale);
  return [
    doc.documentNumber || doc.fileName,
    doc.legalVersionLabel ? `v${doc.legalVersionLabel}` : null,
    doc.generatedAt || doc.createdAt
      ? new Date(doc.generatedAt || doc.createdAt).toLocaleDateString(activeLocale)
      : null,
  ]
    .filter(Boolean)
    .join(' · ');
}
