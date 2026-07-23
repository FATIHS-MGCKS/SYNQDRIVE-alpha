import { DOCUMENT_STATUS, DOCUMENT_TYPE } from './documents.constants';
import {
  BUNDLE_COMPLETENESS_REASON_CODE,
  BUNDLE_COMPLETENESS_STATUS,
} from './booking-document-completeness.constants';
import {
  cumulativeRequiredDocumentTypes,
  evaluateBookingDocumentCompleteness,
} from './booking-document-completeness.engine';
import type { BookingDocumentCompletenessContext } from './booking-document-completeness.types';

function baseContext(
  overrides: Partial<BookingDocumentCompletenessContext> = {},
): BookingDocumentCompletenessContext {
  return {
    organizationId: 'org-1',
    bookingId: 'bk-1',
    bookingStatus: 'CONFIRMED',
    bundle: {
      termsDocumentId: null,
      withdrawalDocumentId: null,
      privacyDocumentId: null,
      bookingInvoiceDocumentId: null,
      depositReceiptDocumentId: null,
      rentalContractDocumentId: null,
      pickupProtocolDocumentId: null,
      returnProtocolDocumentId: null,
      finalInvoiceDocumentId: null,
    },
    generatedDocuments: [],
    legalDocumentsById: new Map(),
    resolverVersion: 'resolver-v1',
    resolverConflicts: [],
    resolverMissingMandatory: [],
    resolverSelectedTypes: [],
    handoverProtocols: [],
    deliveryProofs: [],
    generationError: null,
    orgActiveLegalTypes: [],
    evaluatedAt: '2026-07-22T12:00:00.000Z',
    ...overrides,
  };
}

function legalDoc(
  id: string,
  documentType: string,
  overrides: Partial<{ integrityStatus: string; scanStatus: string; integrityUnavailable: boolean }> = {},
) {
  return {
    id,
    documentType,
    integrityStatus: 'VERIFIED',
    integrityUnavailable: false,
    scanStatus: 'SCAN_PASSED',
    ...overrides,
  };
}

