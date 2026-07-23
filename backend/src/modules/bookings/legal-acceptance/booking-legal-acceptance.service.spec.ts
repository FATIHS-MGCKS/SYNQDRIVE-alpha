import { BookingLegalAcceptanceService } from './booking-legal-acceptance.service';
import { BookingLegalAcceptanceError } from './booking-legal-acceptance.errors';
import { BOOKING_LEGAL_ACCEPTANCE_ERROR_CODE } from './booking-legal-acceptance.constants';
import type { BookingLegalDocumentSnapshotService } from '@modules/documents/legal-document-snapshot/booking-legal-document-snapshot.service';

function makePrisma(overrides: Record<string, unknown> = {}) {
  const store: {
    acceptances: Array<Record<string, unknown>>;
    bookings: Array<Record<string, unknown>>;
    bundles: Array<Record<string, unknown>>;
    generatedDocuments: Array<Record<string, unknown>>;
  } = {
    acceptances: [],
    bookings: [
      {
        id: 'bk-1',
        organizationId: 'org-1',
        customerId: 'cust-1',
      },
    ],
    bundles: [
      {
        organizationId: 'org-1',
        bookingId: 'bk-1',
        termsDocumentId: 'gen-terms',
        privacyDocumentId: 'gen-privacy',
      },
    ],
    generatedDocuments: [
      {
        id: 'gen-terms',
        organizationId: 'org-1',
        documentType: 'TERMS_AND_CONDITIONS',
        legalVersionLabel: 'v2026-01',
        checksum: 'a'.repeat(64),
        legalDocumentId: 'legal-terms',
        metadata: { language: 'de' },
      },
      {
        id: 'gen-privacy',
        organizationId: 'org-1',
        documentType: 'PRIVACY_POLICY',
        legalVersionLabel: 'v2026-02',
        checksum: 'b'.repeat(64),
        legalDocumentId: 'legal-privacy',
        metadata: { language: 'de' },
      },
    ],
  };

  const prisma = {
    booking: {
      findFirst: jest.fn(async ({ where }: { where: { id: string; organizationId: string } }) =>
        store.bookings.find(
          (b) => b.id === where.id && b.organizationId === where.organizationId,
        ) ?? null,
      ),
    },
    bookingDocumentBundle: {
      findFirst: jest.fn(async ({ where }: { where: { organizationId: string; bookingId: string } }) =>
        store.bundles.find(
          (b) => b.organizationId === where.organizationId && b.bookingId === where.bookingId,
        ) ?? null,
      ),
    },
    generatedDocument: {
      findFirst: jest.fn(async ({ where }: { where: { id?: string; organizationId: string } }) =>
        store.generatedDocuments.find(
          (d) => d.id === where.id && d.organizationId === where.organizationId,
        ) ?? null,
      ),
    },
    bookingLegalAcceptance: {
      findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        if (where.requestId) {
          return (
            store.acceptances.find(
              (a) =>
                a.organizationId === where.organizationId &&
                a.requestId === where.requestId,
            ) ?? null
          );
        }
        if (where.id) {
          return (
            store.acceptances.find(
              (a) => a.id === where.id && a.organizationId === where.organizationId,
            ) ?? null
          );
        }
        return null;
      }),
      findMany: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
        store.acceptances.filter((a) => {
          if (where.organizationId && a.organizationId !== where.organizationId) return false;
          if (where.bookingId && a.bookingId !== where.bookingId) return false;
          if (where.customerId && a.customerId !== where.customerId) return false;
          return true;
        }),
      ),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = {
          id: `acc-${store.acceptances.length + 1}`,
          createdAt: new Date(),
          retentionClass: 'LEGAL_ACCEPTANCE',
          legalHold: false,
          retainUntil: null,
          eventKind: 'ACCEPTANCE',
          ...flattenCreateData(data),
        };
        store.acceptances.push(row);
        return row;
      }),
    },
    ...overrides,
  };

  return { prisma, store };
}

function flattenCreateData(data: Record<string, unknown>): Record<string, unknown> {
  const flat: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value && typeof value === 'object' && 'connect' in (value as object)) {
      const connect = (value as { connect: { id: string } }).connect;
      flat[`${key}Id`] = connect.id;
      continue;
    }
    flat[key] = value;
  }
  return flat;
}

