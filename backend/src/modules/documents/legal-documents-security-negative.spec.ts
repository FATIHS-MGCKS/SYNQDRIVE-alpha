/**
 * Consolidated security negative tests for the legal-document process.
 * Uses in-memory transaction harnesses and real service logic — not full happy-path mocks.
 */
import { NotFoundException } from '@nestjs/common';
import { Readable } from 'stream';
import { createHash } from 'crypto';
import { DOCUMENT_TYPE, LEGAL_STATUS } from './documents.constants';
import { LEGAL_DOCUMENT_ERROR_CODES } from './legal-documents.errors';
import {
  LegalDocumentForbiddenError,
  LegalDocumentIntegrityUnavailableError,
  LegalDocumentInvalidTransitionError,
  LegalDocumentNotActivatableError,
  LegalDocumentNotFoundError,
  LegalDocumentPdfValidationError,
  LegalDocumentScanNotPassedError,
  LegalDocumentValidationError,
} from './legal-documents-api.errors';
import { createLegalDocumentActivationHarness } from './legal-documents-activation.integration.harness';
import { createLegalDocumentsServiceForTests } from './integrity/legal-document-integrity.test-utils';
import { createNoopLegalDocumentEventsService } from './legal-document-events.test-utils';
import { createNoopLegalDocumentScopeService } from './legal-document-scope.test-utils';
import { createNoopLegalDocumentIngestionService } from './legal-document-ingestion.test-utils';
import { LegalDocumentFourEyesService } from './legal-document-four-eyes.service';
import { LegalDocumentEventsService } from './legal-document-events.service';
import { LegalDocumentDeliveryEvidenceService } from './legal-document-delivery-evidence.service';
import { LegalDocumentDeliveryEvidenceError } from './legal-document-delivery-evidence.errors';
import { LEGAL_DELIVERY_EVIDENCE_ERROR_CODE } from './legal-document-delivery-evidence.constants';
import { LEGAL_DOCUMENT_INTEGRITY_STATUS } from './integrity/legal-document-integrity.constants';
import { resolveLegalDocuments } from './legal-document-resolver.engine';
import { LEGAL_DOCUMENT_RESOLVER_ERROR_CODES } from './legal-document-resolver.constants';
import { BookingPickupGateService } from '@modules/bookings/booking-pickup-gate/booking-pickup-gate.service';
import { PickupGateBlockedException } from '@modules/bookings/booking-pickup-gate/booking-pickup-gate.errors';
import { LocalDocumentStorageService } from './storage/local-document-storage.service';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

const buf = Buffer.from('%PDF-1.4 legal negative test');

function makeLegalSvc(
  h: ReturnType<typeof createLegalDocumentActivationHarness>,
  overrides: {
    fourEyes?: LegalDocumentFourEyesService | ReturnType<typeof createNoopFourEyes>;
    ingestion?: unknown;
    storage?: unknown;
    checksumVerification?: unknown;
    integrityPersistence?: unknown;
    config?: Record<string, unknown>;
  } = {},
) {
  return createLegalDocumentsServiceForTests(h.prisma, {
    events: createNoopLegalDocumentEventsService(),
    scope: createNoopLegalDocumentScopeService(),
    fourEyes: overrides.fourEyes ?? createNoopFourEyes(),
    ingestion: overrides.ingestion ?? createNoopLegalDocumentIngestionService(),
    storage:
      overrides.storage ??
      ({
        putObject: jest.fn(),
        getObjectStream: jest.fn().mockResolvedValue(Readable.from([buf])),
      } as any),
    checksumVerification: overrides.checksumVerification,
    integrityPersistence: overrides.integrityPersistence,
    config: overrides.config,
  });
}

function createNoopFourEyes() {
  return {
    isEnabled: jest.fn().mockResolvedValue(false),
    assertSeparation: jest.fn().mockResolvedValue(undefined),
  };
}

function createEnforcedFourEyes(enabled = true) {
  const prisma = {
    organization: {
      findUnique: jest.fn().mockResolvedValue({ legalDocumentFourEyesEnabled: enabled }),
    },
  };
  return new LegalDocumentFourEyesService(prisma as never);
}

