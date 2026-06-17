import { BadRequestException, NotFoundException } from '@nestjs/common';
import { mkdtemp, rm, stat } from 'fs/promises';
import { tmpdir } from 'os';
import { join, sep } from 'path';
import { Readable } from 'stream';

import { LocalDocumentStorageService } from './storage/local-document-storage.service';
import { DocumentNumberingService } from './document-numbering.service';
import { GeneratedDocumentsService } from './generated-documents.service';
import { LegalDocumentsService } from './legal-documents.service';
import { BookingDocumentBundleService } from './booking-document-bundle.service';
import { BUNDLE_STATUS, DOCUMENT_STATUS, DOCUMENT_TYPE, LEGAL_STATUS } from './documents.constants';

/** Minimal ConfigService stub returning the provided value (or default). */
function configStub(values: Record<string, unknown> = {}) {
  return {
    get: jest.fn((key: string, def?: unknown) => (key in values ? values[key] : def)),
  } as any;
}

describe('LocalDocumentStorageService — path safety + roundtrip', () => {
  let baseDir: string;
  let storage: LocalDocumentStorageService;

  beforeAll(async () => {
    baseDir = await mkdtemp(join(tmpdir(), 'synq-docs-'));
    storage = new LocalDocumentStorageService(configStub({ 'documents.localStorageDir': baseDir }));
  });

  afterAll(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  it('generates a safe booking-scoped object key and round-trips the bytes', async () => {
    const res = await storage.putObject({
      organizationId: 'org-1',
      bookingId: 'bk-9',
      documentType: DOCUMENT_TYPE.BOOKING_INVOICE,
      originalName: '../../evil name!.pdf',
      buffer: Buffer.from('%PDF-1.4 test'),
      mimeType: 'application/pdf',
    });

    expect(res.storageProvider).toBe('local');
    expect(res.sizeBytes).toBeGreaterThan(0);
    // key shape: organizations/{org}/bookings/{bk}/{type}/{yyyy}/{mm}/{uuid}-{safeName}
    expect(res.objectKey).toMatch(
      new RegExp(
        `^organizations/org-1/bookings/bk-9/${DOCUMENT_TYPE.BOOKING_INVOICE}/\\d{4}/\\d{2}/[0-9a-f-]+-.*\\.pdf$`,
      ),
    );
    // untrusted name never introduces traversal
    expect(res.objectKey).not.toContain('..');

    const read = await storage.getObject(res.objectKey);
    expect(read.toString()).toBe('%PDF-1.4 test');

    const internal = storage.getInternalPath(res.objectKey)!;
    expect(internal.startsWith(baseDir + sep)).toBe(true);
    await expect(stat(internal)).resolves.toBeDefined();
  });

  it('generates an org-scoped (legal) key when no bookingId is given', async () => {
    const res = await storage.putObject({
      organizationId: 'org-1',
      bookingId: null,
      documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
      originalName: 'agb.pdf',
      buffer: Buffer.from('agb'),
      mimeType: 'application/pdf',
    });
    expect(res.objectKey).toMatch(
      new RegExp(`^organizations/org-1/legal/${DOCUMENT_TYPE.TERMS_AND_CONDITIONS}/\\d{4}/\\d{2}/`),
    );
  });

  it.each([
    '../secret.pdf',
    'organizations/../../escape.pdf',
    'C:\\Windows\\System32\\evil.pdf',
    'with\0null.pdf',
  ])('rejects path-traversal / unsafe key %p', (key) => {
    expect(() => storage.getInternalPath(key)).toThrow(BadRequestException);
  });
});

describe('DocumentNumberingService', () => {
  it('produces a per-org/year sequential number with the type prefix', async () => {
    const prisma = {
      generatedDocument: {
        count: jest.fn().mockResolvedValue(4),
        findFirst: jest.fn().mockResolvedValue(null),
      },
    } as any;
    const svc = new DocumentNumberingService(prisma);
    const year = new Date().getUTCFullYear();

    const num = await svc.nextNumber('org-1', DOCUMENT_TYPE.BOOKING_INVOICE);
    expect(num).toBe(`RE-${year}-0005`);
    expect(prisma.generatedDocument.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ organizationId: 'org-1', documentType: DOCUMENT_TYPE.BOOKING_INVOICE }) }),
    );
  });

  it('appends a random suffix if the candidate number already exists (collision guard)', async () => {
    const prisma = {
      generatedDocument: {
        count: jest.fn().mockResolvedValue(0),
        findFirst: jest.fn().mockResolvedValue({ id: 'dup' }),
      },
    } as any;
    const svc = new DocumentNumberingService(prisma);
    const year = new Date().getUTCFullYear();
    const num = await svc.nextNumber('org-1', DOCUMENT_TYPE.FINAL_INVOICE);
    expect(num).toMatch(new RegExp(`^SR-${year}-[A-Z0-9]{4}$`));
  });
});

