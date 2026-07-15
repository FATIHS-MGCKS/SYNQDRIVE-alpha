import { computeMissingDocumentSlots } from './booking-document-missing-slots.util';
import {
  applicableDocumentPhases,
  bookingDocumentPackageDedupKey,
  documentPhaseForBookingStatus,
} from './booking-document-phase.util';
import { DOCUMENT_TYPE } from './documents.constants';

describe('booking-document-phase.util', () => {
  it('maps booking status to document phase', () => {
    expect(documentPhaseForBookingStatus('CONFIRMED')).toBe('CONFIRMED');
    expect(documentPhaseForBookingStatus('ACTIVE')).toBe('ACTIVE');
    expect(documentPhaseForBookingStatus('COMPLETED')).toBe('COMPLETED');
    expect(documentPhaseForBookingStatus('CANCELLED')).toBeNull();
  });

  it('returns cumulative applicable phases per status', () => {
    expect(applicableDocumentPhases('CONFIRMED')).toEqual(['CONFIRMED']);
    expect(applicableDocumentPhases('ACTIVE')).toEqual(['CONFIRMED', 'ACTIVE']);
    expect(applicableDocumentPhases('COMPLETED')).toEqual(['CONFIRMED', 'ACTIVE', 'COMPLETED']);
  });

  it('builds stable dedup keys per phase', () => {
    expect(bookingDocumentPackageDedupKey('CONFIRMED', 'bk-1')).toBe(
      'document:package:CONFIRMED:bk-1',
    );
    expect(bookingDocumentPackageDedupKey('ACTIVE', 'bk-1')).toBe(
      'document:package:ACTIVE:bk-1',
    );
  });
});

describe('computeMissingDocumentSlots', () => {
  const emptyBundle = {
    bookingInvoiceDocumentId: null,
    depositReceiptDocumentId: null,
    rentalContractDocumentId: null,
    termsDocumentId: null,
    withdrawalDocumentId: null,
    pickupProtocolDocumentId: null,
    returnProtocolDocumentId: null,
    finalInvoiceDocumentId: null,
  };

  it('lists one missing generated document with concrete label', () => {
    const missing = computeMissingDocumentSlots({
      phase: 'CONFIRMED',
      bundle: {
        ...emptyBundle,
        depositReceiptDocumentId: 'd1',
        rentalContractDocumentId: 'c1',
        termsDocumentId: 't1',
        withdrawalDocumentId: 'w1',
      },
      orgActiveLegal: {
        [DOCUMENT_TYPE.TERMS_AND_CONDITIONS]: { id: 't1' },
        [DOCUMENT_TYPE.WITHDRAWAL_INFORMATION]: { id: 'w1' },
      },
      generationError: null,
    });

    expect(missing).toHaveLength(1);
    expect(missing[0]?.documentType).toBe(DOCUMENT_TYPE.BOOKING_INVOICE);
    expect(missing[0]?.humanReadableLabel).toBe('Rechnung');
    expect(missing[0]?.configurationProblem).toBe(false);
  });

  it('lists multiple missing documents for confirmed phase', () => {
    const missing = computeMissingDocumentSlots({
      phase: 'CONFIRMED',
      bundle: emptyBundle,
      orgActiveLegal: {
        [DOCUMENT_TYPE.TERMS_AND_CONDITIONS]: { id: 't1' },
        [DOCUMENT_TYPE.WITHDRAWAL_INFORMATION]: { id: 'w1' },
      },
      generationError: null,
    });

    expect(missing.map((m) => m.documentType)).toEqual([
      DOCUMENT_TYPE.BOOKING_INVOICE,
      DOCUMENT_TYPE.DEPOSIT_RECEIPT,
      DOCUMENT_TYPE.RENTAL_CONTRACT,
      DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
      DOCUMENT_TYPE.WITHDRAWAL_INFORMATION,
    ]);
  });

  it('excludes legal slots with configuration problem from booking task', () => {
    const missing = computeMissingDocumentSlots({
      phase: 'CONFIRMED',
      bundle: emptyBundle,
      orgActiveLegal: {},
      generationError: null,
    });

    expect(missing.map((m) => m.documentType)).not.toContain(DOCUMENT_TYPE.TERMS_AND_CONDITIONS);
    expect(missing.map((m) => m.documentType)).not.toContain(DOCUMENT_TYPE.WITHDRAWAL_INFORMATION);
    expect(missing.length).toBe(3);
  });

  it('returns only active-phase delta documents on ACTIVE', () => {
    const missing = computeMissingDocumentSlots({
      phase: 'ACTIVE',
      bundle: emptyBundle,
      orgActiveLegal: {},
      generationError: null,
    });

    expect(missing).toHaveLength(1);
    expect(missing[0]?.documentType).toBe(DOCUMENT_TYPE.HANDOVER_PICKUP);
  });

  it('returns completed-phase delta documents', () => {
    const missing = computeMissingDocumentSlots({
      phase: 'COMPLETED',
      bundle: emptyBundle,
      orgActiveLegal: {},
      generationError: null,
    });

    expect(missing.map((m) => m.documentType)).toEqual([
      DOCUMENT_TYPE.HANDOVER_RETURN,
      DOCUMENT_TYPE.FINAL_INVOICE,
    ]);
  });
});
