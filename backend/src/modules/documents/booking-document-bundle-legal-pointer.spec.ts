import { NotFoundException } from '@nestjs/common';
import { BookingDocumentBundleService } from './booking-document-bundle.service';
import { BookingDocumentBundleMonitoringService } from './booking-document-bundle-monitoring.service';
import {
  BookingDocumentBundlePointerMappingError,
  BookingDocumentBundleResolverConflictError,
} from './booking-document-bundle.errors';
import { DOCUMENT_ORIGIN, DOCUMENT_STATUS, DOCUMENT_TYPE } from './documents.constants';
import type { LegalDocumentResolverResult } from './legal-document-resolver.types';

function configStub(overrides: Record<string, unknown> = {}) {
  return { get: jest.fn((key: string, fallback?: unknown) => overrides[key] ?? fallback) } as any;
}

function makeBundle(overrides: Record<string, unknown> = {}) {
  return {
    id: 'bundle-1',
    organizationId: 'org-1',
    bookingId: 'bk-1',
    termsDocumentId: null,
    withdrawalDocumentId: null,
    privacyDocumentId: null,
    bookingInvoiceDocumentId: null,
    depositReceiptDocumentId: null,
    rentalContractDocumentId: null,
    pickupProtocolDocumentId: null,
    returnProtocolDocumentId: null,
    finalInvoiceDocumentId: null,
    status: 'PENDING',
    generatedAt: null,
    lastError: null,
    ...overrides,
  };
}

function makeBooking() {
  return {
    id: 'bk-1',
    organizationId: 'org-1',
    customerId: 'cust-1',
    vehicleId: 'veh-1',
    status: 'CONFIRMED',
    currency: 'EUR',
    totalPriceCents: 10000,
    dailyRateCents: 5000,
    startDate: new Date(),
    endDate: new Date(),
    kmIncluded: 100,
    extrasJson: null,
    customer: { id: 'cust-1', firstName: 'A', lastName: 'B', email: 'a@b.de', customerType: 'B2C', country: 'DE' },
    vehicle: { id: 'veh-1', make: 'VW', model: 'Golf', licensePlate: 'B-AB 123', extraKmPrice: 0.25 },
    organization: { id: 'org-1', name: 'Org', language: 'de', country: 'DE' },
    pickupStation: null,
    returnStation: null,
  };
}

function selection(documentType: string, legalDocumentId: string) {
  return {
    documentType,
    legalDocumentId,
    legalVariant: null,
    noticePurpose: null,
    versionLabel: 'v1',
    title: documentType,
    priority: 1,
    selectionReason: 'test',
    scopeFingerprint: 'fp',
    matchedCandidateCount: 1,
  };
}

function emptyResolution(overrides: Partial<LegalDocumentResolverResult> = {}): LegalDocumentResolverResult {
  return {
    resolverVersion: '1',
    evaluatedAt: new Date().toISOString(),
    evaluatedContext: {
      organizationId: 'org-1',
      bookingId: 'bk-1',
      customerLanguage: 'de',
      customerSegment: 'B2C',
      jurisdiction: 'DE',
      bookingChannel: null,
      productScope: null,
      stationId: null,
      effectiveTimestamp: new Date().toISOString(),
    },
    selectedDocuments: [],
    missingMandatoryDocuments: [],
    conflicts: [],
    fallbackDecisions: [],
    errors: [],
    isComplete: true,
    ...overrides,
  };
}

