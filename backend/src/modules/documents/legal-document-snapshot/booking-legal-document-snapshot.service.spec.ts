import { BookingLegalDocumentSnapshotService } from './booking-legal-document-snapshot.service';
import { BookingLegalDocumentSnapshotError } from './booking-legal-document-snapshot.errors';
import { BOOKING_LEGAL_DOCUMENT_SNAPSHOT_ERROR_CODE } from './booking-legal-document-snapshot.constants';
import { LEGAL_DOCUMENT_INTEGRITY_STATUS } from '../integrity/legal-document-integrity.constants';

function makeDeps(overrides: {
  generatedDocument?: Record<string, unknown> | null;
  existingSnapshot?: Record<string, unknown> | null;
  verificationStatus?: string;
} = {}) {
  const store = {
    snapshots: [] as Array<Record<string, unknown>>,
    events: [] as Array<Record<string, unknown>>,
    generatedDocuments: [
      overrides.generatedDocument ?? {
        id: 'gen-terms',
        organizationId: 'org-1',
        bookingId: 'bk-1',
        documentType: 'TERMS_AND_CONDITIONS',
        templateKey: 'legal-static',
        templateVersion: '1',
        legalVersionLabel: 'v2026-01',
        checksum: 'a'.repeat(64),
        legalDocumentId: 'legal-1',
        objectKey: 'objects/terms.pdf',
        storageProvider: 'local',
        metadata: { language: 'de' },
      },
    ],
    bookings: [{ id: 'bk-1', organizationId: 'org-1' }],
    bundles: [
      {
        organizationId: 'org-1',
        bookingId: 'bk-1',
        termsDocumentId: 'gen-terms',
        withdrawalDocumentId: 'gen-consumer',
        privacyDocumentId: 'gen-privacy',
      },
    ],
  };

  if (!overrides.generatedDocument && store.generatedDocuments.length === 1) {
    store.generatedDocuments.push(
      {
        id: 'gen-consumer',
        organizationId: 'org-1',
        bookingId: 'bk-1',
        documentType: 'CONSUMER_INFORMATION',
        legalVersionLabel: 'v2026-01',
        checksum: 'b'.repeat(64),
        legalDocumentId: 'legal-2',
        objectKey: 'objects/consumer.pdf',
        storageProvider: 'local',
        metadata: { language: 'de' },
      },
      {
        id: 'gen-privacy',
        organizationId: 'org-1',
        bookingId: 'bk-1',
        documentType: 'PRIVACY_POLICY',
        legalVersionLabel: 'v2026-02',
        checksum: 'c'.repeat(64),
        legalDocumentId: 'legal-3',
        objectKey: 'objects/privacy.pdf',
        storageProvider: 'local',
        metadata: { language: 'en' },
      },
    );
  }

  if (overrides.existingSnapshot) {
    store.snapshots.push(overrides.existingSnapshot);
  }

  const prisma = {
    booking: {
      findFirst: jest.fn(async ({ where }: { where: { id: string; organizationId: string } }) =>
        store.bookings.find(
          (b) => b.id === where.id && b.organizationId === where.organizationId,
        ) ?? null,
      ),
    },
    bookingDocumentBundle: {
      findFirst: jest.fn(async () => store.bundles[0] ?? null),
    },
    generatedDocument: {
      findFirst: jest.fn(async ({ where }: { where: { id?: string; organizationId: string } }) =>
        store.generatedDocuments.find(
          (d) => d.id === where.id && d.organizationId === where.organizationId,
        ) ?? null,
      ),
    },
    bookingLegalDocumentSnapshot: {
      findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        if (where.id) {
          return (
            store.snapshots.find(
              (s) => s.id === where.id && s.organizationId === where.organizationId,
            ) ?? null
          );
        }
        if (where.idempotencyKey) {
          return (
            store.snapshots.find(
              (s) =>
                s.organizationId === where.organizationId &&
                s.idempotencyKey === where.idempotencyKey,
            ) ?? null
          );
        }
        if (where.documentType) {
          const matches = store.snapshots.filter(
            (s) =>
              s.organizationId === where.organizationId &&
              s.bookingId === where.bookingId &&
              s.documentType === where.documentType,
          );
          return matches[matches.length - 1] ?? null;
        }
        return null;
      }),
      findMany: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
        store.snapshots.filter(
          (s) => s.organizationId === where.organizationId && s.bookingId === where.bookingId,
        ),
      ),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `snap-${store.snapshots.length + 1}`, createdAt: new Date(), ...data };
        store.snapshots.push(row);
        return row;
      }),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const idx = store.snapshots.findIndex((s) => s.id === where.id);
        store.snapshots[idx] = { ...store.snapshots[idx], ...data };
        return store.snapshots[idx];
      }),
    },
    bookingLegalDocumentSnapshotEvent: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `evt-${store.events.length + 1}`, ...data };
        store.events.push(row);
        return row;
      }),
    },
  };

  const checksumVerification = {
    verify: jest.fn(async () => ({
      status: overrides.verificationStatus ?? LEGAL_DOCUMENT_INTEGRITY_STATUS.VERIFIED,
      expectedChecksum: 'a'.repeat(64),
      actualChecksum: 'a'.repeat(64),
      checkedAt: new Date(),
    })),
  };

  return {
    svc: new BookingLegalDocumentSnapshotService(prisma as never, checksumVerification as never),
    prisma,
    checksumVerification,
    store,
  };
}

