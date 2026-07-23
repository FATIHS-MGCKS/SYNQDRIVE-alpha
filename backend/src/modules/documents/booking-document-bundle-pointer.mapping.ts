import type { BookingDocumentBundle } from '@prisma/client';
import { DOCUMENT_TYPE, type DocumentType } from './documents.constants';

/** Supported legal document slots on a booking bundle (Prompt 15). */
export const BUNDLE_LEGAL_DOCUMENT_SLOT_TYPES = [
  DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
  DOCUMENT_TYPE.CONSUMER_INFORMATION,
  DOCUMENT_TYPE.PRIVACY_POLICY,
] as const;

export type BundleLegalDocumentSlotType =
  (typeof BUNDLE_LEGAL_DOCUMENT_SLOT_TYPES)[number];

export const BUNDLE_LEGAL_POINTER_FIELD = {
  [DOCUMENT_TYPE.TERMS_AND_CONDITIONS]: 'termsDocumentId',
  [DOCUMENT_TYPE.CONSUMER_INFORMATION]: 'withdrawalDocumentId',
  [DOCUMENT_TYPE.PRIVACY_POLICY]: 'privacyDocumentId',
} as const satisfies Record<BundleLegalDocumentSlotType, keyof BookingDocumentBundle>;

export type BundleLegalPointerFieldName =
  (typeof BUNDLE_LEGAL_POINTER_FIELD)[BundleLegalDocumentSlotType];

/** Generated booking documents mapped to bundle pointer columns. */
export const BUNDLE_GENERATED_POINTER_FIELD = {
  [DOCUMENT_TYPE.BOOKING_INVOICE]: 'bookingInvoiceDocumentId',
  [DOCUMENT_TYPE.DEPOSIT_RECEIPT]: 'depositReceiptDocumentId',
  [DOCUMENT_TYPE.RENTAL_CONTRACT]: 'rentalContractDocumentId',
  [DOCUMENT_TYPE.HANDOVER_PICKUP]: 'pickupProtocolDocumentId',
  [DOCUMENT_TYPE.HANDOVER_RETURN]: 'returnProtocolDocumentId',
  [DOCUMENT_TYPE.FINAL_INVOICE]: 'finalInvoiceDocumentId',
} as const satisfies Partial<Record<DocumentType, keyof BookingDocumentBundle>>;

/** Legacy document types that resolve to a canonical legal slot pointer. */
export const BUNDLE_LEGAL_LEGACY_DOCUMENT_TYPE = {
  [DOCUMENT_TYPE.WITHDRAWAL_INFORMATION]: DOCUMENT_TYPE.CONSUMER_INFORMATION,
} as const satisfies Partial<Record<DocumentType, BundleLegalDocumentSlotType>>;

const ALL_POINTER_FIELDS = {
  ...BUNDLE_LEGAL_POINTER_FIELD,
  ...BUNDLE_GENERATED_POINTER_FIELD,
} as const;

export type BundlePointerFieldName =
  (typeof ALL_POINTER_FIELDS)[keyof typeof ALL_POINTER_FIELDS];

export function isBundleLegalSlotType(
  documentType: DocumentType,
): documentType is BundleLegalDocumentSlotType {
  return (BUNDLE_LEGAL_DOCUMENT_SLOT_TYPES as readonly string[]).includes(documentType);
}

export function canonicalBundleLegalSlotType(
  documentType: DocumentType,
): BundleLegalDocumentSlotType | null {
  if (isBundleLegalSlotType(documentType)) return documentType;
  const legacy =
    BUNDLE_LEGAL_LEGACY_DOCUMENT_TYPE[
      documentType as keyof typeof BUNDLE_LEGAL_LEGACY_DOCUMENT_TYPE
    ];
  return legacy ?? null;
}

export function resolveBundlePointerField(
  documentType: DocumentType,
): BundlePointerFieldName | null {
  const legalSlot = canonicalBundleLegalSlotType(documentType);
  if (legalSlot) return BUNDLE_LEGAL_POINTER_FIELD[legalSlot];
  const generated =
    BUNDLE_GENERATED_POINTER_FIELD[
      documentType as keyof typeof BUNDLE_GENERATED_POINTER_FIELD
    ];
  return generated ?? null;
}

export function assertBundlePointerField(
  documentType: DocumentType,
): BundlePointerFieldName {
  const field = resolveBundlePointerField(documentType);
  if (!field) {
    throw new Error(`BUNDLE_POINTER_MAPPING_MISSING:${documentType}`);
  }
  return field;
}

export function bundlePointerValue(
  bundle: Pick<BookingDocumentBundle, BundlePointerFieldName>,
  documentType: DocumentType,
): string | null {
  const field = resolveBundlePointerField(documentType);
  if (!field) return null;
  return (bundle[field] as string | null) ?? null;
}