describe('booking-document-completeness.engine', () => {
  it('cumulativeRequiredDocumentTypes grows with booking status', () => {
    expect(cumulativeRequiredDocumentTypes('CONFIRMED')).toEqual([
      DOCUMENT_TYPE.BOOKING_INVOICE,
      DOCUMENT_TYPE.DEPOSIT_RECEIPT,
      DOCUMENT_TYPE.RENTAL_CONTRACT,
      DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
      DOCUMENT_TYPE.CONSUMER_INFORMATION,
      DOCUMENT_TYPE.PRIVACY_POLICY,
    ]);
    expect(cumulativeRequiredDocumentTypes('ACTIVE')).toContain(DOCUMENT_TYPE.HANDOVER_PICKUP);
    expect(cumulativeRequiredDocumentTypes('COMPLETED')).toContain(DOCUMENT_TYPE.FINAL_INVOICE);
  });

  it('COMPLETE when all required documents present and healthy', () => {
    const result = evaluateBookingDocumentCompleteness(
      baseContext({
        bundle: {
          termsDocumentId: 't',
          withdrawalDocumentId: 'w',
          privacyDocumentId: 'p',
          bookingInvoiceDocumentId: 'i',
          depositReceiptDocumentId: 'd',
          rentalContractDocumentId: 'c',
          pickupProtocolDocumentId: null,
          returnProtocolDocumentId: null,
          finalInvoiceDocumentId: null,
        },
        generatedDocuments: [
          { id: 'i', documentType: DOCUMENT_TYPE.BOOKING_INVOICE, status: DOCUMENT_STATUS.GENERATED, legalDocumentId: null, sentAt: new Date() },
          { id: 'd', documentType: DOCUMENT_TYPE.DEPOSIT_RECEIPT, status: DOCUMENT_STATUS.GENERATED, legalDocumentId: null, sentAt: null },
          { id: 'c', documentType: DOCUMENT_TYPE.RENTAL_CONTRACT, status: DOCUMENT_STATUS.GENERATED, legalDocumentId: null, sentAt: null },
          { id: 't', documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS, status: DOCUMENT_STATUS.GENERATED, legalDocumentId: 'lt', sentAt: null },
          { id: 'w', documentType: DOCUMENT_TYPE.CONSUMER_INFORMATION, status: DOCUMENT_STATUS.GENERATED, legalDocumentId: 'lc', sentAt: null },
          { id: 'p', documentType: DOCUMENT_TYPE.PRIVACY_POLICY, status: DOCUMENT_STATUS.GENERATED, legalDocumentId: 'lp', sentAt: null },
        ],
        legalDocumentsById: new Map([
          ['lt', legalDoc('lt', DOCUMENT_TYPE.TERMS_AND_CONDITIONS)],
          ['lc', legalDoc('lc', DOCUMENT_TYPE.CONSUMER_INFORMATION)],
          ['lp', legalDoc('lp', DOCUMENT_TYPE.PRIVACY_POLICY)],
        ]),
        deliveryProofs: [{ generatedDocumentId: 'i', emailStatus: 'SENT' }],
      }),
    );
    expect(result.status).toBe(BUNDLE_COMPLETENESS_STATUS.COMPLETE);
    expect(result.legacyBundleStatus).toBe('COMPLETE');
    expect(result.missingItems).toHaveLength(0);
  });

  it('never COMPLETE when privacy policy missing', () => {
    const result = evaluateBookingDocumentCompleteness(
      baseContext({
        bundle: {
          termsDocumentId: 't',
          withdrawalDocumentId: 'w',
          privacyDocumentId: null,
          bookingInvoiceDocumentId: 'i',
          depositReceiptDocumentId: 'd',
          rentalContractDocumentId: 'c',
          pickupProtocolDocumentId: null,
          returnProtocolDocumentId: null,
          finalInvoiceDocumentId: null,
        },
        generatedDocuments: [
          { id: 'i', documentType: DOCUMENT_TYPE.BOOKING_INVOICE, status: DOCUMENT_STATUS.GENERATED, legalDocumentId: null, sentAt: new Date() },
          { id: 'd', documentType: DOCUMENT_TYPE.DEPOSIT_RECEIPT, status: DOCUMENT_STATUS.GENERATED, legalDocumentId: null, sentAt: null },
          { id: 'c', documentType: DOCUMENT_TYPE.RENTAL_CONTRACT, status: DOCUMENT_STATUS.GENERATED, legalDocumentId: null, sentAt: null },
          { id: 't', documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS, status: DOCUMENT_STATUS.GENERATED, legalDocumentId: 'lt', sentAt: null },
          { id: 'w', documentType: DOCUMENT_TYPE.CONSUMER_INFORMATION, status: DOCUMENT_STATUS.GENERATED, legalDocumentId: 'lc', sentAt: null },
        ],
        legalDocumentsById: new Map([
          ['lt', legalDoc('lt', DOCUMENT_TYPE.TERMS_AND_CONDITIONS)],
          ['lc', legalDoc('lc', DOCUMENT_TYPE.CONSUMER_INFORMATION)],
        ]),
        deliveryProofs: [{ generatedDocumentId: 'i', emailStatus: 'SENT' }],
      }),
    );
    expect(result.status).not.toBe(BUNDLE_COMPLETENESS_STATUS.COMPLETE);
    expect(result.legal.privacy.present).toBe(false);
  });

  it('never COMPLETE when consumer information missing', () => {
    const result = evaluateBookingDocumentCompleteness(
      baseContext({
        generatedDocuments: [
          { id: 't', documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS, status: DOCUMENT_STATUS.GENERATED, legalDocumentId: 'lt', sentAt: null },
          { id: 'p', documentType: DOCUMENT_TYPE.PRIVACY_POLICY, status: DOCUMENT_STATUS.GENERATED, legalDocumentId: 'lp', sentAt: null },
        ],
        legalDocumentsById: new Map([
          ['lt', legalDoc('lt', DOCUMENT_TYPE.TERMS_AND_CONDITIONS)],
          ['lp', legalDoc('lp', DOCUMENT_TYPE.PRIVACY_POLICY)],
        ]),
      }),
    );
    expect(result.status).toBe(BUNDLE_COMPLETENESS_STATUS.INCOMPLETE);
    expect(result.legal.consumer.present).toBe(false);
  });

  it('INTEGRITY_FAILED when attached legal doc has checksum mismatch', () => {
    const result = evaluateBookingDocumentCompleteness(
      baseContext({
        bundle: { termsDocumentId: 't', withdrawalDocumentId: null, privacyDocumentId: null, bookingInvoiceDocumentId: null, depositReceiptDocumentId: null, rentalContractDocumentId: null, pickupProtocolDocumentId: null, returnProtocolDocumentId: null, finalInvoiceDocumentId: null },
        generatedDocuments: [
          { id: 't', documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS, status: DOCUMENT_STATUS.GENERATED, legalDocumentId: 'lt', sentAt: null },
        ],
        legalDocumentsById: new Map([
          ['lt', legalDoc('lt', DOCUMENT_TYPE.TERMS_AND_CONDITIONS, { integrityStatus: 'CHECKSUM_MISMATCH' })],
        ]),
      }),
    );
    expect(result.status).toBe(BUNDLE_COMPLETENESS_STATUS.INTEGRITY_FAILED);
    expect(result.blockingReasons.some((r) => r.code === BUNDLE_COMPLETENESS_REASON_CODE.INTEGRITY_CHECKSUM_MISMATCH)).toBe(true);
  });

  it('BLOCKED on resolver conflict', () => {
    const result = evaluateBookingDocumentCompleteness(
      baseContext({
        resolverConflicts: [
          { documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS, reason: 'OVERLAPPING_SCOPE_SAME_PRIORITY' },
        ],
      }),
    );
    expect(result.status).toBe(BUNDLE_COMPLETENESS_STATUS.BLOCKED);
  });

  it('BLOCKED on generation error', () => {
    const result = evaluateBookingDocumentCompleteness(
      baseContext({ generationError: 'render failed' }),
    );
    expect(result.status).toBe(BUNDLE_COMPLETENESS_STATUS.BLOCKED);
    expect(result.blockingReasons[0]?.code).toBe(BUNDLE_COMPLETENESS_REASON_CODE.GENERATION_FAILED);
  });

  it('GENERATING when required doc is DRAFT', () => {
    const result = evaluateBookingDocumentCompleteness(
      baseContext({
        generatedDocuments: [
          { id: 'i', documentType: DOCUMENT_TYPE.BOOKING_INVOICE, status: DOCUMENT_STATUS.DRAFT, legalDocumentId: null, sentAt: null },
        ],
      }),
    );
    expect(result.status).toBe(BUNDLE_COMPLETENESS_STATUS.GENERATING);
  });

  it('DELIVERY_PENDING for ACTIVE booking when invoice not delivered', () => {
    const result = evaluateBookingDocumentCompleteness(
      baseContext({
        bookingStatus: 'ACTIVE',
        bundle: {
          termsDocumentId: null,
          withdrawalDocumentId: null,
          privacyDocumentId: null,
          bookingInvoiceDocumentId: 'i',
          depositReceiptDocumentId: null,
          rentalContractDocumentId: null,
          pickupProtocolDocumentId: null,
          returnProtocolDocumentId: null,
          finalInvoiceDocumentId: null,
        },
        generatedDocuments: [
          { id: 'i', documentType: DOCUMENT_TYPE.BOOKING_INVOICE, status: DOCUMENT_STATUS.GENERATED, legalDocumentId: null, sentAt: null },
        ],
        handoverProtocols: [{ kind: 'PICKUP', documentsAcknowledged: true }],
      }),
    );
    expect(result.status).toBe(BUNDLE_COMPLETENESS_STATUS.DELIVERY_PENDING);
    expect(result.nonBlockingWarnings.some((w) => w.code === BUNDLE_COMPLETENESS_REASON_CODE.DELIVERY_PROOF_MISSING)).toBe(true);
  });

  it('ACKNOWLEDGMENT_PENDING when pickup protocol not acknowledged', () => {
    const result = evaluateBookingDocumentCompleteness(
      baseContext({
        bookingStatus: 'ACTIVE',
        handoverProtocols: [{ kind: 'PICKUP', documentsAcknowledged: false }],
      }),
    );
    expect(result.status).toBe(BUNDLE_COMPLETENESS_STATUS.ACKNOWLEDGMENT_PENDING);
  });

  it('excludes scope-exempt legal slots from phase missing tasks', () => {
    const result = evaluateBookingDocumentCompleteness(
      baseContext({
        orgActiveLegalTypes: [],
      }),
    );
    const confirmedPhase = result.phases.find((p) => p.phase === 'CONFIRMED');
    expect(confirmedPhase?.missingDocuments.map((m) => m.documentType)).not.toContain(
      DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
    );
    expect(result.orgConfigurationGaps).toContain(DOCUMENT_TYPE.TERMS_AND_CONDITIONS);
  });

  it('INCOMPLETE for missing operational documents', () => {
    const result = evaluateBookingDocumentCompleteness(
      baseContext({
        resolverMissingMandatory: [],
        generatedDocuments: [
          { id: 't', documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS, status: DOCUMENT_STATUS.GENERATED, legalDocumentId: 'lt', sentAt: null },
          { id: 'w', documentType: DOCUMENT_TYPE.CONSUMER_INFORMATION, status: DOCUMENT_STATUS.GENERATED, legalDocumentId: 'lc', sentAt: null },
          { id: 'p', documentType: DOCUMENT_TYPE.PRIVACY_POLICY, status: DOCUMENT_STATUS.GENERATED, legalDocumentId: 'lp', sentAt: null },
        ],
        legalDocumentsById: new Map([
          ['lt', legalDoc('lt', DOCUMENT_TYPE.TERMS_AND_CONDITIONS)],
          ['lc', legalDoc('lc', DOCUMENT_TYPE.CONSUMER_INFORMATION)],
          ['lp', legalDoc('lp', DOCUMENT_TYPE.PRIVACY_POLICY)],
        ]),
      }),
    );
    expect(result.status).toBe(BUNDLE_COMPLETENESS_STATUS.INCOMPLETE);
    expect(result.missingItems.some((m) => m.documentType === DOCUMENT_TYPE.BOOKING_INVOICE)).toBe(true);
  });

  it('is idempotent for identical context', () => {
    const ctx = baseContext();
    const a = evaluateBookingDocumentCompleteness(ctx);
    const b = evaluateBookingDocumentCompleteness(ctx);
    expect(a).toEqual(b);
  });

  it('includes resolverVersion and evaluatedAt', () => {
    const result = evaluateBookingDocumentCompleteness(baseContext());
    expect(result.resolverVersion).toBe('resolver-v1');
    expect(result.evaluatedAt).toBe('2026-07-22T12:00:00.000Z');
  });

  it('COMPLETED booking requires return and final invoice', () => {
    const result = evaluateBookingDocumentCompleteness(
      baseContext({ bookingStatus: 'COMPLETED' }),
    );
    expect(result.cumulativeRequiredTypes).toContain(DOCUMENT_TYPE.HANDOVER_RETURN);
    expect(result.cumulativeRequiredTypes).toContain(DOCUMENT_TYPE.FINAL_INVOICE);
    expect(result.status).toBe(BUNDLE_COMPLETENESS_STATUS.INCOMPLETE);
  });

  it('BLOCKED when legal scan not passed', () => {
    const result = evaluateBookingDocumentCompleteness(
      baseContext({
        generatedDocuments: [
          { id: 'p', documentType: DOCUMENT_TYPE.PRIVACY_POLICY, status: DOCUMENT_STATUS.GENERATED, legalDocumentId: 'lp', sentAt: null },
        ],
        legalDocumentsById: new Map([
          ['lp', legalDoc('lp', DOCUMENT_TYPE.PRIVACY_POLICY, { scanStatus: 'SCAN_FAILED' })],
        ]),
      }),
    );
    expect(result.status).toBe(BUNDLE_COMPLETENESS_STATUS.BLOCKED);
    expect(result.blockingReasons.some((r) => r.code === BUNDLE_COMPLETENESS_REASON_CODE.SCAN_NOT_PASSED)).toBe(true);
  });
});
