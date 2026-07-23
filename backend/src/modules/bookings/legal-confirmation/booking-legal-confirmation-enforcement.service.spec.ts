import { ConflictException } from '@nestjs/common';
import { BookingLegalConfirmationEnforcementService } from './booking-legal-confirmation-enforcement.service';
import { BOOKING_LEGAL_CONFIRMATION_ERROR_CODE } from './booking-legal-confirmation.constants';
import { DOCUMENT_TYPE } from '@modules/documents/documents.constants';

function makeSnapshot(documentType: string, overrides: Record<string, unknown> = {}) {
  return {
    id: `snap-${documentType}`,
    organizationId: 'org-1',
    bookingId: 'bk-1',
    documentType,
    templateKey: null,
    templateVersion: '1',
    renderedVersion: 'v2026-01',
    hashAlgorithm: 'sha256',
    contentHash: `${documentType}-hash`.padEnd(64, '0'),
    language: 'de',
    generatedDocumentId: `gen-${documentType}`,
    legalDocumentId: `legal-${documentType}`,
    presentationContext: 'CHECKOUT',
    integrityStatus: 'VERIFIED',
    integrityVerifiedAt: new Date().toISOString(),
    idempotencyKey: `key-${documentType}`,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeDeps() {
  const prisma = {
    bookingDocumentBundle: {
      findFirst: jest.fn(async () => ({
        termsDocumentId: 'gen-terms',
        withdrawalDocumentId: 'gen-consumer',
        privacyDocumentId: 'gen-privacy',
      })),
    },
    bookingLegalDocumentSnapshot: { findMany: jest.fn(async () => []) },
    bookingLegalAcceptance: { findMany: jest.fn(async () => []) },
  };

  const legalResolver = {
    resolveForBooking: jest.fn(async () => ({
      isComplete: true,
      selectedDocuments: [
        {
          documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
          legalDocumentId: 'legal-TERMS_AND_CONDITIONS',
          versionLabel: 'v2026-01',
        },
        {
          documentType: DOCUMENT_TYPE.CONSUMER_INFORMATION,
          legalDocumentId: 'legal-CONSUMER_INFORMATION',
          versionLabel: 'v2026-01',
        },
        {
          documentType: DOCUMENT_TYPE.PRIVACY_POLICY,
          legalDocumentId: 'legal-PRIVACY_POLICY',
          versionLabel: 'v2026-01',
        },
      ],
      missingMandatoryDocuments: [],
      conflicts: [],
    })),
  };

  const legalDocumentSnapshots = {
    ensureCheckoutSnapshots: jest.fn(async () => [
      makeSnapshot(DOCUMENT_TYPE.TERMS_AND_CONDITIONS),
      makeSnapshot(DOCUMENT_TYPE.CONSUMER_INFORMATION),
      makeSnapshot(DOCUMENT_TYPE.PRIVACY_POLICY),
    ]),
  };

  const legalAcceptance = {
    recordCheckoutAcceptancesFromFlags: jest.fn(async () => [{ id: 'acc-1' }, { id: 'acc-2' }]),
  };

  const svc = new BookingLegalConfirmationEnforcementService(
    prisma as never,
    legalResolver as never,
    legalDocumentSnapshots as never,
    legalAcceptance as never,
  );

  return { svc, prisma, legalResolver, legalDocumentSnapshots, legalAcceptance };
}

describe('BookingLegalConfirmationEnforcementService', () => {
  const baseInput = {
    organizationId: 'org-1',
    bookingId: 'bk-1',
    customerId: 'cust-1',
    agbAccepted: true,
    privacyAccepted: true,
  };

  it('enforces mandatory flags and records evidence on success', async () => {
    const { svc, legalAcceptance } = makeDeps();
    const result = await svc.enforceAndRecordCheckoutConfirmation(baseInput);
    expect(result.snapshots).toHaveLength(3);
    expect(result.acceptancesRecorded).toBe(2);
    expect(legalAcceptance.recordCheckoutAcceptancesFromFlags).toHaveBeenCalled();
  });

  it('rejects confirm when mandatory acceptance flags are missing (bypass attempt)', async () => {
    const { svc } = makeDeps();
    await expect(
      svc.enforceAndRecordCheckoutConfirmation({
        ...baseInput,
        agbAccepted: false,
        privacyAccepted: undefined,
      }),
    ).rejects.toMatchObject({
      response: {
        code: BOOKING_LEGAL_CONFIRMATION_ERROR_CODE.LEGAL_ACCEPTANCE_REQUIRED,
      },
    });
  });

  it('does not block booking when optional marketing consent is absent', async () => {
    const { svc } = makeDeps();
    await expect(
      svc.enforceAndRecordCheckoutConfirmation({
        ...baseInput,
        marketingConsent: false,
      }),
    ).resolves.toBeDefined();
  });

  it('rejects when mandatory bundle pointers are missing', async () => {
    const { svc, prisma } = makeDeps();
    (prisma.bookingDocumentBundle.findFirst as jest.Mock).mockResolvedValue({
      termsDocumentId: null,
      withdrawalDocumentId: 'gen-consumer',
      privacyDocumentId: 'gen-privacy',
    });
    await expect(svc.enforceAndRecordCheckoutConfirmation(baseInput)).rejects.toMatchObject({
      response: { code: BOOKING_LEGAL_CONFIRMATION_ERROR_CODE.LEGAL_DOCUMENT_MISSING },
    });
  });

  it('rejects when snapshot integrity is invalid (hash manipulation)', async () => {
    const { svc, legalDocumentSnapshots } = makeDeps();
    (legalDocumentSnapshots.ensureCheckoutSnapshots as jest.Mock).mockResolvedValue([
      makeSnapshot(DOCUMENT_TYPE.TERMS_AND_CONDITIONS, { integrityStatus: 'CHECKSUM_MISMATCH' }),
      makeSnapshot(DOCUMENT_TYPE.CONSUMER_INFORMATION),
      makeSnapshot(DOCUMENT_TYPE.PRIVACY_POLICY),
    ]);
    await expect(svc.enforceAndRecordCheckoutConfirmation(baseInput)).rejects.toMatchObject({
      response: { code: BOOKING_LEGAL_CONFIRMATION_ERROR_CODE.LEGAL_EVIDENCE_INVALID },
    });
  });

  it('rejects when snapshot version does not match resolver (stale presentation)', async () => {
    const { svc, legalDocumentSnapshots } = makeDeps();
    (legalDocumentSnapshots.ensureCheckoutSnapshots as jest.Mock).mockResolvedValue([
      makeSnapshot(DOCUMENT_TYPE.TERMS_AND_CONDITIONS, { renderedVersion: 'v2025-old' }),
      makeSnapshot(DOCUMENT_TYPE.CONSUMER_INFORMATION),
      makeSnapshot(DOCUMENT_TYPE.PRIVACY_POLICY),
    ]);
    await expect(svc.enforceAndRecordCheckoutConfirmation(baseInput)).rejects.toMatchObject({
      response: { code: BOOKING_LEGAL_CONFIRMATION_ERROR_CODE.LEGAL_DOCUMENT_VERSION_MISMATCH },
    });
  });

  it('rejects direct API confirmation without prior evidence records', async () => {
    const { svc, prisma } = makeDeps();
    (prisma.bookingLegalDocumentSnapshot.findMany as jest.Mock).mockResolvedValue([]);
    await expect(
      svc.assertExistingLegalEvidenceForConfirmation('org-1', 'bk-1'),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      svc.assertExistingLegalEvidenceForConfirmation('org-1', 'bk-1'),
    ).rejects.toMatchObject({
      response: { code: BOOKING_LEGAL_CONFIRMATION_ERROR_CODE.LEGAL_DOCUMENT_MISSING },
    });
  });

  it('rejects direct API confirmation when acceptances are missing', async () => {
    const { svc, prisma } = makeDeps();
    (prisma.bookingLegalDocumentSnapshot.findMany as jest.Mock).mockResolvedValue([
      makeSnapshot(DOCUMENT_TYPE.TERMS_AND_CONDITIONS),
      makeSnapshot(DOCUMENT_TYPE.CONSUMER_INFORMATION),
      makeSnapshot(DOCUMENT_TYPE.PRIVACY_POLICY),
    ]);
    (prisma.bookingLegalAcceptance.findMany as jest.Mock).mockResolvedValue([]);
    await expect(
      svc.assertExistingLegalEvidenceForConfirmation('org-1', 'bk-1'),
    ).rejects.toMatchObject({
      response: { code: BOOKING_LEGAL_CONFIRMATION_ERROR_CODE.LEGAL_ACCEPTANCE_REQUIRED },
    });
  });
});