describe('BookingLegalDocumentSnapshotService', () => {
  it('creates immutable snapshot with version, hash algorithm, and language', async () => {
    const { svc, store } = makeDeps();
    const snapshot = await svc.createFromGeneratedDocument({
      organizationId: 'org-1',
      bookingId: 'bk-1',
      generatedDocumentId: 'gen-terms',
      presentationContext: 'CHECKOUT',
    });

    expect(snapshot.renderedVersion).toBe('v2026-01');
    expect(snapshot.hashAlgorithm).toBe('sha256');
    expect(snapshot.contentHash).toBe('a'.repeat(64));
    expect(snapshot.language).toBe('de');
    expect(snapshot.integrityStatus).toBe('VERIFIED');
    expect(store.events.some((e) => e.eventType === 'SNAPSHOT_CREATED')).toBe(true);
  });

  it('returns same snapshot on repeated creation (idempotent)', async () => {
    const { svc } = makeDeps();
    const first = await svc.createFromGeneratedDocument({
      organizationId: 'org-1',
      bookingId: 'bk-1',
      generatedDocumentId: 'gen-terms',
      presentationContext: 'CHECKOUT',
    });
    const second = await svc.createFromGeneratedDocument({
      organizationId: 'org-1',
      bookingId: 'bk-1',
      generatedDocumentId: 'gen-terms',
      presentationContext: 'CHECKOUT',
    });
    expect(second.id).toBe(first.id);
  });

  it('preserves old snapshot when template version changes after acceptance', async () => {
    const existingHash = 'a'.repeat(64);
    const { svc, store } = makeDeps({
      existingSnapshot: {
        id: 'snap-old',
        organizationId: 'org-1',
        bookingId: 'bk-1',
        documentType: 'TERMS_AND_CONDITIONS',
        renderedVersion: 'v2026-01',
        contentHash: existingHash,
        hashAlgorithm: 'sha256',
        language: 'de',
        generatedDocumentId: 'gen-terms',
        legalDocumentId: 'legal-1',
        presentationContext: 'CHECKOUT',
        integrityStatus: 'VERIFIED',
        idempotencyKey: `snapshot:bk-1:TERMS_AND_CONDITIONS:${existingHash}`,
        createdAt: new Date('2026-01-01'),
      },
    });

    store.generatedDocuments[0] = {
      ...store.generatedDocuments[0],
      legalVersionLabel: 'v2026-02',
      checksum: 'd'.repeat(64),
    };

    const newSnapshot = await svc.createFromGeneratedDocument({
      organizationId: 'org-1',
      bookingId: 'bk-1',
      generatedDocumentId: 'gen-terms',
      presentationContext: 'CHECKOUT',
    });

    expect(newSnapshot.id).not.toBe('snap-old');
    expect(newSnapshot.renderedVersion).toBe('v2026-02');
    expect(store.snapshots).toHaveLength(2);
  });

  it('detects hash manipulation via integrity verification', async () => {
    const { svc, checksumVerification } = makeDeps({
      verificationStatus: LEGAL_DOCUMENT_INTEGRITY_STATUS.CHECKSUM_MISMATCH,
    });

    const snapshot = await svc.createFromGeneratedDocument({
      organizationId: 'org-1',
      bookingId: 'bk-1',
      generatedDocumentId: 'gen-terms',
      presentationContext: 'CHECKOUT',
    });

    expect(snapshot.integrityStatus).toBe('CHECKSUM_MISMATCH');
    expect(checksumVerification.verify).toHaveBeenCalled();
  });

  it('stores different language snapshots independently', async () => {
    const { svc } = makeDeps();
    const terms = await svc.createFromGeneratedDocument({
      organizationId: 'org-1',
      bookingId: 'bk-1',
      generatedDocumentId: 'gen-terms',
      presentationContext: 'CHECKOUT',
    });
    const privacy = await svc.createFromGeneratedDocument({
      organizationId: 'org-1',
      bookingId: 'bk-1',
      generatedDocumentId: 'gen-privacy',
      presentationContext: 'CHECKOUT',
    });

    expect(terms.language).toBe('de');
    expect(privacy.language).toBe('en');
    expect(terms.id).not.toBe(privacy.id);
  });

  it('rejects cross-tenant generated document access', async () => {
    const { svc } = makeDeps({
      generatedDocument: {
        id: 'gen-other',
        organizationId: 'org-other',
        bookingId: 'bk-other',
        documentType: 'TERMS_AND_CONDITIONS',
        checksum: 'a'.repeat(64),
        objectKey: 'x',
        storageProvider: 'local',
      },
    });

    await expect(
      svc.createFromGeneratedDocument({
        organizationId: 'org-1',
        bookingId: 'bk-1',
        generatedDocumentId: 'gen-other',
        presentationContext: 'CHECKOUT',
      }),
    ).rejects.toMatchObject({
      code: BOOKING_LEGAL_DOCUMENT_SNAPSHOT_ERROR_CODE.CROSS_TENANT,
    });
  });

  it('blocks silent regeneration for same version label with different checksum', () => {
    const { svc } = makeDeps();
    expect(() =>
      svc.assertNoSilentRegeneration(
        { id: 'gen-1', legalVersionLabel: 'v2026-01', checksum: 'a'.repeat(64) },
        { versionLabel: 'v2026-01', checksum: 'b'.repeat(64) },
      ),
    ).toThrow(BookingLegalDocumentSnapshotError);
  });

  it('ensureCheckoutSnapshots creates snapshots for all bundle legal pointers', async () => {
    const { svc, store } = makeDeps();
    const snapshots = await svc.ensureCheckoutSnapshots('org-1', 'bk-1');
    expect(snapshots).toHaveLength(3);
    expect(store.snapshots).toHaveLength(3);
  });
});