describe('LegalDocumentsService', () => {
  const buf = Buffer.from('%PDF legal');
  const storage = {
    putObject: jest.fn().mockResolvedValue({ objectKey: 'organizations/org-1/legal/x/2026/01/u-a.pdf', storageProvider: 'local', sizeBytes: buf.length, mimeType: 'application/pdf' }),
    getObjectStream: jest.fn().mockResolvedValue(Readable.from([buf])),
  } as any;

  function baseInput() {
    return {
      organizationId: 'org-1',
      documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
      versionLabel: '2026-01',
      fileName: 'agb.pdf',
      buffer: buf,
      mimeType: 'application/pdf',
    };
  }

  it('rejects non-PDF uploads', async () => {
    const svc = new LegalDocumentsService({} as any, storage);
    await expect(svc.upload({ ...baseInput(), mimeType: 'image/png' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects unknown legal document types', async () => {
    const svc = new LegalDocumentsService({} as any, storage);
    await expect(svc.upload({ ...baseInput(), documentType: 'NOT_A_LEGAL_TYPE' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a missing version label', async () => {
    const svc = new LegalDocumentsService({} as any, storage);
    await expect(svc.upload({ ...baseInput(), versionLabel: '   ' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('activating a version archives the other ACTIVE version of the same type+language (single-active)', async () => {
    const target = { id: 'legal-2', organizationId: 'org-1', documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS, language: 'de', status: LEGAL_STATUS.DRAFT };
    const tx = {
      organizationLegalDocument: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({ ...target, status: LEGAL_STATUS.ACTIVE }),
      },
    };
    const prisma = {
      organizationLegalDocument: { findFirst: jest.fn().mockResolvedValue(target) },
      $transaction: jest.fn(async (cb: any) => cb(tx)),
    } as any;
    const svc = new LegalDocumentsService(prisma, storage);

    const res = await svc.activate('org-1', 'legal-2');

    expect(res.status).toBe(LEGAL_STATUS.ACTIVE);
    expect(tx.organizationLegalDocument.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org-1',
          documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
          language: 'de',
          status: LEGAL_STATUS.ACTIVE,
          id: { not: 'legal-2' },
        }),
        data: { status: LEGAL_STATUS.ARCHIVED },
      }),
    );
    expect(tx.organizationLegalDocument.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'legal-2' }, data: expect.objectContaining({ status: LEGAL_STATUS.ACTIVE }) }),
    );
  });

  it('getActiveByType returns at most one active doc per type', async () => {
    const prisma = {
      organizationLegalDocument: {
        findMany: jest.fn().mockResolvedValue([
          { documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS, id: 'a', versionLabel: 'v2' },
          { documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS, id: 'b', versionLabel: 'v1' },
          { documentType: DOCUMENT_TYPE.WITHDRAWAL_INFORMATION, id: 'c', versionLabel: 'w1' },
        ]),
      },
    } as any;
    const svc = new LegalDocumentsService(prisma, storage);
    const map = await svc.getActiveByType('org-1', 'de');
    expect(map[DOCUMENT_TYPE.TERMS_AND_CONDITIONS]?.id).toBe('a');
    expect(map[DOCUMENT_TYPE.WITHDRAWAL_INFORMATION]?.id).toBe('c');
  });
});

describe('GeneratedDocumentsService — org scoping + storage', () => {
  const storage = {
    putObject: jest.fn().mockResolvedValue({ objectKey: 'organizations/org-1/bookings/bk-1/BOOKING_INVOICE/2026/01/u-a.pdf', storageProvider: 'local', sizeBytes: 10, mimeType: 'application/pdf' }),
    getObjectStream: jest.fn().mockResolvedValue(Readable.from([Buffer.from('x')])),
  } as any;

  it('createFromPdf stores the bytes and persists checksum + object key', async () => {
    const prisma = { generatedDocument: { create: jest.fn().mockImplementation(({ data }: any) => ({ id: 'g1', ...data })) } } as any;
    const svc = new GeneratedDocumentsService(prisma, storage);
    const doc = await svc.createFromPdf({
      organizationId: 'org-1',
      documentType: DOCUMENT_TYPE.BOOKING_INVOICE,
      title: 'Rechnung',
      fileName: 'booking_invoice-bk-1.pdf',
      buffer: Buffer.from('%PDF'),
      bookingId: 'bk-1',
    });
    expect(storage.putObject).toHaveBeenCalled();
    const createArg = (prisma.generatedDocument.create as jest.Mock).mock.calls[0][0].data;
    expect(createArg.objectKey).toContain('organizations/org-1/');
    expect(createArg.checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(createArg.status).toBe(DOCUMENT_STATUS.GENERATED);
    expect(doc.id).toBe('g1');
  });

  it('getById enforces org scope and throws NotFound when absent', async () => {
    const prisma = { generatedDocument: { findFirst: jest.fn().mockResolvedValue(null) } } as any;
    const svc = new GeneratedDocumentsService(prisma, storage);
    await expect(svc.getById('org-1', 'missing')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.generatedDocument.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'missing', organizationId: 'org-1' } }),
    );
  });

  it('getDownload streams the stored object for the requesting org', async () => {
    const prisma = { generatedDocument: { findFirst: jest.fn().mockResolvedValue({ id: 'g1', organizationId: 'org-1', objectKey: 'k', fileName: 'a.pdf', mimeType: 'application/pdf', sizeBytes: 1 }) } } as any;
    const svc = new GeneratedDocumentsService(prisma, storage);
    const dl = await svc.getDownload('org-1', 'g1');
    expect(storage.getObjectStream).toHaveBeenCalledWith('k');
    expect(dl.fileName).toBe('a.pdf');
  });
});

describe('BookingDocumentBundleService', () => {
  function makeService(prisma: any, config = configStub()) {
    const generatedDocs = { listForBooking: jest.fn().mockResolvedValue([]), toDto: jest.fn((d: any) => d) } as any;
    const legalDocs = {} as any;
    const numbering = {} as any;
    const invoices = {} as any;
    const renderer = { renderPdf: jest.fn() } as any;
    const taskAutomation = { ensureBookingLifecycleTasks: jest.fn() } as any;
    const svc = new BookingDocumentBundleService(prisma, config, generatedDocs, legalDocs, numbering, invoices, renderer, taskAutomation);
    return { svc, generatedDocs, renderer };
  }

  it('getOrCreateBundle rejects cross-org access (tenant isolation)', async () => {
    const prisma = {
      bookingDocumentBundle: { findUnique: jest.fn().mockResolvedValue({ id: 'b', organizationId: 'org-OTHER', bookingId: 'bk-1' }) },
    } as any;
    const { svc } = makeService(prisma);
    await expect(svc.getOrCreateBundle('org-1', 'bk-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('getBundleView reports missing AGB/Widerruf with a warning', async () => {
    const prisma = {
      bookingDocumentBundle: { findUnique: jest.fn().mockResolvedValue({ id: 'b', organizationId: 'org-1', bookingId: 'bk-1', status: BUNDLE_STATUS.PARTIAL, termsDocumentId: null, withdrawalDocumentId: null, generatedAt: null, lastError: null }) },
    } as any;
    const { svc } = makeService(prisma);
    const view = await svc.getBundleView('org-1', 'bk-1');
    expect(view.legal.missing).toEqual([DOCUMENT_TYPE.TERMS_AND_CONDITIONS, DOCUMENT_TYPE.WITHDRAWAL_INFORMATION]);
    expect(view.missingLegalDocuments).toEqual(['TERMS_AND_CONDITIONS', 'REVOCATION_POLICY']);
    expect(view.warnings[0]).toContain('Dokumentenpaket unvollständig');
  });

  it('getBundleView has no warning once both legal docs are attached', async () => {
    const prisma = {
      bookingDocumentBundle: { findUnique: jest.fn().mockResolvedValue({ id: 'b', organizationId: 'org-1', bookingId: 'bk-1', status: BUNDLE_STATUS.COMPLETE, termsDocumentId: 't', withdrawalDocumentId: 'w', generatedAt: new Date(), lastError: null }) },
    } as any;
    const { svc } = makeService(prisma);
    const view = await svc.getBundleView('org-1', 'bk-1');
    expect(view.legal.missing).toEqual([]);
    expect(view.warnings).toEqual([]);
  });

  it('refreshBundleStatus → PARTIAL when legal docs missing at confirmed stage', async () => {
    const update = jest.fn().mockResolvedValue({});
    const prisma = {
      bookingDocumentBundle: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'b', organizationId: 'org-1', bookingId: 'bk-1',
          bookingInvoiceDocumentId: 'i', depositReceiptDocumentId: 'd', rentalContractDocumentId: 'c',
          termsDocumentId: null, withdrawalDocumentId: null,
          pickupProtocolDocumentId: null, returnProtocolDocumentId: null, finalInvoiceDocumentId: null,
          generatedAt: null,
        }),
        update,
      },
    } as any;
    const { svc } = makeService(prisma);
    await (svc as any).refreshBundleStatus('org-1', 'bk-1', 'CONFIRMED', null);
    const data = update.mock.calls[0][0].data;
    expect(data.status).toBe(BUNDLE_STATUS.PARTIAL);
    expect(data.lastError).toContain('Rechtliche Dokumente fehlen');
  });

  it('refreshBundleStatus → COMPLETE when all required confirmed-stage docs are present', async () => {
    const update = jest.fn().mockResolvedValue({});
    const prisma = {
      bookingDocumentBundle: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'b', organizationId: 'org-1', bookingId: 'bk-1',
          bookingInvoiceDocumentId: 'i', depositReceiptDocumentId: 'd', rentalContractDocumentId: 'c',
          termsDocumentId: 't', withdrawalDocumentId: 'w',
          pickupProtocolDocumentId: null, returnProtocolDocumentId: null, finalInvoiceDocumentId: null,
          generatedAt: null,
        }),
        update,
      },
    } as any;
    const { svc } = makeService(prisma);
    await (svc as any).refreshBundleStatus('org-1', 'bk-1', 'CONFIRMED', null);
    expect(update.mock.calls[0][0].data.status).toBe(BUNDLE_STATUS.COMPLETE);
  });

  it('refreshBundleStatus → FAILED when generation errored and nothing was produced', async () => {
    const update = jest.fn().mockResolvedValue({});
    const prisma = {
      bookingDocumentBundle: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'b', organizationId: 'org-1', bookingId: 'bk-1',
          bookingInvoiceDocumentId: null, depositReceiptDocumentId: null, rentalContractDocumentId: null,
          termsDocumentId: null, withdrawalDocumentId: null,
          pickupProtocolDocumentId: null, returnProtocolDocumentId: null, finalInvoiceDocumentId: null,
          generatedAt: null,
        }),
        update,
      },
    } as any;
    const { svc } = makeService(prisma);
    await (svc as any).refreshBundleStatus('org-1', 'bk-1', 'CONFIRMED', 'boom');
    expect(update.mock.calls[0][0].data.status).toBe(BUNDLE_STATUS.FAILED);
  });

  it('generateInitialBundle skips rendering when generation is disabled', async () => {
    const prisma = {
      bookingDocumentBundle: { findUnique: jest.fn().mockResolvedValue({ id: 'b', organizationId: 'org-1', bookingId: 'bk-1', status: BUNDLE_STATUS.PENDING, termsDocumentId: null, withdrawalDocumentId: null, generatedAt: null, lastError: null }) },
    } as any;
    const { svc, renderer } = makeService(prisma, configStub({ 'documents.generationEnabled': false }));
    const view = await svc.generateInitialBundle('org-1', 'bk-1', null);
    expect(renderer.renderPdf).not.toHaveBeenCalled();
    expect(view.bundle.bookingId).toBe('bk-1');
  });

  it('existingBundleDoc reuses a non-void document but ignores a void one (idempotency)', async () => {
    const prisma = {
      generatedDocument: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({ id: 'g1', organizationId: 'org-1', status: DOCUMENT_STATUS.GENERATED })
          .mockResolvedValueOnce({ id: 'g2', organizationId: 'org-1', status: DOCUMENT_STATUS.VOID }),
      },
    } as any;
    const { svc } = makeService(prisma);
    const bundleWith = { bookingInvoiceDocumentId: 'g1' } as any;
    const reused = await (svc as any).existingBundleDoc('org-1', bundleWith, DOCUMENT_TYPE.BOOKING_INVOICE);
    expect(reused?.id).toBe('g1');

    const bundleVoid = { bookingInvoiceDocumentId: 'g2' } as any;
    const ignored = await (svc as any).existingBundleDoc('org-1', bundleVoid, DOCUMENT_TYPE.BOOKING_INVOICE);
    expect(ignored).toBeNull();

    const bundleEmpty = { bookingInvoiceDocumentId: null } as any;
    const none = await (svc as any).existingBundleDoc('org-1', bundleEmpty, DOCUMENT_TYPE.BOOKING_INVOICE);
    expect(none).toBeNull();
  });
});
