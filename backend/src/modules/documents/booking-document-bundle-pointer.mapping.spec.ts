import { DOCUMENT_TYPE } from './documents.constants';
import {
  BUNDLE_LEGAL_DOCUMENT_SLOT_TYPES,
  BUNDLE_LEGAL_POINTER_FIELD,
  BUNDLE_GENERATED_POINTER_FIELD,
  assertBundlePointerField,
  bundlePointerValue,
  canonicalBundleLegalSlotType,
  isBundleLegalSlotType,
  resolveBundlePointerField,
} from './booking-document-bundle-pointer.mapping';

describe('booking-document-bundle-pointer.mapping', () => {
  it('maps all supported legal slot types to bundle pointer columns', () => {
    expect(BUNDLE_LEGAL_POINTER_FIELD[DOCUMENT_TYPE.TERMS_AND_CONDITIONS]).toBe('termsDocumentId');
    expect(BUNDLE_LEGAL_POINTER_FIELD[DOCUMENT_TYPE.CONSUMER_INFORMATION]).toBe('withdrawalDocumentId');
    expect(BUNDLE_LEGAL_POINTER_FIELD[DOCUMENT_TYPE.PRIVACY_POLICY]).toBe('privacyDocumentId');
    expect(BUNDLE_LEGAL_DOCUMENT_SLOT_TYPES).toEqual([
      DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
      DOCUMENT_TYPE.CONSUMER_INFORMATION,
      DOCUMENT_TYPE.PRIVACY_POLICY,
    ]);
  });

  it('canonicalizes legacy WITHDRAWAL_INFORMATION to consumer slot', () => {
    expect(canonicalBundleLegalSlotType(DOCUMENT_TYPE.WITHDRAWAL_INFORMATION)).toBe(
      DOCUMENT_TYPE.CONSUMER_INFORMATION,
    );
    expect(resolveBundlePointerField(DOCUMENT_TYPE.WITHDRAWAL_INFORMATION)).toBe('withdrawalDocumentId');
  });

  it('resolves generated document pointer fields', () => {
    expect(resolveBundlePointerField(DOCUMENT_TYPE.BOOKING_INVOICE)).toBe('bookingInvoiceDocumentId');
    expect(resolveBundlePointerField(DOCUMENT_TYPE.RENTAL_CONTRACT)).toBe('rentalContractDocumentId');
    expect(BUNDLE_GENERATED_POINTER_FIELD[DOCUMENT_TYPE.FINAL_INVOICE]).toBe('finalInvoiceDocumentId');
  });

  it('returns null for unmapped document types', () => {
    expect(resolveBundlePointerField('UNKNOWN_TYPE' as never)).toBeNull();
    expect(isBundleLegalSlotType(DOCUMENT_TYPE.BOOKING_INVOICE)).toBe(false);
  });

  it('assertBundlePointerField throws for unmapped types', () => {
    expect(() => assertBundlePointerField('UNKNOWN_TYPE' as never)).toThrow(
      'BUNDLE_POINTER_MAPPING_MISSING:UNKNOWN_TYPE',
    );
  });

  it('reads pointer values from bundle rows', () => {
    const bundle = {
      termsDocumentId: 't1',
      withdrawalDocumentId: 'w1',
      privacyDocumentId: 'p1',
      bookingInvoiceDocumentId: null,
      depositReceiptDocumentId: null,
      rentalContractDocumentId: null,
      pickupProtocolDocumentId: null,
      returnProtocolDocumentId: null,
      finalInvoiceDocumentId: null,
    };
    expect(bundlePointerValue(bundle, DOCUMENT_TYPE.TERMS_AND_CONDITIONS)).toBe('t1');
    expect(bundlePointerValue(bundle, DOCUMENT_TYPE.PRIVACY_POLICY)).toBe('p1');
    expect(bundlePointerValue(bundle, DOCUMENT_TYPE.WITHDRAWAL_INFORMATION)).toBe('w1');
  });
});