describe('BookingDocumentBundleService legal pointer wiring', () => {
  function makeService(prisma: any, resolution: LegalDocumentResolverResult = emptyResolution()) {
    const generatedDocs = {
      listForBooking: jest.fn().mockResolvedValue([]),
      toDto: jest.fn((d: any) => d),
      voidDocument: jest.fn(),
    } as any;
    const legalDocs = { getActiveByType: jest.fn().mockResolvedValue({}) } as any;
    const legalResolver = { resolveForBooking: jest.fn().mockResolvedValue(resolution) } as any;
    const bundleMonitoring = new BookingDocumentBundleMonitoringService();
    jest.spyOn(bundleMonitoring, 'recordPointerMappingMissing');
    jest.spyOn(bundleMonitoring, 'recordResolverConflict');
    const svc = new BookingDocumentBundleService(
      prisma,
      configStub({ 'documents.generationEnabled': true }),
      generatedDocs,
      legalDocs,
      legalResolver,
      {} as any,
      {} as any,
      { renderPdf: jest.fn() } as any,
      {
        syncBookingDocumentPackageTask: jest.fn(),
        supersedeBookingDocumentPackageTasks: jest.fn(),
        closeStaleDocumentPackageTasksForBooking: jest.fn(),
      } as any,
      { syncFromOrgLegalState: jest.fn() } as any,
      bundleMonitoring,
    );
    return { svc, legalResolver, bundleMonitoring, generatedDocs, prisma };
  }

  it('maps AGB to termsDocumentId via attachLegalDocuments', async () => {
    const bundle = makeBundle();
    const update = jest.fn().mockResolvedValue({});
    const legalRow = {
      id: 'legal-terms',
      organizationId: 'org-1',
      documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
      legalVariant: null,
      title: 'AGB',
      fileName: 'agb.pdf',
      mimeType: 'application/pdf',
      storageProvider: 'local',
      objectKey: 'k',
      sizeBytes: 1,
      checksum: 'sha',
      versionLabel: 'v1',
      language: 'de',
      jurisdictionCountry: 'DE',
    };
    const prisma = {
      generatedDocument: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'gen-terms' }),
      },
      organizationLegalDocument: {
        findFirst: jest.fn().mockResolvedValue(legalRow),
      },
      bookingDocumentBundle: { update },
    } as any;
    const resolution = emptyResolution({
      selectedDocuments: [selection(DOCUMENT_TYPE.TERMS_AND_CONDITIONS, 'legal-terms')],
    });
    const { svc } = makeService(prisma, resolution);

    await (svc as any).attachLegalDocuments('org-1', bundle, makeBooking(), null, false);

    expect(update).toHaveBeenCalledWith({
      where: { id: 'bundle-1' },
      data: { termsDocumentId: 'gen-terms' },
    });
    expect(bundle.termsDocumentId).toBe('gen-terms');
  });

  it('maps Datenschutzhinweise to privacyDocumentId', async () => {
    const bundle = makeBundle();
    const update = jest.fn().mockResolvedValue({});
    const legalRow = {
      id: 'legal-privacy',
      organizationId: 'org-1',
      documentType: DOCUMENT_TYPE.PRIVACY_POLICY,
      legalVariant: null,
      title: 'Datenschutz',
      fileName: 'privacy.pdf',
      mimeType: 'application/pdf',
      storageProvider: 'local',
      objectKey: 'k',
      sizeBytes: 1,
      checksum: 'sha-p',
      versionLabel: 'v2',
      language: 'de',
      jurisdictionCountry: 'DE',
    };
    const prisma = {
      generatedDocument: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'gen-privacy' }),
      },
      organizationLegalDocument: {
        findFirst: jest.fn().mockResolvedValue(legalRow),
      },
      bookingDocumentBundle: { update },
    } as any;
    const resolution = emptyResolution({
      selectedDocuments: [selection(DOCUMENT_TYPE.PRIVACY_POLICY, 'legal-privacy')],
    });
    const { svc } = makeService(prisma, resolution);

    await (svc as any).attachLegalDocuments('org-1', bundle, makeBooking(), null, false);

    expect(update).toHaveBeenCalledWith({
      where: { id: 'bundle-1' },
      data: { privacyDocumentId: 'gen-privacy' },
    });
  });

  it('maps Verbraucherinformation to withdrawalDocumentId (consumer slot)', async () => {
    const bundle = makeBundle();
    const update = jest.fn().mockResolvedValue({});
    const legalRow = {
      id: 'legal-consumer',
      organizationId: 'org-1',
      documentType: DOCUMENT_TYPE.CONSUMER_INFORMATION,
      legalVariant: null,
      title: 'Verbraucherinfo',
      fileName: 'consumer.pdf',
      mimeType: 'application/pdf',
      storageProvider: 'local',
      objectKey: 'k',
      sizeBytes: 1,
      checksum: 'sha-c',
      versionLabel: 'v3',
      language: 'de',
      jurisdictionCountry: 'DE',
    };
    const prisma = {
      generatedDocument: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'gen-consumer' }),
      },
      organizationLegalDocument: {
        findFirst: jest.fn().mockResolvedValue(legalRow),
      },
      bookingDocumentBundle: { update },
    } as any;
    const resolution = emptyResolution({
      selectedDocuments: [selection(DOCUMENT_TYPE.CONSUMER_INFORMATION, 'legal-consumer')],
    });
    const { svc } = makeService(prisma, resolution);

    await (svc as any).attachLegalDocuments('org-1', bundle, makeBooking(), null, false);

    expect(update).toHaveBeenCalledWith({
      where: { id: 'bundle-1' },
      data: { withdrawalDocumentId: 'gen-consumer' },
    });
  });

  it('setBundlePointer is idempotent on repeated calls', async () => {
    const bundle = makeBundle({ termsDocumentId: 'gen-terms' });
    const update = jest.fn();
    const prisma = { bookingDocumentBundle: { update } } as any;
    const { svc } = makeService(prisma);

    const changed = await (svc as any).setBundlePointer(
      bundle,
      DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
      'gen-terms',
    );

    expect(changed).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });

  it('does not overwrite a historical frozen pointer when a newer version is resolved', async () => {
    const bundle = makeBundle({ termsDocumentId: 'gen-historic' });
    const update = jest.fn();
    const frozenDoc = {
      id: 'gen-historic',
      organizationId: 'org-1',
      status: DOCUMENT_STATUS.GENERATED,
      legalDocumentId: 'legal-old',
    };
    const prisma = {
      generatedDocument: {
        findFirst: jest.fn().mockResolvedValue(frozenDoc),
        create: jest.fn(),
      },
      organizationLegalDocument: { findFirst: jest.fn() },
      bookingDocumentBundle: { update },
    } as any;
    const resolution = emptyResolution({
      selectedDocuments: [selection(DOCUMENT_TYPE.TERMS_AND_CONDITIONS, 'legal-new')],
    });
    const { svc } = makeService(prisma, resolution);

    await (svc as any).attachLegalDocuments('org-1', bundle, makeBooking(), null, false);

    expect(prisma.generatedDocument.create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(bundle.termsDocumentId).toBe('gen-historic');
  });

  it('throws and records monitoring for unmapped document types', async () => {
    const bundle = makeBundle();
    const { svc, bundleMonitoring } = makeService({ bookingDocumentBundle: { update: jest.fn() } } as any);

    await expect(
      (svc as any).setBundlePointer(bundle, 'NOT_A_REAL_TYPE' as never, 'doc-1'),
    ).rejects.toBeInstanceOf(BookingDocumentBundlePointerMappingError);
    expect(bundleMonitoring.recordPointerMappingMissing).toHaveBeenCalledWith({
      organizationId: 'org-1',
      bookingId: 'bk-1',
      documentType: 'NOT_A_REAL_TYPE',
    });
  });

  it('rejects cross-org bundle access', async () => {
    const prisma = {
      bookingDocumentBundle: {
        findUnique: jest.fn().mockResolvedValue(makeBundle({ organizationId: 'org-OTHER' })),
      },
    } as any;
    const { svc } = makeService(prisma);
    await expect(svc.getOrCreateBundle('org-1', 'bk-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws resolver conflict and records monitoring signal', async () => {
    const bundle = makeBundle();
    const prisma = {
      generatedDocument: { findFirst: jest.fn() },
      organizationLegalDocument: { findFirst: jest.fn() },
      bookingDocumentBundle: { update: jest.fn() },
    } as any;
    const resolution = emptyResolution({
      conflicts: [
        {
          documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
          documentAId: 'a',
          documentBId: 'b',
          reason: 'OVERLAPPING_SCOPE_SAME_PRIORITY',
          overlap: {
            documentType: true,
            language: true,
            jurisdictionCountry: true,
            customerSegment: true,
            bookingChannel: true,
            productScope: true,
            stationScope: true,
            validity: true,
            legalVariant: true,
            noticePurpose: true,
          },
        },
      ],
    });
    const { svc, bundleMonitoring } = makeService(prisma, resolution);

    await expect(
      (svc as any).attachLegalDocuments('org-1', bundle, makeBooking(), null, false),
    ).rejects.toBeInstanceOf(BookingDocumentBundleResolverConflictError);
    expect(bundleMonitoring.recordResolverConflict).toHaveBeenCalled();
  });

  it('creates STATIC_LEGAL snapshot with language and checksum from resolved version', async () => {
    const bundle = makeBundle();
    const legalRow = {
      id: 'legal-terms',
      organizationId: 'org-1',
      documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
      legalVariant: null,
      title: 'AGB',
      fileName: 'agb.pdf',
      mimeType: 'application/pdf',
      storageProvider: 'local',
      objectKey: 'k',
      sizeBytes: 1,
      checksum: 'checksum-abc',
      versionLabel: '2026-01',
      language: 'de',
      jurisdictionCountry: 'DE',
    };
    const create = jest.fn().mockResolvedValue({ id: 'gen-1' });
    const prisma = {
      generatedDocument: {
        findFirst: jest.fn().mockResolvedValue(null),
        create,
      },
      organizationLegalDocument: {
        findFirst: jest.fn().mockResolvedValue(legalRow),
      },
      bookingDocumentBundle: { update: jest.fn().mockResolvedValue({}) },
    } as any;
    const resolution = emptyResolution({
      selectedDocuments: [selection(DOCUMENT_TYPE.TERMS_AND_CONDITIONS, 'legal-terms')],
    });
    const { svc } = makeService(prisma, resolution);

    await (svc as any).attachLegalDocuments('org-1', bundle, makeBooking(), null, false);

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          origin: DOCUMENT_ORIGIN.STATIC_LEGAL,
          checksum: 'checksum-abc',
          legalVersionLabel: '2026-01',
          metadata: expect.objectContaining({ language: 'de', checksum: 'checksum-abc' }),
          snapshot: expect.objectContaining({
            language: 'de',
            checksum: 'checksum-abc',
            legalDocumentId: 'legal-terms',
          }),
        }),
      }),
    );
  });
});