describe('BookingLegalAcceptanceService', () => {
  function makeSvc(prisma: unknown, snapshotSvc?: Partial<BookingLegalDocumentSnapshotService>) {
    const legalDocumentSnapshots = {
      ensureCheckoutSnapshots: jest.fn(async () => []),
      createFromGeneratedDocument: jest.fn(async () => ({
        id: 'snap-1',
        contentHash: 'a'.repeat(64),
        renderedVersion: 'v1',
        language: 'de',
        hashAlgorithm: 'sha256',
        templateVersion: '1',
        documentType: 'TERMS_AND_CONDITIONS',
        legalDocumentId: 'legal-terms',
        generatedDocumentId: 'gen-terms',
        integrityStatus: 'VERIFIED',
      })),
      ...snapshotSvc,
    };
    return {
      svc: new BookingLegalAcceptanceService(prisma as never, legalDocumentSnapshots as never),
      legalDocumentSnapshots,
    };
  }

  it('records terms and privacy notice acknowledgment separately at checkout', async () => {
    const { prisma, store } = makePrisma();
    const { svc, legalDocumentSnapshots } = makeSvc(prisma, {
      ensureCheckoutSnapshots: jest.fn(async () => [
        {
          id: 'snap-terms',
          organizationId: 'org-1',
          bookingId: 'bk-1',
          documentType: 'TERMS_AND_CONDITIONS',
          templateKey: null,
          templateVersion: '1',
          renderedVersion: 'v2026-01',
          hashAlgorithm: 'sha256',
          contentHash: 'a'.repeat(64),
          language: 'de',
          generatedDocumentId: 'gen-terms',
          legalDocumentId: 'legal-terms',
          presentationContext: 'CHECKOUT',
          integrityStatus: 'VERIFIED',
          integrityVerifiedAt: null,
          idempotencyKey: 'k1',
          createdAt: new Date().toISOString(),
        },
        {
          id: 'snap-privacy',
          organizationId: 'org-1',
          bookingId: 'bk-1',
          documentType: 'PRIVACY_POLICY',
          templateKey: null,
          templateVersion: '1',
          renderedVersion: 'v2026-02',
          hashAlgorithm: 'sha256',
          contentHash: 'b'.repeat(64),
          language: 'de',
          generatedDocumentId: 'gen-privacy',
          legalDocumentId: 'legal-privacy',
          presentationContext: 'CHECKOUT',
          integrityStatus: 'VERIFIED',
          integrityVerifiedAt: null,
          idempotencyKey: 'k2',
          createdAt: new Date().toISOString(),
        },
      ]),
    });

    const rows = await svc.recordCheckoutAcceptancesFromFlags({
      organizationId: 'org-1',
      bookingId: 'bk-1',
      customerId: 'cust-1',
      agbAccepted: true,
      privacyAccepted: true,
    });

    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.acceptanceType)).toEqual([
      'TERMS_CONTRACT_ACCEPTANCE',
      'PRIVACY_NOTICE_ACKNOWLEDGMENT',
    ]);
    expect(rows[1].legalBasis).toBe('NOTICE_ACKNOWLEDGMENT');
    expect(rows[0].legalDocumentSnapshotId).toBe('snap-terms');
    expect(rows[1].legalDocumentSnapshotId).toBe('snap-privacy');
    expect(legalDocumentSnapshots.ensureCheckoutSnapshots).toHaveBeenCalled();
    expect(store.acceptances).toHaveLength(2);
  });

  it('does not fabricate acceptance when no checkout snapshots exist', async () => {
    const { prisma } = makePrisma();
    const { svc } = makeSvc(prisma, { ensureCheckoutSnapshots: jest.fn(async () => []) });

    const rows = await svc.recordCheckoutAcceptancesFromFlags({
      organizationId: 'org-1',
      bookingId: 'bk-1',
      customerId: 'cust-1',
      agbAccepted: true,
      privacyAccepted: false,
    });

    expect(rows).toHaveLength(0);
  });

  it('is idempotent via requestId', async () => {
    const { prisma } = makePrisma();
    const { svc } = makeSvc(prisma);

    const first = await svc.recordAcceptance({
      organizationId: 'org-1',
      bookingId: 'bk-1',
      customerId: 'cust-1',
      actor: { actorType: 'CUSTOMER', actorId: 'cust-1' },
      acceptanceType: 'MARKETING_CONSENT',
      documentType: 'MARKETING_PREFERENCE',
      documentVersion: 'v1',
      immutableDocumentHash: 'c'.repeat(64),
      language: 'de',
      source: 'checkout_wizard',
      requestId: 'req-marketing-1',
    });
    const second = await svc.recordAcceptance({
      organizationId: 'org-1',
      bookingId: 'bk-1',
      customerId: 'cust-1',
      actor: { actorType: 'CUSTOMER', actorId: 'cust-1' },
      acceptanceType: 'MARKETING_CONSENT',
      documentType: 'MARKETING_PREFERENCE',
      documentVersion: 'v1',
      immutableDocumentHash: 'c'.repeat(64),
      language: 'de',
      source: 'checkout_wizard',
      requestId: 'req-marketing-1',
    });

    expect(second.id).toBe(first.id);
  });

  it('rejects revocation for non-revocable acceptance types', async () => {
    const { prisma } = makePrisma();
    const { svc } = makeSvc(prisma);

    const acceptance = await svc.recordAcceptance({
      organizationId: 'org-1',
      bookingId: 'bk-1',
      customerId: 'cust-1',
      actor: { actorType: 'CUSTOMER', actorId: 'cust-1' },
      acceptanceType: 'TERMS_CONTRACT_ACCEPTANCE',
      documentType: 'TERMS_AND_CONDITIONS',
      documentVersion: 'v1',
      immutableDocumentHash: 'd'.repeat(64),
      language: 'de',
      source: 'checkout_wizard',
      requestId: 'req-terms-1',
    });

    await expect(
      svc.revokeConsent({
        organizationId: 'org-1',
        bookingId: 'bk-1',
        customerId: 'cust-1',
        actor: { actorType: 'CUSTOMER', actorId: 'cust-1' },
        acceptanceId: acceptance.id,
        source: 'api',
      }),
    ).rejects.toMatchObject({
      code: BOOKING_LEGAL_ACCEPTANCE_ERROR_CODE.INVALID_REVOCATION,
    });
  });

  it('appends revocation event for marketing consent', async () => {
    const { prisma, store } = makePrisma();
    const { svc } = makeSvc(prisma);

    const acceptance = await svc.recordAcceptance({
      organizationId: 'org-1',
      bookingId: 'bk-1',
      customerId: 'cust-1',
      actor: { actorType: 'CUSTOMER', actorId: 'cust-1' },
      acceptanceType: 'MARKETING_CONSENT',
      documentType: 'MARKETING_PREFERENCE',
      documentVersion: 'v1',
      immutableDocumentHash: 'e'.repeat(64),
      language: 'de',
      source: 'checkout_wizard',
      requestId: 'req-marketing-revoke',
    });

    const revoked = await svc.revokeConsent({
      organizationId: 'org-1',
      bookingId: 'bk-1',
      customerId: 'cust-1',
      actor: { actorType: 'CUSTOMER', actorId: 'cust-1' },
      acceptanceId: acceptance.id,
      source: 'api',
      requestId: 'req-revoke-1',
    });

    expect(revoked.eventKind).toBe('REVOCATION');
    expect(revoked.revokedAt).not.toBeNull();
    expect(revoked.relatedAcceptanceId).toBe(acceptance.id);
    expect(store.acceptances).toHaveLength(2);
  });

  it('rejects forbidden metadata keys', async () => {
    const { prisma } = makePrisma();
    const { svc } = makeSvc(prisma);

    await expect(
      svc.recordAcceptance({
        organizationId: 'org-1',
        bookingId: 'bk-1',
        customerId: 'cust-1',
        actor: { actorType: 'CUSTOMER', actorId: 'cust-1' },
        acceptanceType: 'HANDOVER_SIGNATURE',
        documentType: 'HANDOVER_PICKUP',
        documentVersion: 'v1',
        immutableDocumentHash: 'f'.repeat(64),
        language: 'de',
        source: 'handover_flow',
        metadata: { signatureDataUrl: 'data:image/png;base64,abc' },
      }),
    ).rejects.toBeInstanceOf(BookingLegalAcceptanceError);
  });

  it('records handover signatures without embedding raw signature blobs', async () => {
    const { prisma, store } = makePrisma();
    const { svc } = makeSvc(prisma);

    const rows = await svc.recordHandoverSignatures({
      organizationId: 'org-1',
      bookingId: 'bk-1',
      customerId: 'cust-1',
      handoverProtocolId: 'proto-1',
      kind: 'PICKUP',
      customerSignatureName: 'Max Mustermann',
      staffSignatureName: 'Staff User',
      actorUserId: 'user-1',
    });

    expect(rows).toHaveLength(2);
    expect(rows[0].acceptanceType).toBe('HANDOVER_SIGNATURE');
    expect((rows[0].metadata as { signatureName?: string }).signatureName).toBe('Max Mustermann');
    expect(
      store.acceptances.every((a) => {
        const meta = a.metadata;
        return !meta || typeof meta !== 'object' || !('signatureDataUrl' in meta);
      }),
    ).toBe(true);
  });
});
