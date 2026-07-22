import legalDocumentRetentionConfig from '@config/legal-document-retention.config';
import { LegalDocumentRetentionService } from './legal-document-retention.service';
import { LegalDocumentRetentionPolicyService } from './legal-document-retention-policy.service';
import { LegalDocumentRetentionReferenceService } from './legal-document-retention-reference.service';
import { LegalDocumentLegalHoldService } from './legal-document-legal-hold.service';
import { DOCUMENTS_STORAGE } from '../storage/document-storage.interface';
import { LegalDocumentEventsService } from '../legal-document-events.service';
import { LEGAL_DOCUMENT_RETENTION_CLASS } from './legal-document-retention.constants';

describe('LegalDocumentRetentionService', () => {
  const orgA = 'org-a';
  const orgB = 'org-b';
  const docId = 'doc-1';

  const config = {
    enabled: true,
    dryRun: false,
    batchSize: 50,
    maxBatchesPerRun: 10,
    policyVersion: 'test',
    days: {
      legalMasterAfterArchive: 30,
      bookingSnapshot: 30,
      deliveryEvidenceRecipientRedaction: 30,
      quarantineTemp: 7,
      auditEvent: 0,
    },
  };

  const storage = {
    deleteObject: jest.fn().mockResolvedValue(undefined),
  };

  const events = {
    appendInTransaction: jest.fn().mockResolvedValue({}),
  };

  let prisma: {
    legalDocumentRetentionPurgeRun: { create: jest.Mock; update: jest.Mock };
    organizationLegalDocument: { findMany: jest.Mock; update: jest.Mock; findFirst: jest.Mock };
    generatedDocument: { findMany: jest.Mock; update: jest.Mock; count: jest.Mock };
    legalDocumentDeliveryEvidence: { findMany: jest.Mock; update: jest.Mock; count: jest.Mock };
    bookingDocumentBundle: { count: jest.Mock };
    rentalContract: { count: jest.Mock };
    outboundEmailAttachment: { count: jest.Mock };
    orgInvoice: { count: jest.Mock };
    organizationLegalDocumentRetentionPolicy: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  };

  let policy: LegalDocumentRetentionPolicyService;
  let references: LegalDocumentRetentionReferenceService;
  let legalHold: LegalDocumentLegalHoldService;
  let svc: LegalDocumentRetentionService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = {
      legalDocumentRetentionPurgeRun: {
        create: jest.fn().mockResolvedValue({ id: 'run-1' }),
        update: jest.fn().mockResolvedValue({}),
      },
      organizationLegalDocument: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
        findFirst: jest.fn().mockResolvedValue({
          id: docId,
          organizationId: orgA,
          status: 'ARCHIVED',
        }),
      },
      generatedDocument: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
        count: jest.fn().mockResolvedValue(0),
      },
      legalDocumentDeliveryEvidence: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
        count: jest.fn().mockResolvedValue(0),
      },
      bookingDocumentBundle: { count: jest.fn().mockResolvedValue(0) },
      rentalContract: { count: jest.fn().mockResolvedValue(0) },
      outboundEmailAttachment: { count: jest.fn().mockResolvedValue(0) },
      orgInvoice: { count: jest.fn().mockResolvedValue(0) },
      organizationLegalDocumentRetentionPolicy: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(prisma)),
    };

    policy = new LegalDocumentRetentionPolicyService(
      prisma as never,
      config as never,
    );
    references = new LegalDocumentRetentionReferenceService(prisma as never);
    legalHold = new LegalDocumentLegalHoldService(prisma as never, events as never);
    svc = new LegalDocumentRetentionService(
      prisma as never,
      config as never,
      storage as never,
      policy,
      references,
      legalHold,
      events as never,
    );
  });

  it('skips master purge when active delivery evidence references exist', async () => {
    prisma.organizationLegalDocument.findMany.mockResolvedValue([
      {
        id: docId,
        organizationId: orgA,
        objectKey: 'org-a/legal/master.pdf',
        status: 'ARCHIVED',
        legalHold: false,
        retainUntil: null,
      },
    ]);
    prisma.legalDocumentDeliveryEvidence.count.mockResolvedValue(2);
    prisma.generatedDocument.count.mockResolvedValue(0);

    const report = await svc.runOnce({ trigger: 'manual', dryRun: false, organizationId: orgA });

    const masterPhase = report.phases.find((p) => p.phase === 'legal_master_storage');
    expect(masterPhase?.skipped).toBe(1);
    expect(masterPhase?.affected).toBe(0);
    expect(storage.deleteObject).not.toHaveBeenCalled();
  });

  it('records storage purge failure on master document', async () => {
    prisma.organizationLegalDocument.findMany.mockResolvedValue([
      {
        id: docId,
        organizationId: orgA,
        objectKey: 'org-a/legal/master.pdf',
        status: 'ARCHIVED',
        legalHold: false,
        retainUntil: null,
      },
    ]);
    prisma.legalDocumentDeliveryEvidence.count.mockResolvedValue(0);
    prisma.generatedDocument.count.mockResolvedValue(0);
    storage.deleteObject.mockRejectedValueOnce(new Error('S3 access denied'));

    const report = await svc.runOnce({ trigger: 'manual', dryRun: false, organizationId: orgA });

    const masterPhase = report.phases.find((p) => p.phase === 'legal_master_storage');
    expect(masterPhase?.failed).toBe(1);
    expect(prisma.organizationLegalDocument.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: docId, organizationId: orgA },
        data: expect.objectContaining({ storagePurgeError: 'S3 access denied' }),
      }),
    );
  });

  it('does not purge another tenant when organizationId is scoped', async () => {
    prisma.organizationLegalDocument.findMany.mockImplementation(({ where }) => {
      expect(where.organizationId).toBe(orgA);
      return Promise.resolve([]);
    });

    await svc.runOnce({ trigger: 'manual', dryRun: true, organizationId: orgA });

    expect(prisma.organizationLegalDocument.findMany).toHaveBeenCalled();
    const calls = prisma.organizationLegalDocument.findMany.mock.calls;
    expect(calls.every((c) => c[0].where.organizationId === orgA)).toBe(true);
    expect(calls.some((c) => c[0].where.organizationId === orgB)).toBe(false);
  });

  it('dry-run does not delete storage objects', async () => {
    prisma.organizationLegalDocument.findMany.mockResolvedValue([
      {
        id: docId,
        organizationId: orgA,
        objectKey: 'org-a/legal/master.pdf',
        status: 'ARCHIVED',
        legalHold: false,
        retainUntil: null,
      },
    ]);

    const report = await svc.runOnce({ trigger: 'manual', dryRun: true, organizationId: orgA });

    expect(report.dryRun).toBe(true);
    expect(storage.deleteObject).not.toHaveBeenCalled();
    expect(prisma.organizationLegalDocument.update).not.toHaveBeenCalled();
  });

  it('skips purge when legal hold is active', async () => {
    prisma.organizationLegalDocument.findMany.mockResolvedValue([
      {
        id: docId,
        organizationId: orgA,
        objectKey: 'org-a/legal/master.pdf',
        status: 'ARCHIVED',
        legalHold: true,
        retainUntil: null,
      },
    ]);

    const report = await svc.runOnce({ trigger: 'manual', dryRun: false, organizationId: orgA });
    const masterPhase = report.phases.find((p) => p.phase === 'legal_master_storage');
    expect(masterPhase?.skipped).toBe(1);
    expect(storage.deleteObject).not.toHaveBeenCalled();
  });

  it('blocks generated document purge when bundle pointer exists', async () => {
    prisma.generatedDocument.findMany.mockResolvedValue([
      {
        id: 'gen-1',
        organizationId: orgA,
        objectKey: 'org-a/booking/snap.pdf',
        legalHold: false,
        retainUntil: null,
      },
    ]);
    prisma.bookingDocumentBundle.count.mockResolvedValue(1);

    const report = await svc.runOnce({ trigger: 'manual', dryRun: false, organizationId: orgA });
    const phase = report.phases.find((p) => p.phase === 'booking_snapshot_storage');
    expect(phase?.skipped).toBe(1);
    expect(storage.deleteObject).not.toHaveBeenCalled();
  });
});

describe('LegalDocumentRetentionPolicyService', () => {
  it('uses org override days instead of platform default', async () => {
    const prisma = {
      organizationLegalDocumentRetentionPolicy: {
        findUnique: jest.fn().mockResolvedValue({
          classPolicies: {
            [LEGAL_DOCUMENT_RETENTION_CLASS.LEGAL_MASTER]: { retentionDays: 1825 },
          },
        }),
      },
    };
    const svc = new LegalDocumentRetentionPolicyService(
      prisma as never,
      legalDocumentRetentionConfig() as never,
    );
    const policy = await svc.resolveClassPolicy('org-1', LEGAL_DOCUMENT_RETENTION_CLASS.LEGAL_MASTER);
    expect(policy.retentionDays).toBe(1825);
  });
});
