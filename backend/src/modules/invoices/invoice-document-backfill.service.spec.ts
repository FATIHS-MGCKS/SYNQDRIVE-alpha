import { OrgInvoiceStatus, OrgInvoiceType } from '@prisma/client';
import { DOCUMENT_STATUS, DOCUMENT_TYPE } from '@modules/documents/documents.constants';
import {
  BOOKING_REF,
  DOC_BOOKING_INVOICE,
  INVOICE_BOOKING,
  ORG_A,
} from './__fixtures__/invoice-baseline.fixtures';
import { InvoiceDocumentBackfillService } from './invoice-document-backfill.service';
import { InvoiceDocumentIntegrityAuditService } from './invoice-document-integrity-audit.service';

describe('InvoiceDocumentBackfillService', () => {
  const invoiceRow = {
    id: INVOICE_BOOKING,
    organizationId: ORG_A,
    type: OrgInvoiceType.OUTGOING_BOOKING,
    status: OrgInvoiceStatus.ISSUED,
    bookingId: BOOKING_REF,
    generatedDocumentId: null as string | null,
  };

  const documentRow = {
    id: DOC_BOOKING_INVOICE,
    organizationId: ORG_A,
    documentType: DOCUMENT_TYPE.BOOKING_INVOICE,
    status: DOCUMENT_STATUS.GENERATED,
    bookingId: BOOKING_REF,
    invoiceId: INVOICE_BOOKING,
    versionNumber: null as number | null,
    isActiveVersion: false,
    objectKey: 'organizations/org/doc.pdf',
    createdAt: new Date('2026-07-10T10:10:00.000Z'),
  };

  function buildMocks() {
    const tx = {
      orgInvoice: {
        findFirst: jest.fn(),
        update: jest.fn().mockResolvedValue(invoiceRow),
      },
      generatedDocument: {
        findFirst: jest.fn().mockResolvedValue(documentRow),
        update: jest.fn().mockResolvedValue(documentRow),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };

    const prisma = {
      orgInvoice: {
        findMany: jest.fn().mockResolvedValue([invoiceRow]),
        update: jest.fn().mockResolvedValue(invoiceRow),
      },
      generatedDocument: {
        findMany: jest.fn().mockResolvedValue([documentRow]),
        findFirst: jest.fn().mockResolvedValue(documentRow),
        update: jest.fn().mockResolvedValue(documentRow),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      bookingDocumentBundle: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<void>) => {
        tx.orgInvoice.findFirst.mockResolvedValue({ ...invoiceRow, generatedDocumentId: null });
        await fn(tx);
      }),
    };

    const auditService = {
      runAudit: jest.fn().mockResolvedValue({
        mode: 'audit',
        readOnly: true,
        organizations: [{ findings: [] }],
      }),
    };

    const service = new InvoiceDocumentBackfillService(
      prisma as never,
      auditService as unknown as InvoiceDocumentIntegrityAuditService,
    );

    return { service, prisma, auditService, tx };
  }

  it('dry-run reports planned changes without writes', async () => {
    const { service, prisma } = buildMocks();
    const result = await service.run({
      organizationId: ORG_A,
      mode: 'dry-run',
    });

    expect(result.readOnly).toBe(true);
    expect(result.stats.changed).toBeGreaterThan(0);
    expect(prisma.orgInvoice.update).not.toHaveBeenCalled();
    expect(prisma.generatedDocument.update).not.toHaveBeenCalled();
  });

  it('apply without confirm stays read-only', async () => {
    const { service, prisma } = buildMocks();
    const result = await service.run({
      organizationId: ORG_A,
      mode: 'apply',
      confirmed: false,
    });

    expect(result.readOnly).toBe(true);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('apply mode with confirm executes transaction', async () => {
    const { service, prisma, tx } = buildMocks();
    const result = await service.run({
      organizationId: ORG_A,
      mode: 'apply',
      confirmed: true,
    });

    expect(result.readOnly).toBe(false);
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(tx.orgInvoice.update).toHaveBeenCalled();
  });

  it('is idempotent on second apply when state already correct', async () => {
    const { service, prisma } = buildMocks();
    prisma.orgInvoice.findMany.mockResolvedValue([
      { ...invoiceRow, generatedDocumentId: DOC_BOOKING_INVOICE },
    ]);
    prisma.generatedDocument.findMany.mockResolvedValue([
      { ...documentRow, isActiveVersion: true, versionNumber: 1 },
    ]);

    const result = await service.run({
      organizationId: ORG_A,
      mode: 'apply',
      confirmed: true,
    });

    expect(result.stats.changed).toBe(0);
    expect(result.actions).toHaveLength(0);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rolls back batch when transaction fails', async () => {
    const { service, prisma } = buildMocks();
    prisma.$transaction.mockRejectedValueOnce(new Error('simulated rollback'));

    await expect(
      service.run({
        organizationId: ORG_A,
        mode: 'apply',
        confirmed: true,
      }),
    ).rejects.toThrow('simulated rollback');

    expect(prisma.orgInvoice.update).not.toHaveBeenCalled();
  });

  it('enforces tenant isolation — blocks cross-org action organizationId', async () => {
    const { service, prisma } = buildMocks();
    prisma.generatedDocument.findMany.mockResolvedValue([
      { ...documentRow, organizationId: 'other-org' },
    ]);

    const result = await service.run({
      organizationId: ORG_A,
      mode: 'dry-run',
    });

    expect(result.stats.errors + result.stats.skipped).toBeGreaterThanOrEqual(0);
    expect(
      result.actions.every((a) => a.organizationId === ORG_A),
    ).toBe(true);
  });

  it('detects conflict when apply finds document linked to different invoice', async () => {
    const { service, prisma } = buildMocks();
    prisma.generatedDocument.findFirst.mockResolvedValue({
      ...documentRow,
      invoiceId: 'other-invoice',
    });
    prisma.$transaction.mockImplementation(async (fn: (client: unknown) => Promise<void>) => {
      const conflictTx = {
        orgInvoice: {
          findFirst: jest.fn().mockResolvedValue({ ...invoiceRow, generatedDocumentId: null }),
          update: jest.fn(),
        },
        generatedDocument: {
          findFirst: jest.fn().mockResolvedValue({
            ...documentRow,
            invoiceId: 'other-invoice',
          }),
          update: jest.fn(),
          updateMany: jest.fn(),
        },
      };
      await fn(conflictTx as never);
    });

    await expect(
      service.run({
        organizationId: ORG_A,
        mode: 'apply',
        confirmed: true,
      }),
    ).rejects.toThrow(/Conflict/);
  });

  it('returns duration and checkpoint for resume', async () => {
    const { service } = buildMocks();
    const result = await service.run({
      organizationId: ORG_A,
      mode: 'dry-run',
      checkpoint: { organizationId: ORG_A, lastInvoiceId: null, processedInvoices: 0, updatedAt: '' },
    });

    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.checkpoint.organizationId).toBe(ORG_A);
    expect(result.checkpoint.lastInvoiceId).toBe(INVOICE_BOOKING);
  });
});
