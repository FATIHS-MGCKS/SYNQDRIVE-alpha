import {
  OrgInvoiceProcessEntityType,
  OrgInvoiceProcessType,
} from '@prisma/client';
import { BUNDLE_STATUS } from '@modules/documents/documents.constants';
import { InvoiceProcessReconciliationService } from './invoice-process-reconciliation.service';
import { InvoiceProcessOutboxService } from './invoice-process-outbox.service';

describe('InvoiceProcessReconciliationService', () => {
  const config = { emailStuckSendingMinutes: 30 };
  const prisma = {
    booking: { findMany: jest.fn() },
    orgInvoice: { findFirst: jest.fn(), findMany: jest.fn() },
    bookingDocumentBundle: { findMany: jest.fn() },
    generatedDocument: { findMany: jest.fn() },
    outboundEmail: { findMany: jest.fn() },
  };
  const outbox = { enqueue: jest.fn() };

  let service: InvoiceProcessReconciliationService;

  beforeEach(() => {
    jest.clearAllMocks();
    outbox.enqueue.mockResolvedValue({ id: 'proc-1' });
    service = new InvoiceProcessReconciliationService(
      config as never,
      prisma as never,
      outbox as unknown as InvoiceProcessOutboxService,
    );
  });

  it('detects booking without invoice and enqueues repair', async () => {
    prisma.booking.findMany.mockResolvedValue([{ id: 'bk-1' }]);
    prisma.orgInvoice.findFirst.mockResolvedValue(null);
    prisma.bookingDocumentBundle.findMany.mockResolvedValue([]);
    prisma.generatedDocument.findMany.mockResolvedValue([]);
    prisma.outboundEmail.findMany.mockResolvedValue([]);
    prisma.orgInvoice.findMany.mockResolvedValue([]);

    const report = await service.runForOrganization('org-a');

    expect(report.findingsCount).toBeGreaterThanOrEqual(1);
    expect(outbox.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        processType: OrgInvoiceProcessType.BOOKING_INVOICE_CREATE,
        entityId: 'bk-1',
      }),
    );
  });

  it('detects paid invoice with open tasks', async () => {
    prisma.booking.findMany.mockResolvedValue([]);
    prisma.bookingDocumentBundle.findMany.mockResolvedValue([]);
    prisma.generatedDocument.findMany.mockResolvedValue([]);
    prisma.outboundEmail.findMany.mockResolvedValue([]);
    prisma.orgInvoice.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'inv-paid', paidCents: 100, payments: [] }])
      .mockResolvedValueOnce([{ id: 'inv-paid' }]);

    const report = await service.runForOrganization('org-a');

    expect(report.findings.some((f) => f.kind === 'paid_invoice_open_task')).toBe(true);
    expect(outbox.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        processType: OrgInvoiceProcessType.LINKED_TASK_UPDATE,
        entityType: OrgInvoiceProcessEntityType.INVOICE,
      }),
    );
  });

  it('detects complete bundle without invoice document', async () => {
    prisma.booking.findMany.mockResolvedValue([]);
    prisma.bookingDocumentBundle.findMany.mockResolvedValue([
      { bookingId: 'bk-2', status: BUNDLE_STATUS.COMPLETE },
    ]);
    prisma.orgInvoice.findFirst.mockResolvedValue({ id: 'inv-2' });
    prisma.generatedDocument.findMany.mockResolvedValue([]);
    prisma.outboundEmail.findMany.mockResolvedValue([]);
    prisma.orgInvoice.findMany.mockResolvedValue([]);

    const report = await service.runForOrganization('org-a');

    expect(report.findings.some((f) => f.kind === 'invoice_without_document')).toBe(true);
  });
});