describe('Legal documents — security negative tests', () => {
  describe('tenant isolation', () => {
    it('rejects manipulated organizationId on getDetail (structured 404)', async () => {
      const h = createLegalDocumentActivationHarness();
      h.seedApproved({
        id: 'doc-org-b',
        organizationId: 'org-b',
        documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
        versionLabel: 'v1',
      });
      const svc = makeLegalSvc(h);

      await expect(svc.getDetail('org-a', 'doc-org-b')).rejects.toBeInstanceOf(
        LegalDocumentNotFoundError,
      );
    });

    it('rejects foreign documentId on lifecycle mutation', async () => {
      const h = createLegalDocumentActivationHarness();
      h.seedApproved({
        id: 'foreign-doc',
        organizationId: 'org-b',
        documentType: DOCUMENT_TYPE.PRIVACY_POLICY,
        versionLabel: 'v1',
      });
      const svc = makeLegalSvc(h);

      await expect(svc.approve('org-a', 'foreign-doc')).rejects.toBeInstanceOf(
        LegalDocumentNotFoundError,
      );
    });

    it('rejects foreign bookingId on delivery evidence list', async () => {
      const prisma = {
        booking: {
          findFirst: jest.fn().mockResolvedValue(null),
        },
        legalDocumentDeliveryEvidence: { findMany: jest.fn() },
      };
      const svc = new LegalDocumentDeliveryEvidenceService(prisma as never);

      await expect(svc.listForBooking('org-a', 'foreign-booking')).rejects.toBeInstanceOf(
        LegalDocumentDeliveryEvidenceError,
      );
      expect(prisma.legalDocumentDeliveryEvidence.findMany).not.toHaveBeenCalled();
    });

    it('rejects audit access for foreign-tenant document', async () => {
      const prisma = {
        organizationLegalDocument: {
          findFirst: jest.fn().mockResolvedValue(null),
        },
      };
      const svc = new LegalDocumentEventsService(prisma as never);

      await expect(svc.listForDocument('org-a', 'doc-in-org-b', {})).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('upload validation & storage safety', () => {
    it('rejects forged MIME type when ingestion detects non-PDF content', async () => {
      const ingestion = {
        ingest: jest.fn().mockRejectedValue(
          new LegalDocumentPdfValidationError('File content is not a valid PDF', 'LEGAL_PDF_NOT_PDF'),
        ),
      };
      const svc = makeLegalSvc(createLegalDocumentActivationHarness(), { ingestion });

      await expect(
        svc.upload({
          organizationId: 'org-a',
          documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
          versionLabel: 'v1',
          fileName: 'evil.exe.pdf',
          buffer: Buffer.from('MZ'),
          mimeType: 'application/pdf',
        }),
      ).rejects.toBeInstanceOf(LegalDocumentPdfValidationError);
    });

    it('rejects path traversal in original filename via storage adapter', async () => {
      const baseDir = await mkdtemp(join(tmpdir(), 'synq-legal-sec-'));
      const quarantineDir = await mkdtemp(join(tmpdir(), 'synq-legal-q-sec-'));
      const storage = new LocalDocumentStorageService({
        get: jest.fn((key: string, def?: unknown) => {
          const map: Record<string, unknown> = {
            'documents.localStorageDir': baseDir,
            'documents.localQuarantineStorageDir': quarantineDir,
          };
          return key in map ? map[key] : def;
        }),
      } as any);

      const put = await storage.putObject({
        organizationId: 'org-a',
        bookingId: null,
        documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
        originalName: '../../etc/passwd.pdf',
        buffer: buf,
        mimeType: 'application/pdf',
      });

      expect(put.objectKey).not.toContain('..');
      expect(put.objectKey).toMatch(/^organizations\/org-a\/legal\//);

      await rm(baseDir, { recursive: true, force: true });
      await rm(quarantineDir, { recursive: true, force: true });
    });
  });

  describe('four-eyes principle', () => {
    it('blocks uploader from approving own document when four-eyes is enabled', async () => {
      const h = createLegalDocumentActivationHarness();
      const row = h.seedDraft({
        id: 'doc-fe',
        organizationId: 'org-a',
        documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
        versionLabel: 'v1',
      });
      row.uploadedByUserId = 'uploader-1';
      row.submittedForReviewByUserId = 'reviewer-2';
      row.scanStatus = 'SCAN_PASSED';

      const fourEyes = createEnforcedFourEyes(true);
      const svc = makeLegalSvc(h, { fourEyes });

      await expect(
        svc.approve('org-a', 'doc-fe', { userId: 'uploader-1', displayName: 'Uploader' }),
      ).rejects.toBeInstanceOf(LegalDocumentForbiddenError);
    });

    it('blocks uploader from activating own document when four-eyes is enabled', async () => {
      const h = createLegalDocumentActivationHarness();
      const row = h.seedApproved({
        id: 'doc-fe-act',
        organizationId: 'org-a',
        documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
        versionLabel: 'v1',
      });
      row.uploadedByUserId = 'uploader-1';
      row.approvedByUserId = 'reviewer-2';

      const fourEyes = createEnforcedFourEyes(true);
      const svc = makeLegalSvc(h, { fourEyes });

      await expect(
        svc.activate('org-a', 'doc-fe-act', { userId: 'uploader-1' }),
      ).rejects.toBeInstanceOf(LegalDocumentForbiddenError);
    });
  });

  describe('lifecycle & status integrity', () => {
    it('rejects illegal status transition DRAFT → ACTIVE', async () => {
      const h = createLegalDocumentActivationHarness();
      h.seedDraft({
        id: 'draft-1',
        organizationId: 'org-a',
        documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
        versionLabel: 'v1',
      });
      const svc = makeLegalSvc(h);

      await expect(svc.activate('org-a', 'draft-1')).rejects.toBeInstanceOf(
        LegalDocumentNotActivatableError,
      );
    });

    it('rejects activation of revoked document', async () => {
      const h = createLegalDocumentActivationHarness();
      const row = h.seedApproved({
        id: 'revoked-1',
        organizationId: 'org-a',
        documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
        versionLabel: 'v1',
      });
      row.status = LEGAL_STATUS.REVOKED;
      row.revokedAt = new Date();
      const svc = makeLegalSvc(h);

      await expect(svc.activate('org-a', 'revoked-1')).rejects.toBeInstanceOf(
        LegalDocumentNotActivatableError,
      );
    });

    it('rejects direct archive from ACTIVE (must supersede or revoke first)', async () => {
      const h = createLegalDocumentActivationHarness();
      const row = h.seedApproved({
        id: 'active-1',
        organizationId: 'org-a',
        documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
        versionLabel: 'v1',
      });
      row.status = LEGAL_STATUS.ACTIVE;
      const svc = makeLegalSvc(h);

      await expect(svc.archive('org-a', 'active-1')).rejects.toBeInstanceOf(
        LegalDocumentInvalidTransitionError,
      );
    });

    it('rejects manipulated client schedule timestamp (invalid validFrom)', async () => {
      const h = createLegalDocumentActivationHarness();
      h.seedApproved({
        id: 'sched-1',
        organizationId: 'org-a',
        documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
        versionLabel: 'v1',
      });
      const svc = makeLegalSvc(h);

      await expect(
        svc.schedule('org-a', 'sched-1', { validFrom: new Date('invalid') as Date }),
      ).rejects.toBeInstanceOf(LegalDocumentValidationError);
    });
  });

  describe('scan gating', () => {
    it('rejects activation with unknown scan status', async () => {
      const h = createLegalDocumentActivationHarness();
      const row = h.seedApproved({
        id: 'scan-unknown',
        organizationId: 'org-a',
        documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
        versionLabel: 'v1',
      });
      row.scanStatus = 'UNKNOWN_SCANNER_STATE';
      const svc = makeLegalSvc(h);

      await expect(svc.activate('org-a', 'scan-unknown')).rejects.toBeInstanceOf(
        LegalDocumentScanNotPassedError,
      );
    });
  });

  describe('integrity & download authorization', () => {
    it('blocks download for foreign-tenant document', async () => {
      const h = createLegalDocumentActivationHarness();
      h.seedApproved({
        id: 'dl-foreign',
        organizationId: 'org-b',
        documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
        versionLabel: 'v1',
      });
      const svc = makeLegalSvc(h);

      await expect(svc.getDownload('org-a', 'dl-foreign')).rejects.toBeInstanceOf(
        LegalDocumentNotFoundError,
      );
    });

    it('blocks download when integrity status is blocking', async () => {
      const h = createLegalDocumentActivationHarness();
      const row = h.seedApproved({
        id: 'dl-integrity',
        organizationId: 'org-a',
        documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
        versionLabel: 'v1',
      });
      row.integrityStatus = LEGAL_DOCUMENT_INTEGRITY_STATUS.CHECKSUM_MISMATCH;
      const svc = makeLegalSvc(h);

      await expect(svc.getDownload('org-a', 'dl-integrity')).rejects.toBeInstanceOf(
        LegalDocumentIntegrityUnavailableError,
      );
    });

    it('blocks download on hash mismatch when verify-on-download is enabled', async () => {
      const h = createLegalDocumentActivationHarness();
      const checksum = createHash('sha256').update(buf).digest('hex');
      const row = h.seedApproved({
        id: 'dl-hash',
        organizationId: 'org-a',
        documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
        versionLabel: 'v1',
      });
      row.checksum = checksum;
      row.integrityStatus = LEGAL_DOCUMENT_INTEGRITY_STATUS.UNVERIFIED;

      const checksumVerification = {
        verify: jest.fn().mockResolvedValue({
          status: LEGAL_DOCUMENT_INTEGRITY_STATUS.CHECKSUM_MISMATCH,
          detail: 'Mismatch',
          expectedChecksum: checksum,
          actualChecksum: 'deadbeef',
          checkedAt: new Date(),
        }),
        isBlockingStatus: jest.fn().mockReturnValue(true),
      };
      const integrityPersistence = {
        applyVerificationResult: jest.fn().mockImplementation(async (doc) => doc),
        markUnexpectedObject: jest.fn(),
      };

      const svc = makeLegalSvc(h, {
        checksumVerification,
        integrityPersistence,
        config: { integrityVerifyOnDownload: true },
      });

      await expect(svc.getDownload('org-a', 'dl-hash')).rejects.toBeInstanceOf(
        LegalDocumentIntegrityUnavailableError,
      );
    });

    it('blocks download when storage object is missing', async () => {
      const h = createLegalDocumentActivationHarness();
      h.seedApproved({
        id: 'dl-missing',
        organizationId: 'org-a',
        documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
        versionLabel: 'v1',
      });

      const storage = {
        getObjectStream: jest.fn().mockRejectedValue(new NotFoundException('Object not found')),
      };
      const svc = makeLegalSvc(h, { storage });

      await expect(svc.getDownload('org-a', 'dl-missing')).rejects.toThrow();
    });
  });

  describe('delivery evidence idempotency', () => {
    it('returns existing row on duplicate requestId without second insert', async () => {
      const existing = {
        id: 'ev-dup',
        organizationId: 'org-a',
        bookingId: 'bk-1',
        customerId: 'cust-1',
        legalDocumentId: 'legal-1',
        generatedDocumentId: 'gen-1',
        documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
        versionLabel: 'v1',
        language: 'de',
        checksum: 'sha',
        presentedAt: new Date(),
        deliveryChannel: 'PORTAL',
        deliveryStatus: 'PRESENTED',
        deliveredAt: null,
        acknowledgedAt: null,
        acknowledgmentMethod: null,
        signatureReference: null,
        actorUserId: 'user-1',
        recipientSnapshot: { customerId: 'cust-1' },
        requestId: 'req-dup-sec',
        outboundEmailId: null,
        createdAt: new Date(),
      };
      const prisma = {
        booking: { findFirst: jest.fn().mockResolvedValue({ id: 'bk-1', customerId: 'cust-1' }) },
        generatedDocument: { findFirst: jest.fn().mockResolvedValue({ id: 'gen-1' }) },
        legalDocumentDeliveryEvidence: {
          findFirst: jest.fn().mockResolvedValue(existing),
          create: jest.fn(),
        },
      };
      const svc = new LegalDocumentDeliveryEvidenceService(prisma as never);

      const result = await svc.recordPresentation(
        {
          organizationId: 'org-a',
          bookingId: 'bk-1',
          customerId: 'cust-1',
          legalDocumentId: 'legal-1',
          generatedDocumentId: 'gen-1',
          documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
          versionLabel: 'v1',
          language: 'de',
          checksum: 'sha',
          deliveryChannel: 'PORTAL',
          recipientSnapshot: { customerId: 'cust-1' },
          requestId: 'req-dup-sec',
        },
        { userId: 'user-1' },
      );

      expect(result.id).toBe('ev-dup');
      expect(prisma.legalDocumentDeliveryEvidence.create).not.toHaveBeenCalled();
    });

    it('rejects evidence mutation for foreign-tenant evidence id', async () => {
      const prisma = {
        legalDocumentDeliveryEvidence: { findFirst: jest.fn().mockResolvedValue(null) },
      };
      const svc = new LegalDocumentDeliveryEvidenceService(prisma as never);

      await expect(
        svc.getById('org-a', 'ev-in-org-b'),
      ).rejects.toMatchObject({
        code: LEGAL_DELIVERY_EVIDENCE_ERROR_CODE.NOT_FOUND,
      });
    });
  });

  describe('resolver conflict', () => {
    it('surfaces scope conflict when two equal-priority ACTIVE candidates match', () => {
      const result = resolveLegalDocuments({
        context: {
          organizationId: 'org-a',
          bookingId: 'bk-1',
          customerLanguage: 'de',
          customerSegment: 'B2C',
          jurisdiction: 'DE',
          bookingChannel: 'WEBSITE',
          productScope: 'RENTAL',
          stationId: 'st-1',
          effectiveTimestamp: '2026-06-15T12:00:00.000Z',
        },
        candidates: [
          {
            id: 'c1',
            organizationId: 'org-a',
            documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
            legalVariant: null,
            title: 'AGB A',
            versionLabel: 'v1',
            language: 'de',
            jurisdictionCountry: 'DE',
            customerSegment: 'BOTH',
            bookingChannel: 'ALL',
            productScope: null,
            stationScopeMode: 'ORGANIZATION_WIDE',
            stationIds: [],
            priority: 0,
            isMandatory: true,
            noticePurpose: 'TERMS_AND_CONDITIONS',
            status: 'ACTIVE',
            validFrom: null,
            validUntil: null,
            integrityStatus: 'VERIFIED',
            integrityUnavailable: false,
          },
          {
            id: 'c2',
            organizationId: 'org-a',
            documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
            legalVariant: null,
            title: 'AGB B',
            versionLabel: 'v2',
            language: 'de',
            jurisdictionCountry: 'DE',
            customerSegment: 'BOTH',
            bookingChannel: 'ALL',
            productScope: null,
            stationScopeMode: 'ORGANIZATION_WIDE',
            stationIds: [],
            priority: 0,
            isMandatory: true,
            noticePurpose: 'TERMS_AND_CONDITIONS',
            status: 'ACTIVE',
            validFrom: null,
            validUntil: null,
            integrityStatus: 'VERIFIED',
            integrityUnavailable: false,
          },
        ],
        documentTypes: [DOCUMENT_TYPE.TERMS_AND_CONDITIONS],
      });

      expect(result.conflicts).toHaveLength(1);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: LEGAL_DOCUMENT_RESOLVER_ERROR_CODES.SCOPE_CONFLICT,
            documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
          }),
        ]),
      );
      expect(result.selectedDocuments).toHaveLength(0);
    });
  });

  describe('pickup gate cross-tenant', () => {
    it('blocks pickup when booking belongs to another organization', async () => {
      const prisma = {
        booking: {
          findFirst: jest.fn().mockResolvedValue(null),
        },
        customer: { findFirst: jest.fn() },
        generatedDocument: { count: jest.fn() },
        bookingDocumentGenerationJob: { count: jest.fn() },
        legalDocumentDeliveryEvidence: { findMany: jest.fn() },
      };
      const audit = { appendBlocked: jest.fn().mockResolvedValue({ id: 'audit-1' }) };
      const gate = new BookingPickupGateService(
        prisma as never,
        { evaluateForBooking: jest.fn() } as never,
        { evaluateForBooking: jest.fn() } as never,
        audit as never,
      );

      await expect(
        gate.assertPickupAllowed({
          organizationId: 'org-a',
          bookingId: 'bk-in-org-b',
          actor: { userId: 'u1', displayName: 'Op', membershipRole: 'ORG_MEMBER' },
          payload: { documentsAcknowledged: true },
        }),
      ).rejects.toBeInstanceOf(PickupGateBlockedException);
    });
  });

  describe('parallel activation conflict', () => {
    it('returns ACTIVE_CONFLICT when two versions activate concurrently', async () => {
      const h = createLegalDocumentActivationHarness();
      h.seedApproved({
        id: 'v-a',
        organizationId: 'org-a',
        documentType: DOCUMENT_TYPE.WITHDRAWAL_INFORMATION,
        versionLabel: 'A',
      });
      h.seedApproved({
        id: 'v-b',
        organizationId: 'org-a',
        documentType: DOCUMENT_TYPE.WITHDRAWAL_INFORMATION,
        versionLabel: 'B',
      });
      const svc = makeLegalSvc(h);

      const results = await h.withConcurrentTransactions(() =>
        Promise.allSettled([svc.activate('org-a', 'v-a'), svc.activate('org-a', 'v-b')]),
      );

      const rejected = results.filter((r) => r.status === 'rejected');
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason.getResponse()).toEqual(
        expect.objectContaining({ code: LEGAL_DOCUMENT_ERROR_CODES.ACTIVE_CONFLICT }),
      );
      expect(h.countActive('org-a', DOCUMENT_TYPE.WITHDRAWAL_INFORMATION, 'de')).toBe(1);
    });
  });
});
