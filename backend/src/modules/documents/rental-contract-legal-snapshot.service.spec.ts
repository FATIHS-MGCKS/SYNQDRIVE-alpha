import { DOCUMENT_STATUS, DOCUMENT_TYPE } from './documents.constants';
import { LEGAL_DOCUMENT_RESOLVER_ERROR_CODES } from './legal-document-resolver.constants';
import { RentalContractLegalSnapshotService } from './rental-contract-legal-snapshot.service';
import {
  RENTAL_CONTRACT_ERROR_CODE,
  RentalContractMissingMandatoryLegalTextError,
} from './rental-contract.errors';
import type { LegalDocumentResolverResult } from './legal-document-resolver.types';

function makeBundle(overrides: Record<string, unknown> = {}) {
  return {
    id: 'bundle-1',
    organizationId: 'org-1',
    bookingId: 'bk-1',
    termsDocumentId: 'gen-terms',
    withdrawalDocumentId: 'gen-consumer',
    privacyDocumentId: 'gen-privacy',
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

function selection(documentType: string, legalDocumentId: string, versionLabel = 'v1') {
  return {
    documentType,
    legalDocumentId,
    legalVariant: null,
    noticePurpose: null,
    versionLabel,
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
    evaluatedAt: '2026-07-22T12:00:00.000Z',
    evaluatedContext: {
      organizationId: 'org-1',
      bookingId: 'bk-1',
      customerLanguage: 'de',
      customerSegment: 'B2C',
      jurisdiction: 'DE',
      bookingChannel: null,
      productScope: null,
      stationId: null,
      effectiveTimestamp: '2026-07-22T12:00:00.000Z',
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

function legalRow(id: string, documentType: string, versionLabel = 'v1') {
  return {
    id,
    organizationId: 'org-1',
    documentType,
    legalVariant: null,
    versionLabel,
    language: 'de',
    jurisdictionCountry: 'DE',
    checksum: `sha-${id}`,
    validFrom: new Date('2026-01-01T00:00:00.000Z'),
    validUntil: null,
  };
}

function generatedRow(id: string, legalDocumentId: string, documentType: string) {
  return {
    id,
    organizationId: 'org-1',
    bookingId: 'bk-1',
    legalDocumentId,
    documentType,
    status: DOCUMENT_STATUS.GENERATED,
  };
}

describe('RentalContractLegalSnapshotService', () => {
  function makeService(
    prisma: any,
    resolution: LegalDocumentResolverResult = emptyResolution(),
  ) {
    const legalResolver = {
      resolveForBooking: jest.fn().mockResolvedValue(resolution),
    } as any;
    const svc = new RentalContractLegalSnapshotService(prisma, legalResolver);
    return { svc, legalResolver, prisma };
  }

  it('builds a verification-grade snapshot from bundle pointers and resolver selection', async () => {
    const resolution = emptyResolution({
      selectedDocuments: [
        selection(DOCUMENT_TYPE.TERMS_AND_CONDITIONS, 'legal-terms', 'AGB v1'),
        selection(DOCUMENT_TYPE.CONSUMER_INFORMATION, 'legal-consumer', 'VI v1'),
        selection(DOCUMENT_TYPE.PRIVACY_POLICY, 'legal-privacy', 'DS v1'),
      ],
    });
    const prisma = {
      generatedDocument: {
        findUnique: jest.fn().mockImplementation(({ where }: { where: { id: string } }) => {
          const map: Record<string, ReturnType<typeof generatedRow>> = {
            'gen-terms': generatedRow('gen-terms', 'legal-terms', DOCUMENT_TYPE.TERMS_AND_CONDITIONS),
            'gen-consumer': generatedRow('gen-consumer', 'legal-consumer', DOCUMENT_TYPE.CONSUMER_INFORMATION),
            'gen-privacy': generatedRow('gen-privacy', 'legal-privacy', DOCUMENT_TYPE.PRIVACY_POLICY),
          };
          return Promise.resolve(map[where.id] ?? null);
        }),
      },
      organizationLegalDocument: {
        findUnique: jest.fn().mockImplementation(({ where }: { where: { id: string } }) => {
          const map: Record<string, ReturnType<typeof legalRow>> = {
            'legal-terms': legalRow('legal-terms', DOCUMENT_TYPE.TERMS_AND_CONDITIONS, 'AGB v1'),
            'legal-consumer': legalRow('legal-consumer', DOCUMENT_TYPE.CONSUMER_INFORMATION, 'VI v1'),
            'legal-privacy': legalRow('legal-privacy', DOCUMENT_TYPE.PRIVACY_POLICY, 'DS v1'),
          };
          return Promise.resolve(map[where.id] ?? null);
        }),
      },
    } as any;
    const { svc } = makeService(prisma, resolution);

    const result = await svc.resolveMandatoryLegalRefs('org-1', 'bk-1', makeBundle() as any);
    const snapshot = svc.buildSnapshot('org-1', 'bk-1', result.refs, result.resolution, result.frozenAt);

    expect(snapshot.schemaVersion).toBe(1);
    expect(snapshot.refs).toHaveLength(3);
    expect(snapshot.refs.map((ref) => ref.slot)).toEqual(['TERMS', 'CONSUMER', 'PRIVACY']);
    expect(snapshot.refs[0]).toMatchObject({
      generatedDocumentId: 'gen-terms',
      legalDocumentId: 'legal-terms',
      documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
      versionLabel: 'AGB v1',
      language: 'de',
      jurisdictionCountry: 'DE',
      checksum: 'sha-legal-terms',
      validAtContractTime: true,
    });
    expect(prisma.generatedDocument.findUnique).toHaveBeenCalled();
    expect(prisma.generatedDocument.findFirst).toBeUndefined();
  });

  it('keeps historical frozen snapshot when contract is already immutable', async () => {
    const frozenSnapshot = {
      schemaVersion: 1 as const,
      bookingId: 'bk-1',
      organizationId: 'org-1',
      frozenAt: '2026-01-15T10:00:00.000Z',
      resolverVersion: '1',
      refs: [
        {
          slot: 'TERMS' as const,
          generatedDocumentId: 'gen-terms-old',
          legalDocumentId: 'legal-terms-old',
          documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
          legalVariant: null,
          versionLabel: 'AGB alt',
          language: 'de',
          jurisdictionCountry: 'DE',
          checksum: 'sha-old',
          validFrom: '2026-01-01T00:00:00.000Z',
          validUntil: null,
          validAtContractTime: true,
          snapshotAt: '2026-01-15T10:00:00.000Z',
          resolverVersion: '1',
          selectionReason: 'frozen',
        },
        {
          slot: 'CONSUMER' as const,
          generatedDocumentId: 'gen-consumer-old',
          legalDocumentId: 'legal-consumer-old',
          documentType: DOCUMENT_TYPE.CONSUMER_INFORMATION,
          legalVariant: null,
          versionLabel: 'VI alt',
          language: 'de',
          jurisdictionCountry: 'DE',
          checksum: 'sha-old-c',
          validFrom: null,
          validUntil: null,
          validAtContractTime: true,
          snapshotAt: '2026-01-15T10:00:00.000Z',
          resolverVersion: '1',
          selectionReason: 'frozen',
        },
        {
          slot: 'PRIVACY' as const,
          generatedDocumentId: 'gen-privacy-old',
          legalDocumentId: 'legal-privacy-old',
          documentType: DOCUMENT_TYPE.PRIVACY_POLICY,
          legalVariant: null,
          versionLabel: 'DS alt',
          language: 'de',
          jurisdictionCountry: 'DE',
          checksum: 'sha-old-p',
          validFrom: null,
          validUntil: null,
          validAtContractTime: true,
          snapshotAt: '2026-01-15T10:00:00.000Z',
          resolverVersion: '1',
          selectionReason: 'frozen',
        },
      ],
    };
    const contract = {
      id: 'contract-1',
      legalSnapshotFrozenAt: new Date('2026-01-15T10:00:00.000Z'),
      legalRefsSnapshot: frozenSnapshot,
    };
    const resolution = emptyResolution({
      selectedDocuments: [
        selection(DOCUMENT_TYPE.TERMS_AND_CONDITIONS, 'legal-terms-new', 'AGB neu'),
        selection(DOCUMENT_TYPE.CONSUMER_INFORMATION, 'legal-consumer-new', 'VI neu'),
        selection(DOCUMENT_TYPE.PRIVACY_POLICY, 'legal-privacy-new', 'DS neu'),
      ],
    });
    const prisma = {} as any;
    const { svc } = makeService(prisma, resolution);

    const result = await svc.resolveMandatoryLegalRefs('org-1', 'bk-1', makeBundle() as any, {
      contract: contract as any,
    });

    expect(result.refs.map((ref) => ref.versionLabel)).toEqual(['AGB alt', 'VI alt', 'DS alt']);
    expect(result.refs[0].legalDocumentId).toBe('legal-terms-old');
    expect(prisma.generatedDocument).toBeUndefined();
  });

  it('throws structured error when mandatory legal texts are missing', async () => {
    const resolution = emptyResolution({
      selectedDocuments: [selection(DOCUMENT_TYPE.TERMS_AND_CONDITIONS, 'legal-terms')],
      missingMandatoryDocuments: [
        {
          documentType: DOCUMENT_TYPE.PRIVACY_POLICY,
          isMandatory: true,
          reason: 'no_match',
          code: LEGAL_DOCUMENT_RESOLVER_ERROR_CODES.MISSING_MANDATORY,
        },
      ],
      isComplete: false,
    });
    const prisma = {
      generatedDocument: {
        findUnique: jest.fn().mockResolvedValue(
          generatedRow('gen-terms', 'legal-terms', DOCUMENT_TYPE.TERMS_AND_CONDITIONS),
        ),
      },
      organizationLegalDocument: {
        findUnique: jest.fn().mockResolvedValue(
          legalRow('legal-terms', DOCUMENT_TYPE.TERMS_AND_CONDITIONS),
        ),
      },
    } as any;
    const { svc } = makeService(prisma, resolution);

    await expect(
      svc.resolveMandatoryLegalRefs('org-1', 'bk-1', makeBundle({ privacyDocumentId: null }) as any),
    ).rejects.toBeInstanceOf(RentalContractMissingMandatoryLegalTextError);
  });

  it('rejects cross-tenant generated document pointers', async () => {
    const resolution = emptyResolution({
      selectedDocuments: [
        selection(DOCUMENT_TYPE.TERMS_AND_CONDITIONS, 'legal-terms'),
        selection(DOCUMENT_TYPE.CONSUMER_INFORMATION, 'legal-consumer'),
        selection(DOCUMENT_TYPE.PRIVACY_POLICY, 'legal-privacy'),
      ],
    });
    const prisma = {
      generatedDocument: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'gen-terms',
          organizationId: 'org-OTHER',
          bookingId: 'bk-OTHER',
          legalDocumentId: 'legal-terms',
          status: DOCUMENT_STATUS.GENERATED,
        }),
      },
      organizationLegalDocument: { findUnique: jest.fn() },
    } as any;
    const { svc } = makeService(prisma, resolution);

    await expect(svc.resolveMandatoryLegalRefs('org-1', 'bk-1', makeBundle() as any)).rejects.toMatchObject({
      code: RENTAL_CONTRACT_ERROR_CODE.GENERATED_DOCUMENT_MISSING,
    });
  });

  it('rejects bundle pointer that does not match resolver selection', async () => {
    const resolution = emptyResolution({
      selectedDocuments: [
        selection(DOCUMENT_TYPE.TERMS_AND_CONDITIONS, 'legal-terms-new'),
        selection(DOCUMENT_TYPE.CONSUMER_INFORMATION, 'legal-consumer'),
        selection(DOCUMENT_TYPE.PRIVACY_POLICY, 'legal-privacy'),
      ],
    });
    const prisma = {
      generatedDocument: {
        findUnique: jest.fn().mockImplementation(({ where }: { where: { id: string } }) => {
          const map: Record<string, ReturnType<typeof generatedRow>> = {
            'gen-terms': generatedRow('gen-terms', 'legal-terms-old', DOCUMENT_TYPE.TERMS_AND_CONDITIONS),
            'gen-consumer': generatedRow('gen-consumer', 'legal-consumer', DOCUMENT_TYPE.CONSUMER_INFORMATION),
            'gen-privacy': generatedRow('gen-privacy', 'legal-privacy', DOCUMENT_TYPE.PRIVACY_POLICY),
          };
          return Promise.resolve(map[where.id] ?? null);
        }),
      },
      organizationLegalDocument: {
        findUnique: jest.fn().mockImplementation(({ where }: { where: { id: string } }) => {
          const map: Record<string, ReturnType<typeof legalRow>> = {
            'legal-terms-old': legalRow('legal-terms-old', DOCUMENT_TYPE.TERMS_AND_CONDITIONS),
            'legal-consumer': legalRow('legal-consumer', DOCUMENT_TYPE.CONSUMER_INFORMATION),
            'legal-privacy': legalRow('legal-privacy', DOCUMENT_TYPE.PRIVACY_POLICY),
          };
          return Promise.resolve(map[where.id] ?? null);
        }),
      },
    } as any;
    const { svc } = makeService(prisma, resolution);

    await expect(svc.resolveMandatoryLegalRefs('org-1', 'bk-1', makeBundle() as any)).rejects.toMatchObject({
      code: RENTAL_CONTRACT_ERROR_CODE.TENANT_MISMATCH,
    });
  });

  it('treats privacy policy with the same completeness requirements as AGB and consumer info', async () => {
    const resolution = emptyResolution({
      selectedDocuments: [
        selection(DOCUMENT_TYPE.TERMS_AND_CONDITIONS, 'legal-terms'),
        selection(DOCUMENT_TYPE.CONSUMER_INFORMATION, 'legal-consumer'),
      ],
      isComplete: false,
    });
    const prisma = {
      generatedDocument: {
        findUnique: jest.fn().mockImplementation(({ where }: { where: { id: string } }) => {
          const map: Record<string, ReturnType<typeof generatedRow>> = {
            'gen-terms': generatedRow('gen-terms', 'legal-terms', DOCUMENT_TYPE.TERMS_AND_CONDITIONS),
            'gen-consumer': generatedRow('gen-consumer', 'legal-consumer', DOCUMENT_TYPE.CONSUMER_INFORMATION),
          };
          return Promise.resolve(map[where.id] ?? null);
        }),
      },
      organizationLegalDocument: {
        findUnique: jest.fn().mockImplementation(({ where }: { where: { id: string } }) => {
          const map: Record<string, ReturnType<typeof legalRow>> = {
            'legal-terms': legalRow('legal-terms', DOCUMENT_TYPE.TERMS_AND_CONDITIONS),
            'legal-consumer': legalRow('legal-consumer', DOCUMENT_TYPE.CONSUMER_INFORMATION),
          };
          return Promise.resolve(map[where.id] ?? null);
        }),
      },
    } as any;
    const { svc } = makeService(prisma, resolution);

    await expect(
      svc.resolveMandatoryLegalRefs('org-1', 'bk-1', makeBundle({ privacyDocumentId: null }) as any),
    ).rejects.toBeInstanceOf(RentalContractMissingMandatoryLegalTextError);
  });
});

describe('RentalContractService download context', () => {
  it('uses frozen generatedDocumentId for contract download', async () => {
    const { RentalContractService } = await import('./rental-contract.service');
    const prisma = {
      rentalContract: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'contract-1',
          organizationId: 'org-1',
          bookingId: 'bk-1',
          generatedDocumentId: 'gen-contract-frozen',
          legalSnapshotFrozenAt: new Date('2026-01-15T10:00:00.000Z'),
          legalRefsSnapshot: { schemaVersion: 1, refs: [] },
        }),
      },
      generatedDocument: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'gen-contract-frozen',
          organizationId: 'org-1',
          bookingId: 'bk-1',
        }),
      },
    } as any;
    const legalSnapshot = {
      parseSnapshot: jest.fn().mockReturnValue({ schemaVersion: 1, refs: [] }),
      isFrozen: jest.fn().mockReturnValue(true),
    } as any;
    const svc = new RentalContractService(prisma, legalSnapshot);

    const ctx = await svc.getDownloadContext('org-1', 'bk-1');

    expect(ctx.generatedDocumentId).toBe('gen-contract-frozen');
    expect(ctx.legalSnapshotFrozenAt).toBe('2026-01-15T10:00:00.000Z');
  });

  it('rejects download when generated document belongs to another organization', async () => {
    const { RentalContractService } = await import('./rental-contract.service');
    const prisma = {
      rentalContract: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'contract-1',
          organizationId: 'org-1',
          bookingId: 'bk-1',
          generatedDocumentId: 'gen-contract',
          legalSnapshotFrozenAt: new Date(),
          legalRefsSnapshot: null,
        }),
      },
      generatedDocument: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'gen-contract',
          organizationId: 'org-OTHER',
          bookingId: 'bk-1',
        }),
      },
    } as any;
    const legalSnapshot = { parseSnapshot: jest.fn(), isFrozen: jest.fn() } as any;
    const svc = new RentalContractService(prisma, legalSnapshot);

    await expect(svc.getDownloadContext('org-1', 'bk-1')).rejects.toMatchObject({
      code: RENTAL_CONTRACT_ERROR_CODE.TENANT_MISMATCH,
    });
  });
});
