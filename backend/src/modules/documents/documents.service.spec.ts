import { BadRequestException, NotFoundException } from '@nestjs/common';
import { mkdtemp, rm, stat } from 'fs/promises';
import { tmpdir } from 'os';
import { join, sep } from 'path';
import { Readable } from 'stream';

import { LocalDocumentStorageService } from './storage/local-document-storage.service';
import { DocumentNumberingService } from './document-numbering.service';
import { GeneratedDocumentsService } from './generated-documents.service';
import { LegalDocumentsService } from './legal-documents.service';
import {
  LegalDocumentNotActivatableError,
  LegalDocumentPdfValidationError,
  LegalDocumentValidationError,
} from './legal-documents-api.errors';
import { LegalDocumentIngestionService } from './legal-document-ingestion.service';
import { createNoopLegalDocumentEventsService } from './legal-document-events.test-utils';
import { createNoopLegalDocumentFourEyesService } from './legal-document-four-eyes.test-utils';
import { createNoopLegalDocumentScopeService } from './legal-document-scope.test-utils';
import { createLegalDocumentsServiceForTests } from './integrity/legal-document-integrity.test-utils';
import { BookingDocumentBundleService } from './booking-document-bundle.service';
import { evaluateBookingDocumentCompleteness } from './booking-document-completeness.engine';
import { BUNDLE_COMPLETENESS_STATUS } from './booking-document-completeness.constants';
import type { BookingDocumentCompletenessContext } from './booking-document-completeness.types';
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
  const events = createNoopLegalDocumentEventsService();

  function makeLegalSvc(prisma: any, ingestion?: Partial<LegalDocumentIngestionService>) {
    const ingestionSvc = {
      ingest: jest.fn(async (input) => ({
        ok: true as const,
        objectKey: 'organizations/org-1/legal/x/2026/01/u-a.pdf',
        storageProvider: 'local',
        sizeBytes: input.buffer.length,
        mimeType: 'application/pdf',
        checksum: 'test-checksum',
        pageCount: 1,
        scanStatus: 'SCAN_PASSED',
        validatedAt: new Date(),
        malwareScannedAt: null,
        malwareScannerId: null,
        malwareEngineVersion: null,
        malwareThreatName: null,
        malwareScanDetail: null,
        malwareScanAttempts: 1,
        quarantineObjectKey: null,
      })),
      ...ingestion,
    };
    return createLegalDocumentsServiceForTests(prisma, {
      events,
      scope: createNoopLegalDocumentScopeService(),
      fourEyes: createNoopLegalDocumentFourEyesService(),
      ingestion: ingestionSvc,
      storage,
    });
  }

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
    const ingestion = {
      ingest: jest.fn().mockRejectedValue(
        new LegalDocumentPdfValidationError(
          'File content is not a valid PDF',
          'LEGAL_PDF_NOT_PDF',
        ),
      ),
    };
    const svc = makeLegalSvc({} as any, ingestion);
    await expect(
      svc.upload({ ...baseInput(), fileName: 'scan.png', mimeType: 'image/png' }),
    ).rejects.toBeInstanceOf(LegalDocumentPdfValidationError);
  });

  it('rejects unknown legal document types', async () => {
    const svc = makeLegalSvc({} as any);
    await expect(svc.upload({ ...baseInput(), documentType: 'NOT_A_LEGAL_TYPE' })).rejects.toBeInstanceOf(LegalDocumentValidationError);
  });

  it('rejects a missing version label', async () => {
    const svc = makeLegalSvc({} as any);
    await expect(svc.upload({ ...baseInput(), versionLabel: '   ' })).rejects.toBeInstanceOf(LegalDocumentValidationError);
  });

  it('accepts legacy WITHDRAWAL_INFORMATION upload and stores CONSUMER_INFORMATION', async () => {
    const tx = {
      organizationLegalDocument: {
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'legal-w', ...data })),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (cb: any) => cb(tx)),
    } as any;
    const svc = makeLegalSvc(prisma);
    const doc = await svc.upload({
      ...baseInput(),
      documentType: DOCUMENT_TYPE.WITHDRAWAL_INFORMATION,
    });
    expect(doc.documentType).toBe(DOCUMENT_TYPE.CONSUMER_INFORMATION);
    expect(doc.legalVariant).toBe('WITHDRAWAL_RIGHT_NOTICE');
  });

  it('accepts PRIVACY_POLICY uploads with empty client mime when filename ends with .pdf', async () => {
    const prisma = {
      organizationLegalDocument: {
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'legal-privacy', ...data })),
      },
      $transaction: jest.fn(async (cb: any) =>
        cb({
          organizationLegalDocument: {
            create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'legal-privacy', ...data })),
          },
        }),
      ),
    } as any;
    const svc = makeLegalSvc(prisma);
    const doc = await svc.upload({
      ...baseInput(),
      documentType: DOCUMENT_TYPE.PRIVACY_POLICY,
      fileName: 'datenschutz.pdf',
      mimeType: '',
    });
    expect(doc.documentType).toBe(DOCUMENT_TYPE.PRIVACY_POLICY);
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('activating a version supersedes the other ACTIVE version of the same type+language (single-active)', async () => {
    const target = {
      id: 'legal-2',
      organizationId: 'org-1',
      documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
      language: 'de',
      status: LEGAL_STATUS.APPROVED,
      scanStatus: 'SCAN_PASSED',
    };
    const tx = {
      organizationLegalDocument: {
        findFirst: jest.fn().mockResolvedValue(target),
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([
          { id: 'legal-1', organizationId: 'org-1', documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS, language: 'de', status: LEGAL_STATUS.ACTIVE },
        ]),
        update: jest
          .fn()
          .mockImplementation(({ where, data }) =>
            Promise.resolve({ ...(where.id === 'legal-2' ? target : { id: where.id }), ...data }),
          ),
      },
    };
    const prisma = {
      organizationLegalDocument: { findFirst: jest.fn().mockResolvedValue(target) },
      $transaction: jest.fn(async (cb: any) => cb(tx)),
    } as any;
    const svc = makeLegalSvc(prisma);

    const res = await svc.activate('org-1', 'legal-2');

    expect(res.status).toBe(LEGAL_STATUS.ACTIVE);
    expect(tx.organizationLegalDocument.findMany).toHaveBeenCalled();
    expect(tx.organizationLegalDocument.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'legal-2' },
        data: expect.objectContaining({ status: LEGAL_STATUS.ACTIVE }),
      }),
    );
  });

  it('rejects activate when document is still DRAFT', async () => {
    const draft = { id: 'legal-draft', organizationId: 'org-1', documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS, language: 'de', status: LEGAL_STATUS.DRAFT };
    const prisma = {
      organizationLegalDocument: { findFirst: jest.fn().mockResolvedValue(draft) },
    } as any;
    const svc = makeLegalSvc(prisma);
    await expect(svc.activate('org-1', 'legal-draft')).rejects.toBeInstanceOf(LegalDocumentNotActivatableError);
  });

  it('activate is idempotent when the version is already the sole ACTIVE document', async () => {
    const active = {
      id: 'legal-1',
      organizationId: 'org-1',
      documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
      language: 'de',
      status: LEGAL_STATUS.ACTIVE,
      scanStatus: 'SCAN_PASSED',
      activatedAt: new Date('2026-01-01'),
    };
    const tx = {
      organizationLegalDocument: {
        findFirst: jest.fn().mockResolvedValue(active),
        count: jest.fn().mockResolvedValue(0),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
    };
    const prisma = {
      organizationLegalDocument: { findFirst: jest.fn().mockResolvedValue(active) },
      $transaction: jest.fn(async (cb: any) => cb(tx)),
    } as any;
    const svc = makeLegalSvc(prisma);

    const res = await svc.activate('org-1', 'legal-1');
    expect(res.status).toBe(LEGAL_STATUS.ACTIVE);
    expect(tx.organizationLegalDocument.update).not.toHaveBeenCalled();
    expect(tx.organizationLegalDocument.updateMany).not.toHaveBeenCalled();
  });

  it('getActiveByType returns at most one active doc per type and excludes expired rows', async () => {
    const prisma = {
      organizationLegalDocument: {
        findMany: jest.fn().mockResolvedValue([
          { documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS, id: 'a', versionLabel: 'v2' },
          { documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS, id: 'b', versionLabel: 'v1' },
          { documentType: DOCUMENT_TYPE.WITHDRAWAL_INFORMATION, id: 'c', versionLabel: 'w1' },
        ]),
      },
    } as any;
    const svc = makeLegalSvc(prisma);
    const map = await svc.getActiveByType('org-1', 'de');
    expect(map[DOCUMENT_TYPE.TERMS_AND_CONDITIONS]?.id).toBe('a');
    expect(map[DOCUMENT_TYPE.WITHDRAWAL_INFORMATION]?.id).toBe('c');
    expect(prisma.organizationLegalDocument.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: LEGAL_STATUS.ACTIVE,
          AND: expect.arrayContaining([
            expect.objectContaining({ OR: expect.any(Array) }),
          ]),
        }),
        orderBy: { activatedAt: 'desc' },
      }),
    );
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
  function buildCompletenessContext(
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
      resolverVersion: '1',
      resolverConflicts: [],
      resolverMissingMandatory: [
        { documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS, reason: 'No active template' },
        { documentType: DOCUMENT_TYPE.CONSUMER_INFORMATION, reason: 'No active template' },
        { documentType: DOCUMENT_TYPE.PRIVACY_POLICY, reason: 'No active template' },
      ],
      orgActiveLegalTypes: [],
      resolverSelectedTypes: [],
      handoverProtocols: [],
      deliveryProofs: [],
      generationError: null,
      ...overrides,
    };
  }

  function makeService(prisma: any, config = configStub(), completenessCtx?: Partial<BookingDocumentCompletenessContext>) {
    const generatedDocs = {
      listForBooking: jest.fn().mockResolvedValue([]),
      toDto: jest.fn((d: any) => d),
      createFromPdf: jest.fn(),
      voidDocument: jest.fn(),
    } as any;
    const legalDocs = { getActiveByType: jest.fn().mockResolvedValue({}) } as any;
    const legalResolver = { resolveForBooking: jest.fn().mockResolvedValue({
      resolverVersion: '1',
      evaluatedAt: new Date().toISOString(),
      selectedDocuments: [],
      missingMandatoryDocuments: [],
      conflicts: [],
    }) } as any;
    const numbering = {} as any;
    const invoices = {} as any;
    const renderer = { renderPdf: jest.fn() } as any;
    const taskAutomation = {
      syncBookingDocumentPackageTask: jest.fn(),
      supersedeBookingDocumentPackageTasks: jest.fn(),
      closeStaleDocumentPackageTasksForBooking: jest.fn(),
    } as any;
    const orgLegalNotification = { syncFromOrgLegalState: jest.fn().mockResolvedValue(undefined) } as any;
    const bundleMonitoring = {
      recordPointerMappingMissing: jest.fn(),
      recordResolverConflict: jest.fn(),
      recordMissingMandatorySelection: jest.fn(),
    } as any;
    const bundleCompleteness = {
      evaluateForBooking: jest.fn().mockImplementation(async (_org: string, _bk: string, opts?: { generationError?: string | null }) =>
        evaluateBookingDocumentCompleteness(
          buildCompletenessContext({
            generationError: opts?.generationError ?? completenessCtx?.generationError ?? null,
            ...completenessCtx,
          }),
        ),
      ),
    } as any;
    const prismaWithLock = {
      ...prisma,
      $executeRaw: jest.fn().mockResolvedValue(undefined),
    };
    const rentalContract = {
      shouldSkipLegalSnapshotUpdate: jest.fn().mockReturnValue(false),
      resolveLegalRefsForGeneration: jest.fn(),
      toLegalRefsForRendering: jest.fn(),
      toContractPointerIds: jest.fn(),
      buildImmutableSnapshot: jest.fn(),
    } as any;
    const svc = new BookingDocumentBundleService(
      prismaWithLock,
      config,
      generatedDocs,
      legalDocs,
      legalResolver,
      numbering,
      invoices,
      renderer,
      taskAutomation,
      orgLegalNotification,
      bundleMonitoring,
      bundleCompleteness,
      rentalContract,
    );
    return { svc, generatedDocs, renderer, taskAutomation, orgLegalNotification, legalResolver, bundleMonitoring, bundleCompleteness, rentalContract };
  }

  it('getOrCreateBundle rejects cross-org access (tenant isolation)', async () => {
    const prisma = {
      bookingDocumentBundle: { findUnique: jest.fn().mockResolvedValue({ id: 'b', organizationId: 'org-OTHER', bookingId: 'bk-1' }) },
    } as any;
    const { svc } = makeService(prisma);
    await expect(svc.getOrCreateBundle('org-1', 'bk-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('getBundleView reports missing AGB/Widerruf with upload warning when org has none', async () => {
    const prisma = {
      bookingDocumentBundle: { findUnique: jest.fn().mockResolvedValue({ id: 'b', organizationId: 'org-1', bookingId: 'bk-1', status: BUNDLE_STATUS.PARTIAL, termsDocumentId: null, withdrawalDocumentId: null, generatedAt: null, lastError: null }) },
    } as any;
    const { svc } = makeService(prisma, configStub(), {
      orgActiveLegalTypes: [],
    });
    const view = await svc.getBundleView('org-1', 'bk-1');
    expect(view.legal.missing).toEqual([
      DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
      DOCUMENT_TYPE.CONSUMER_INFORMATION,
      DOCUMENT_TYPE.PRIVACY_POLICY,
    ]);
    expect(view.missingLegalDocuments).toEqual(['TERMS_AND_CONDITIONS', 'REVOCATION_POLICY', 'PRIVACY_POLICY']);
    expect(view.warnings[0]).toContain('Administration → Unternehmen hochladen');
  });

  it('getBundleView reports generation error when org legal exists but bundle attach failed', async () => {
    const prisma = {
      bookingDocumentBundle: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'b',
          organizationId: 'org-1',
          bookingId: 'bk-1',
          status: BUNDLE_STATUS.FAILED,
          termsDocumentId: null,
          withdrawalDocumentId: null,
          privacyDocumentId: null,
          generatedAt: null,
          lastError: 'pdfkit_1.default is not a constructor',
        }),
      },
    } as any;
    const { svc } = makeService(prisma, configStub(), {
      resolverMissingMandatory: [],
      orgActiveLegalTypes: [
        DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
        DOCUMENT_TYPE.CONSUMER_INFORMATION,
        DOCUMENT_TYPE.PRIVACY_POLICY,
      ],
      generationError: 'pdfkit_1.default is not a constructor',
    });
    const view = await svc.getBundleView('org-1', 'bk-1');
    expect(view.warnings[0]).toContain('Dokumentenerstellung fehlgeschlagen');
    expect(view.warnings[0]).toContain('pdfkit');
  });

  it('getBundleView has no warning once both legal docs are attached', async () => {
    const prisma = {
      bookingDocumentBundle: { findUnique: jest.fn().mockResolvedValue({ id: 'b', organizationId: 'org-1', bookingId: 'bk-1', status: BUNDLE_STATUS.COMPLETE, termsDocumentId: 't', withdrawalDocumentId: 'w', privacyDocumentId: 'p', generatedAt: new Date(), lastError: null }) },
    } as any;
    const { svc, generatedDocs } = makeService(prisma, configStub(), {
      bundle: {
        termsDocumentId: 't',
        withdrawalDocumentId: 'w',
        privacyDocumentId: 'p',
        bookingInvoiceDocumentId: null,
        depositReceiptDocumentId: null,
        rentalContractDocumentId: null,
        pickupProtocolDocumentId: null,
        returnProtocolDocumentId: null,
        finalInvoiceDocumentId: null,
      },
      orgActiveLegalTypes: [
        DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
        DOCUMENT_TYPE.CONSUMER_INFORMATION,
        DOCUMENT_TYPE.PRIVACY_POLICY,
      ],
      generatedDocuments: [
        { id: 't', documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS, status: DOCUMENT_STATUS.GENERATED, legalDocumentId: 'lt', sentAt: null },
        { id: 'w', documentType: DOCUMENT_TYPE.WITHDRAWAL_INFORMATION, status: DOCUMENT_STATUS.GENERATED, legalDocumentId: 'lc', sentAt: null },
        { id: 'p', documentType: DOCUMENT_TYPE.PRIVACY_POLICY, status: DOCUMENT_STATUS.GENERATED, legalDocumentId: 'lp', sentAt: null },
      ],
      legalDocumentsById: new Map([
        ['lt', { id: 'lt', documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS, integrityStatus: 'VERIFIED', integrityUnavailable: false, scanStatus: 'SCAN_PASSED' }],
        ['lc', { id: 'lc', documentType: DOCUMENT_TYPE.CONSUMER_INFORMATION, integrityStatus: 'VERIFIED', integrityUnavailable: false, scanStatus: 'SCAN_PASSED' }],
        ['lp', { id: 'lp', documentType: DOCUMENT_TYPE.PRIVACY_POLICY, integrityStatus: 'VERIFIED', integrityUnavailable: false, scanStatus: 'SCAN_PASSED' }],
      ]),
      resolverMissingMandatory: [],
    });
    generatedDocs.listForBooking.mockResolvedValue([
      { id: 't', documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS, status: DOCUMENT_STATUS.GENERATED },
      { id: 'w', documentType: DOCUMENT_TYPE.WITHDRAWAL_INFORMATION, status: DOCUMENT_STATUS.GENERATED },
      { id: 'p', documentType: DOCUMENT_TYPE.PRIVACY_POLICY, status: DOCUMENT_STATUS.GENERATED },
    ]);
    const view = await svc.getBundleView('org-1', 'bk-1');
    expect(view.legal.missing).toEqual([]);
    expect(view.completeness.status).not.toBe('BLOCKED');
    expect(view.warnings.filter((w) => w.includes('Administration'))).toEqual([]);
  });

  it('refreshBundleStatus → PARTIAL when legal docs missing at confirmed stage', async () => {
    const update = jest.fn().mockResolvedValue({});
    const prisma = {
      bookingDocumentBundle: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'b', organizationId: 'org-1', bookingId: 'bk-1',
          bookingInvoiceDocumentId: 'i', depositReceiptDocumentId: 'd', rentalContractDocumentId: 'c',
          termsDocumentId: null, withdrawalDocumentId: null, privacyDocumentId: null,
          pickupProtocolDocumentId: null, returnProtocolDocumentId: null, finalInvoiceDocumentId: null,
          generatedAt: null, lastError: null,
        }),
        update,
      },
    } as any;
    const { svc } = makeService(prisma, configStub(), {
      bundle: {
        termsDocumentId: null,
        withdrawalDocumentId: null,
        privacyDocumentId: null,
        bookingInvoiceDocumentId: 'i',
        depositReceiptDocumentId: 'd',
        rentalContractDocumentId: 'c',
        pickupProtocolDocumentId: null,
        returnProtocolDocumentId: null,
        finalInvoiceDocumentId: null,
      },
      orgActiveLegalTypes: [
        DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
        DOCUMENT_TYPE.CONSUMER_INFORMATION,
        DOCUMENT_TYPE.PRIVACY_POLICY,
      ],
    });
    await (svc as any).refreshBundleStatus('org-1', 'bk-1', 'CONFIRMED', null);
    const data = update.mock.calls[0][0].data;
    expect(data.status).toBe(BUNDLE_STATUS.PARTIAL);
  });

  it('refreshBundleStatus → COMPLETE when all required confirmed-stage docs are present', async () => {
    const update = jest.fn().mockResolvedValue({});
    const prisma = {
      bookingDocumentBundle: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'b', organizationId: 'org-1', bookingId: 'bk-1',
          bookingInvoiceDocumentId: 'i', depositReceiptDocumentId: 'd', rentalContractDocumentId: 'c',
          termsDocumentId: 't', withdrawalDocumentId: 'w', privacyDocumentId: 'p',
          pickupProtocolDocumentId: null, returnProtocolDocumentId: null, finalInvoiceDocumentId: null,
          generatedAt: null, lastError: null,
        }),
        update,
      },
    } as any;
    const { svc } = makeService(prisma, configStub(), {
      resolverMissingMandatory: [],
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
        ['lt', { id: 'lt', documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS, integrityStatus: 'VERIFIED', integrityUnavailable: false, scanStatus: 'SCAN_PASSED' }],
        ['lc', { id: 'lc', documentType: DOCUMENT_TYPE.CONSUMER_INFORMATION, integrityStatus: 'VERIFIED', integrityUnavailable: false, scanStatus: 'SCAN_PASSED' }],
        ['lp', { id: 'lp', documentType: DOCUMENT_TYPE.PRIVACY_POLICY, integrityStatus: 'VERIFIED', integrityUnavailable: false, scanStatus: 'SCAN_PASSED' }],
      ]),
      deliveryProofs: [{ generatedDocumentId: 'i', emailStatus: 'SENT' }],
    });
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
          termsDocumentId: null, withdrawalDocumentId: null, privacyDocumentId: null,
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
          .mockResolvedValueOnce({ id: 'g2', organizationId: 'org-1', status: DOCUMENT_STATUS.VOID })
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(null),
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
