import { OrgInvoiceStatus } from '@prisma/client';
import {
  canTransitionInvoiceStatus,
  isInvoiceIssued,
  shouldPromoteInvoiceToSentOnEmailSuccess,
  shouldRevertInvoiceSentOnEmailBounce,
  shouldUpdateInvoiceOnEmailDelivery,
  validateExternalMarkSent,
} from './invoice-status.transitions';

describe('invoice-status.transitions', () => {
  describe('issued definition', () => {
    it('treats sequenceNumber as issued', () => {
      expect(
        isInvoiceIssued({
          status: OrgInvoiceStatus.ISSUED,
          sequenceNumber: 5,
        }),
      ).toBe(true);
    });

    it('draft without sequence is not issued', () => {
      expect(
        isInvoiceIssued({
          status: OrgInvoiceStatus.DRAFT,
          sequenceNumber: null,
        }),
      ).toBe(false);
    });
  });

  describe('external mark-sent', () => {
    it('allows ISSUED outgoing invoice with sequence', () => {
      const result = validateExternalMarkSent({
        type: 'OUTGOING_MANUAL',
        status: OrgInvoiceStatus.ISSUED,
        sequenceNumber: 1,
      });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.sentAt).toBeInstanceOf(Date);
    });

    it('rejects DRAFT', () => {
      const result = validateExternalMarkSent({
        type: 'OUTGOING_MANUAL',
        status: OrgInvoiceStatus.DRAFT,
        sequenceNumber: null,
      });
      expect(result.ok).toBe(false);
    });

    it('rejects incoming invoices', () => {
      const result = validateExternalMarkSent({
        type: 'INCOMING_VENDOR',
        status: OrgInvoiceStatus.APPROVED,
        sequenceNumber: 1,
      });
      expect(result.ok).toBe(false);
    });
  });

  describe('email vs invoice status separation', () => {
    it('does not auto-promote invoice to SENT on email success', () => {
      expect(shouldPromoteInvoiceToSentOnEmailSuccess()).toBe(false);
    });

    it('does not change invoice on delivery webhook', () => {
      expect(shouldUpdateInvoiceOnEmailDelivery()).toBe(false);
    });

    it('does not revert invoice SENT on bounce', () => {
      expect(shouldRevertInvoiceSentOnEmailBounce()).toBe(false);
    });
  });

  describe('invoice status graph', () => {
    it('allows ISSUED → SENT for external mark', () => {
      expect(
        canTransitionInvoiceStatus(OrgInvoiceStatus.ISSUED, OrgInvoiceStatus.SENT),
      ).toBe(true);
    });

    it('rejects DRAFT → SENT', () => {
      expect(
        canTransitionInvoiceStatus(OrgInvoiceStatus.DRAFT, OrgInvoiceStatus.SENT),
      ).toBe(false);
    });

    it('allows payment transitions from SENT', () => {
      expect(
        canTransitionInvoiceStatus(
          OrgInvoiceStatus.SENT,
          OrgInvoiceStatus.PARTIALLY_PAID,
        ),
      ).toBe(true);
      expect(
        canTransitionInvoiceStatus(OrgInvoiceStatus.SENT, OrgInvoiceStatus.PAID),
      ).toBe(true);
    });
  });
});
